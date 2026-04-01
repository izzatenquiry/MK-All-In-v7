/**
 * VEOLY-AI desktop shell: starts local stack (Flask :1247, proxy :3001, bridge :6003)
 * then opens the built Vite app (dist/) over file://.
 *
 * Window opens IMMEDIATELY with a splash screen so the .exe never looks "dead" while services start.
 */
const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const STACK_BRAND = process.env.VEOLY_STACK_BRAND || 'veoly';
const USE_DEV_SERVER = process.env.ELECTRON_DEV_SERVER === '1';
const SKIP_LOCAL_STACK = process.env.ELECTRON_SKIP_LOCAL_STACK === '1';
const DEBUG_SERVICES = process.env.ELECTRON_DEBUG_SERVICES === '1';

const BACKEND_PORT = 1247;
const PROXY_PORT = 3001;
const BRIDGE_PORT = 6003;

/** Max wait per HTTP check loop (each service checked sequentially). */
const PER_SERVICE_TIMEOUT_MS = 120000;
const WAIT_INTERVAL_MS = 500;

/** @type {import('child_process').ChildProcess[]} */
const childProcesses = [];

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;

/** True after local stack has started successfully (macOS: avoid duplicate spawns on reopen). */
let stackReady = false;

process.on('uncaughtException', (err) => {
  console.error('[Electron main] uncaughtException:', err);
  try {
    dialog.showErrorBox('VEOLY-AI — startup error', err?.message || String(err));
  } catch (_) {
    /* ignore */
  }
});

/**
 * Folder that contains backend/, server/, captcha_server/ (and usually dist/).
 * Supports ELECTRON GEN layout: electron/../new version/backend/...
 * Override: set VEOLY_PROJECT_ROOT to that folder.
 */
function resourcesRoot() {
  if (process.env.VEOLY_PROJECT_ROOT) {
    const forced = String(process.env.VEOLY_PROJECT_ROOT).trim();
    if (fs.existsSync(path.join(forced, 'backend', 'web_dashboard.py'))) {
      return forced;
    }
  }

  if (app.isPackaged) {
    const res = process.resourcesPath;
    const nested = path.join(res, 'new version');
    if (fs.existsSync(path.join(nested, 'backend', 'web_dashboard.py'))) {
      return nested;
    }
    if (fs.existsSync(path.join(res, 'backend', 'web_dashboard.py'))) {
      return res;
    }
    const unpacked = path.join(res, 'app.asar.unpacked');
    if (fs.existsSync(path.join(unpacked, 'backend', 'web_dashboard.py'))) {
      return unpacked;
    }
    return res;
  }

  const parent = path.join(__dirname, '..');
  const newVersion = path.join(parent, 'new version');
  if (fs.existsSync(path.join(newVersion, 'backend', 'web_dashboard.py'))) {
    return newVersion;
  }
  if (fs.existsSync(path.join(parent, 'backend', 'web_dashboard.py'))) {
    return parent;
  }
  return parent;
}

function backendDir() {
  return path.join(resourcesRoot(), 'backend');
}

function serverDir() {
  return path.join(resourcesRoot(), 'server');
}

function captchaDir() {
  return path.join(resourcesRoot(), 'captcha_server');
}

