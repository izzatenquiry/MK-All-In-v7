import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import puppeteer from 'puppeteer';

const DEFAULT_URL = 'https://labs.google/fx/tools/flow';
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_WAIT_MS = 120000;

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    out: path.resolve(process.cwd(), 'veo-puppeteer-debug-output.json'),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    waitMs: DEFAULT_WAIT_MS,
    email: '',
    password: '',
    headless: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url' && argv[i + 1]) args.url = argv[++i];
    else if (arg === '--out' && argv[i + 1]) args.out = path.resolve(process.cwd(), argv[++i]);
    else if (arg === '--timeout' && argv[i + 1]) args.timeoutMs = Number(argv[++i]) || DEFAULT_TIMEOUT_MS;
    else if (arg === '--wait-ms' && argv[i + 1]) args.waitMs = Number(argv[++i]) || DEFAULT_WAIT_MS;
    else if (arg === '--email' && argv[i + 1]) args.email = argv[++i];
    else if (arg === '--password' && argv[i + 1]) args.password = argv[++i];
    else if (arg === '--headless') args.headless = true;
  }

  return args;
}

async function waitForEnter(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    await rl.question(`${message}\n`);
  } finally {
    rl.close();
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isTargetRequest(url, method) {
  if (method !== 'POST') return false;
  return (
    url.includes('/v1/flow/generate') ||
    url.includes('/v1/flow/longrunning') ||
    url.includes('/v1/flow/uploadImage') ||
    url.includes('aisandbox-pa.googleapis.com') ||
    url.includes('/api/veo/generate-i2v') ||
    url.includes('/api/veo/generate-t2v') ||
    url.includes('/api/veo/upload')
  );
}

async function tryAutoLogin(page, email, password) {
  if (!email || !password) return;

  const emailSelectors = [
    'input[type="email"]',
    'input[name="identifier"]',
    'input[name="email"]',
    '#identifierId',
  ];
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[name="Passwd"]',
  ];
  const submitSelectors = [
    'button[type="submit"]',
    '#identifierNext button',
    '#passwordNext button',
    'button[jsname="LgbsSe"]',
  ];

  // Fill email
  let emailFilled = false;
  for (const sel of emailSelectors) {
    const el = await page.$(sel);
    if (el) {
      await page.click(sel, { clickCount: 3 }).catch(() => {});
      await page.type(sel, email, { delay: 20 });
      emailFilled = true;
      break;
    }
  }
  if (!emailFilled) {
    console.log('[VEO Debug] Auto-login: email field not found, skip.');
    return;
  }

  // Submit email step
  let submitted = false;
  for (const sel of submitSelectors) {
    const btn = await page.$(sel);
    if (btn) {
      await page.click(sel).catch(() => {});
      submitted = true;
      break;
    }
  }
  if (!submitted) {
    await page.keyboard.press('Enter').catch(() => {});
  }

  // Wait for password field
  let passwordSelectorFound = null;
  for (let i = 0; i < 20; i += 1) {
    for (const sel of passwordSelectors) {
      const pw = await page.$(sel);
      if (pw) {
        passwordSelectorFound = sel;
        break;
      }
    }
    if (passwordSelectorFound) break;
    await sleep(500);
  }

  if (!passwordSelectorFound) {
    console.log('[VEO Debug] Auto-login: password field not found, skip.');
    return;
  }

  await page.click(passwordSelectorFound, { clickCount: 3 }).catch(() => {});
  await page.type(passwordSelectorFound, password, { delay: 20 });

  // Submit password step
  let passwordSubmitted = false;
  for (const sel of submitSelectors) {
    const btn = await page.$(sel);
    if (btn) {
      await page.click(sel).catch(() => {});
      passwordSubmitted = true;
      break;
    }
  }
  if (!passwordSubmitted) {
    await page.keyboard.press('Enter').catch(() => {});
  }

  console.log('[VEO Debug] Auto-login flow attempted.');
}

const args = parseArgs(process.argv);
const captured = [];
let browser;