function resolveDistIndexHtml() {
  const candidates = [
    path.join(resourcesRoot(), 'dist', 'index.html'),
    path.join(__dirname, '..', 'new version', 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
    path.join(app.getAppPath(), 'dist', 'index.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * True if venv's pyvenv.cfg "home" base interpreter still exists.
 * If the user moved/uninstalled Python, venv\\Scripts\\python.exe still exists but fails with
 * "No Python at ..." — we must not use it.
 */
function isBackendVenvPythonUsable(backendRoot) {
  const cfgPath = path.join(backendRoot, 'venv', 'pyvenv.cfg');
  if (!fs.existsSync(cfgPath)) return true;
  try {
    const cfg = fs.readFileSync(cfgPath, 'utf8');
    const m = cfg.match(/^home\s*=\s*(.+)$/m);
    if (!m) return true;
    const home = m[1].trim();
    const win = process.platform === 'win32';
    const baseExe = win ? path.join(home, 'python.exe') : path.join(home, 'bin', 'python3');
    return fs.existsSync(baseExe);
  } catch {
    return true;
  }
}

function resolvePythonExecutable() {
  const backend = backendDir();
  const win = process.platform === 'win32';

  if (process.env.VEOLY_PYTHON && fs.existsSync(process.env.VEOLY_PYTHON)) {
    return process.env.VEOLY_PYTHON;
  }
  if (process.env.PYTHON && fs.existsSync(process.env.PYTHON)) {
    return process.env.PYTHON;
  }

  const venvPy = win
    ? path.join(backend, 'venv', 'Scripts', 'python.exe')
    : path.join(backend, 'venv', 'bin', 'python3');
  if (venvPy && fs.existsSync(venvPy) && isBackendVenvPythonUsable(backend)) {
    return venvPy;
  }
  if (venvPy && fs.existsSync(venvPy)) {
    console.warn(
      '[Electron main] backend/venv exists but base Python from pyvenv.cfg is missing — use system python. Recreate venv: cd backend && python -m venv venv'
    );
  }

  return win ? 'python' : 'python3';
}

function resolveNodeExecutable() {
  if (process.env.VEOLY_NODE_PATH && fs.existsSync(process.env.VEOLY_NODE_PATH)) {
    return process.env.VEOLY_NODE_PATH;
  }
  if (app.isPackaged) {
    const bundled = path.join(path.dirname(process.execPath), 'node.exe');
    if (fs.existsSync(bundled)) return bundled;
  }
  return 'node';
}

function stdioForService() {
  if (DEBUG_SERVICES) return 'inherit';
  return 'ignore';
}

function killProcessTree(child) {
  if (!child || child.exitCode != null) return;
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
      windowsHide: true,
      stdio: 'ignore',
      detached: true,
    }).unref();
  } else {
    child.kill('SIGTERM');
  }
}

/** Fail fast if executable missing; timeout if spawn never completes. */
function assertChildSpawned(child, label, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: spawn timeout (${ms}ms)`)), ms);
    child.once('error', (err) => {
      clearTimeout(t);
      reject(new Error(`${label}: ${err.message}`));
    });
    child.once('spawn', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

function startBackend() {
  const cwd = backendDir();
  if (!fs.existsSync(path.join(cwd, 'web_dashboard.py'))) {
    throw new Error(`Backend not found at ${cwd}. For packaged builds, ensure extraResources includes backend.`);
  }
  const py = resolvePythonExecutable();
  const env = { ...process.env };
  env.BRAND = STACK_BRAND || 'veoly';
  const child = spawn(py, ['web_dashboard.py'], {
    cwd,
    env,
    windowsHide: !DEBUG_SERVICES,
    stdio: DEBUG_SERVICES ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  attachBackendStderrLog(child);
  child.on('error', (err) => console.error('[Electron main] Backend spawn error:', err.message));
  childProcesses.push(child);
  return child;
}

function startProxyServer() {
  const cwd = serverDir();
  if (!fs.existsSync(path.join(cwd, 'index.js'))) {
    throw new Error(`Node proxy not found at ${cwd}.`);
  }
  const node = resolveNodeExecutable();
  const env = { ...process.env, PORT: String(PROXY_PORT) };
  const child = spawn(node, ['index.js'], {
    cwd,
    env,
    windowsHide: !DEBUG_SERVICES,
    stdio: stdioForService(),
  });
  child.on('error', (err) => console.error('[Electron main] Proxy spawn error:', err.message));
  childProcesses.push(child);
  return child;
}

function startBridge() {
  const cwd = captchaDir();
  if (!fs.existsSync(path.join(cwd, 'bridge-server.js'))) {
    throw new Error(`Bridge not found at ${cwd}.`);
  }
  const node = resolveNodeExecutable();
  const child = spawn(node, ['bridge-server.js', `--port=${BRIDGE_PORT}`], {
    cwd,
    env: { ...process.env },
    windowsHide: !DEBUG_SERVICES,
    stdio: stdioForService(),
  });
  child.on('error', (err) => console.error('[Electron main] Bridge spawn error:', err.message));
  childProcesses.push(child);
  return child;
}

function waitForHttp(url, label, maxMs = PER_SERVICE_TIMEOUT_MS) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() - start > maxMs) {
        reject(
          new Error(
            `Timeout (${Math.round(maxMs / 1000)}s) waiting for ${label} — ${url}\n` +
              `If Flask never starts: open Command Prompt, cd to backend, run: python web_dashboard.py\n` +
              `Check log: ${path.join(app.getPath('userData'), 'electron-backend-stderr.log')}`
          )
        );
        return;
      }
      let u;
      try {
        u = new URL(url);
      } catch (e) {
        reject(e);
        return;
      }
      const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
      const req = http.request(
        {
          hostname: u.hostname,
          port,
          path: (u.pathname || '/') + (u.search || ''),
          method: 'GET',
          timeout: 2500,
        },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on('error', () => setTimeout(attempt, WAIT_INTERVAL_MS));
      req.on('timeout', () => {
        req.destroy();
        setTimeout(attempt, WAIT_INTERVAL_MS);
      });
      req.end();
    };
    attempt();
  });
}

/** If the service process dies (e.g. Python import error), fail immediately instead of hanging. */
function waitForHttpOrExit(child, url, label, serviceName, maxMs = PER_SERVICE_TIMEOUT_MS) {
  return Promise.race([
    waitForHttp(url, label, maxMs),
    new Promise((_, reject) => {
      child.once('exit', (code, signal) => {
        if (code !== 0 && code != null) {
          reject(
            new Error(
              `${serviceName} process exited with code ${code}${signal ? ` (${signal})` : ''}.\n` +
                `Often: missing Python packages — in folder "backend" run: pip install -r requirements.txt\n` +
                `Stderr log: ${path.join(app.getPath('userData'), 'electron-backend-stderr.log')}`
            )
          );
        }
      });
    }),
  ]);
}

function updateSplash(win, title, subtitle) {
  if (!win || win.isDestroyed()) return;
  const safe = (s) => JSON.stringify(s ?? '');
  win.webContents
    .executeJavaScript(
      `(function(){var t=document.getElementById('t');var s=document.getElementById('s');if(t)t.textContent=${safe(title)};if(s)s.textContent=${safe(subtitle)};})();`
    )
    .catch(() => {});
}

function attachBackendStderrLog(child) {
  if (DEBUG_SERVICES || !child || !child.stderr) return;
  const logPath = path.join(app.getPath('userData'), 'electron-backend-stderr.log');
  let buf = '';
  child.stderr.on('data', (chunk) => {
    buf += chunk.toString();
    if (buf.length > 12000) buf = buf.slice(-8000);
    try {
      fs.writeFileSync(logPath, buf, 'utf8');
    } catch (_) {
      /* ignore */
    }
  });
}

async function startLocalStack(win) {
  let tick = null;
  const t0 = Date.now();
  try {
    tick = setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      updateSplash(win, 'Starting local services…', `${sec}s — Flask :${BACKEND_PORT} · Proxy :${PROXY_PORT} · Bridge :${BRIDGE_PORT}`);
    }, 1000);

    updateSplash(win, 'Starting Python (Flask)…', backendDir());
    const b = startBackend();
    await assertChildSpawned(b, 'Backend (Python)');
    await new Promise((r) => setTimeout(r, 4000));

    updateSplash(win, 'Starting Node proxy…', serverDir());
    const s = startProxyServer();
    await assertChildSpawned(s, 'Node proxy');
    await new Promise((r) => setTimeout(r, 1500));

    updateSplash(win, 'Starting Bridge (reCAPTCHA)…', captchaDir());
    const br = startBridge();
    await assertChildSpawned(br, 'Bridge');
    await new Promise((r) => setTimeout(r, 1000));

    updateSplash(win, 'Waiting for Flask :1247…', 'If this takes long, check Python / backend venv.');
    await waitForHttpOrExit(b, `http://127.0.0.1:${BACKEND_PORT}/`, 'Flask backend', 'Backend (Flask)');

    updateSplash(win, 'Waiting for proxy :3001…', '');
    await waitForHttpOrExit(s, `http://127.0.0.1:${PROXY_PORT}/health`, 'Node proxy', 'Node proxy');

    updateSplash(win, 'Waiting for Bridge :6003…', '');
    await waitForHttpOrExit(br, `http://127.0.0.1:${BRIDGE_PORT}/status`, 'Bridge server', 'Bridge');

    stackReady = true;
  } finally {
    if (tick) clearInterval(tick);
  }
}

function createSplashWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 340,
    show: true,
    center: true,
    title: 'VEOLY-AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>VEOLY-AI</title><style>
    body{font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(145deg,#0f172a,#1e293b);color:#e2e8f0;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;}
    .box{text-align:center;padding:24px;max-width:460px;}
    h1#t{font-size:1.05rem;font-weight:600;margin:0 0 8px;}
    p#s{opacity:.9;font-size:13px;line-height:1.45;margin:0;word-break:break-word;}
    .hint{margin-top:14px;font-size:11px;opacity:.55;}
  </style></head><body><div class="box"><h1 id="t">Starting local services…</h1><p id="s">Flask :${BACKEND_PORT} · Proxy :${PROXY_PORT} · Bridge :${BRIDGE_PORT}</p><p class="hint">Progress updates every second. If stuck &gt;2 min, see error or log in Electron userData (electron-backend-stderr.log).</p></div></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return win;
}

function loadMainApp(win) {
  if (USE_DEV_SERVER) {
    win.setBounds({ width: 1440, height: 900 });
    win.setMinimumSize(1024, 700);
    win.loadURL('http://localhost:8080');
    win.webContents.openDevTools({ mode: 'detach' });
    return;
  }
  const distPath = resolveDistIndexHtml();
  if (!distPath) {
    throw new Error(
      'dist/index.html not found. Run: npm run build\nChecked: electron/../dist and app.asar/dist.'
    );
  }
  win.setBounds({ width: 1440, height: 900 });
  win.setMinimumSize(1024, 700);
  win.loadFile(distPath);
}

function loadErrorPage(win, message) {
  const safe = String(message)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title><style>
    body{font-family:system-ui,sans-serif;background:#450a0a;color:#fecaca;padding:24px;max-width:560px;margin:40px auto;}
    h1{font-size:1.1rem;} pre{white-space:pre-wrap;font-size:13px;background:#1c1917;padding:12px;border-radius:8px;}
  </style></head><body><h1>Local services did not start</h1><pre>${safe}</pre>
  <p style="font-size:13px;opacity:.9">Install Python + Node, run install.bat (venv), free ports ${BACKEND_PORT} / ${PROXY_PORT} / ${BRIDGE_PORT}. Set ELECTRON_DEBUG_SERVICES=1 for logs.</p></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

async function openApp() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = createSplashWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  try {
    if (!SKIP_LOCAL_STACK) {
      if (!stackReady) {
        await startLocalStack(mainWindow);
      }
    }
    loadMainApp(mainWindow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Electron main] Stack failed:', msg);
    try {
      dialog.showErrorBox('VEOLY-AI — services failed', msg);
    } catch (_) {
      /* ignore */
    }
    loadErrorPage(mainWindow, msg);
  }
}

async function bootstrap() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });

  app.on('before-quit', () => {
    for (const c of childProcesses) {
      killProcessTree(c);
    }
  });

  await app.whenReady();
  await openApp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openApp();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

bootstrap();