try {
  console.log('[VEO Debug] Launching browser...');
  browser = await puppeteer.launch({
    headless: args.headless,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');

  cdp.on('Network.requestWillBeSent', (evt) => {
    try {
      const method = evt.request?.method || '';
      const url = evt.request?.url || '';
      if (!isTargetRequest(url, method)) return;
      captured.push({
        ts: new Date().toISOString(),
        type: 'cdp-request',
        requestId: evt.requestId,
        url,
        method,
        headers: evt.request?.headers || {},
        postData: safeJsonParse(evt.request?.postData) || evt.request?.postData || null,
      });
    } catch (error) {
      captured.push({
        ts: new Date().toISOString(),
        type: 'internal-error',
        where: 'cdp-request',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  cdp.on('Network.responseReceived', async (evt) => {
    try {
      const method = evt.response?.requestHeadersText?.includes('POST') ? 'POST' : '';
      const url = evt.response?.url || '';
      if (!(url.includes('aisandbox-pa.googleapis.com') || url.includes('/api/veo/'))) return;
      const bodyResult = await cdp.send('Network.getResponseBody', { requestId: evt.requestId }).catch(() => null);
      const bodyText = bodyResult?.body || null;
      captured.push({
        ts: new Date().toISOString(),
        type: 'cdp-response',
        requestId: evt.requestId,
        url,
        method: method || 'UNKNOWN',
        status: evt.response?.status,
        headers: evt.response?.headers || {},
        body: safeJsonParse(bodyText) || bodyText,
      });
    } catch (error) {
      captured.push({
        ts: new Date().toISOString(),
        type: 'internal-error',
        where: 'cdp-response',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  page.on('request', async (req) => {
    let shouldContinue = true;
    try {
      const url = req.url();
      const method = req.method();
      const isTarget = isTargetRequest(url, method);

      if (!isTarget) {
        shouldContinue = true;
        return;
      }

      captured.push({
        ts: new Date().toISOString(),
        type: 'request',
        url,
        method,
        headers: req.headers(),
        postData: safeJsonParse(req.postData()) || req.postData() || null,
      });
    } catch (error) {
      captured.push({
        ts: new Date().toISOString(),
        type: 'internal-error',
        where: 'request-handler',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (shouldContinue) {
        await req.continue();
      }
    }
  });

  page.on('response', async (res) => {
    try {
      const url = res.url();
      const method = res.request().method();
      const isTarget = isTargetRequest(url, method);
      if (!isTarget) return;

      const text = await res.text().catch(() => null);
      captured.push({
        ts: new Date().toISOString(),
        type: 'response',
        url,
        method,
        status: res.status(),
        headers: res.headers(),
        body: safeJsonParse(text) || text,
      });
    } catch (error) {
      captured.push({
        ts: new Date().toISOString(),
        type: 'internal-error',
        where: 'response-handler',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  console.log(`[VEO Debug] Open URL: ${args.url}`);
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await tryAutoLogin(page, args.email, args.password);

  console.log('[VEO Debug] Login and perform one I2V generation in browser.');
  console.log('[VEO Debug] Capture will include both request and response for generate endpoints.');

  if (process.stdin.isTTY) {
    await waitForEnter('[VEO Debug] Press ENTER after generation attempt finishes...');
  } else {
    console.log(`[VEO Debug] Non-interactive terminal detected. Waiting ${args.waitMs}ms before saving capture...`);
    await sleep(args.waitMs);
  }

  // Capture cookies and user agent for context diffing (safe fallbacks).
  let pageUrl = args.url;
  try {
    pageUrl = page.url();
  } catch {
    // keep fallback
  }

  let userAgent = '';
  try {
    userAgent = await page.evaluate(() => navigator.userAgent);
  } catch {
    userAgent = '';
  }

  const allCookies = await cdp.send('Network.getAllCookies').catch(() => ({ cookies: [] }));
  const cookies = Array.isArray(allCookies?.cookies) ? allCookies.cookies : [];

  let origin = '';
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    origin = '';
  }

  const output = {
    createdAt: new Date().toISOString(),
    pageUrl,
    origin,
    userAgent,
    cookieCount: cookies.length,
    cookies,
    capturedCount: captured.length,
    captured,
  };

  await fs.writeFile(args.out, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[VEO Debug] Saved capture to: ${args.out}`);
  console.log('[VEO Debug] Done.');
} catch (error) {
  console.error('[VEO Debug] Failed:', error);
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
}
