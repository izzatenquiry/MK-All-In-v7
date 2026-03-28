/**
 * reCAPTCHA Auto Generator Service
 * 
 * Automatically generates reCAPTCHA tokens using Puppeteer and sends them to bridge server.
 * No Chrome Extension needed - fully automated.
 * 
 * Usage:
 *   node services/recaptchaAutoGenerator.js
 * 
 * Configuration:
 *   - BRIDGE_SERVER_URL: http://localhost:6003
 *   - MIN_POOL_SIZE: 5 (minimum tokens to keep in pool)
 *   - MAX_POOL_SIZE: 20 (maximum tokens in pool)
 *   - GENERATION_INTERVAL: 30000 (30 seconds - check pool every 30s)
 */

import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL || 'http://localhost:6003';
const RECAPTCHA_SITE_KEY = '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV';
const RECAPTCHA_ACTION = 'FLOW_GENERATION';
const LABS_URL_BASE = 'https://labs.google/fx/tools/flow'; // Base URL (no .com)

/**
 * Detect real OAuth / session loss.
 * Do NOT match "/fx/api/auth" alone — Labs Flow may hit that path during in-app OAuth refresh while still logged in.
 * Do NOT treat labs.google Flow tool URLs as logout (same path can host SPA transitions).
 */
function isLikelyLoggedOutPageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    if (u.includes('labs.google') && (u.includes('/fx/tools/flow') || u.includes('/project/'))) {
        return false;
    }
    if (u.includes('labs.google') && (u.includes('/signin') || u.includes('service=signin'))) {
        return true;
    }
    return (
        u.includes('accounts.google.com') ||
        u.includes('accounts.youtube.com') ||
        u.includes('myaccount.google.com') ||
        (u.includes('google.com') && u.includes('servicelogin')) ||
        u.includes('error=access_denied') ||
        u.includes('error=callback')
    );
}

// On-demand generation mode (no auto pool maintenance)
const GENERATOR_PORT = 6004; // HTTP server port for on-demand generation
const GENERATION_TIMEOUT = 60000;  // 60 seconds timeout for token generation

// Cookie directory: from main project's backend/cookies (this folder is inside main project)
const COOKIES_DIR = process.env.COOKIES_DIR || path.join(__dirname, '..', 'backend', 'cookies');

// Track which flow account to use next (round-robin)
let currentFlowAccountIndex = 0;
let availableFlowAccounts = [];

let browser = null;
let generationInterval = null;
// Removed isGenerating flag - browser can handle multiple pages simultaneously

/**
 * Scan and get all available flow accounts (G1/, G2/, etc.)
 */
function scanFlowAccounts() {
    try {
        if (!fs.existsSync(COOKIES_DIR)) {
            console.warn(`[Auto Generator] ⚠️ Cookies directory not found: ${COOKIES_DIR}`);
            return [];
        }

        const flowAccounts = [];
        
        // Get all subdirectories (G1/, G2/, etc.)
        const items = fs.readdirSync(COOKIES_DIR);
        for (const item of items) {
            const itemPath = path.join(COOKIES_DIR, item);
            if (fs.statSync(itemPath).isDirectory()) {
                // Check if directory has cookie files
                const cookieFiles = fs.readdirSync(itemPath)
                    .filter(file => file.endsWith('.json'));
                
                if (cookieFiles.length > 0) {
                    flowAccounts.push({
                        code: item, // G1, G2, etc.
                        path: itemPath,
                        cookieCount: cookieFiles.length
                    });
                }
            }
        }

        // Also check root folder for cookies
        const rootCookies = fs.readdirSync(COOKIES_DIR)
            .filter(file => file.endsWith('.json'));
        
        if (rootCookies.length > 0) {
            flowAccounts.push({
                code: 'ROOT',
                path: COOKIES_DIR,
                cookieCount: rootCookies.length
            });
        }

        return flowAccounts.sort((a, b) => a.code.localeCompare(b.code));
    } catch (error) {
        console.error(`[Auto Generator] ❌ Error scanning flow accounts:`, error.message);
        return [];
    }
}

/**
 * Get cookie file from specific flow account (try multiple cookies if first fails)
 */
function getCookieFileFromFlowAccount(flowAccountCode, skipFirst = 0) {
    try {
        let cookieDir;
        
        if (flowAccountCode === 'ROOT') {
            cookieDir = COOKIES_DIR;
        } else {
            cookieDir = path.join(COOKIES_DIR, flowAccountCode);
        }

        if (!fs.existsSync(cookieDir)) {
            return null;
        }

        const cookieFiles = fs.readdirSync(cookieDir)
            .filter(file => file.endsWith('.json'))
            .map(file => path.join(cookieDir, file))
            .sort();

        if (cookieFiles.length === 0) {
            return null;
        }

        // Skip first N cookies (for retry)
        if (skipFirst >= cookieFiles.length) {
            return null;
        }

        return cookieFiles[skipFirst];
    } catch (error) {
        console.error(`[Auto Generator] ❌ Error getting cookie from ${flowAccountCode}:`, error.message);
        return null;
    }
}

/**
 * Get next flow account in round-robin fashion
 */
function getNextFlowAccount() {
    // Refresh available flow accounts periodically
    if (availableFlowAccounts.length === 0) {
        availableFlowAccounts = scanFlowAccounts();
        console.log(`[Auto Generator] 📂 Found ${availableFlowAccounts.length} flow account(s) with cookies`);
    }

    if (availableFlowAccounts.length === 0) {
        return null;
    }

    // Round-robin: get next flow account
    const flowAccount = availableFlowAccounts[currentFlowAccountIndex];
    currentFlowAccountIndex = (currentFlowAccountIndex + 1) % availableFlowAccounts.length;
    
    return flowAccount;
}

/**
 * Load cookies from file (same format as backend)
 * Returns { cookies, flowAccountCode, cookieFile } or null
 */
function loadCookies(retryFlowAccount = null, retrySkip = 0) {
    try {
        let flowAccount;
        
        if (retryFlowAccount) {
            // Retry with same flow account but different cookie
            flowAccount = availableFlowAccounts.find(fa => fa.code === retryFlowAccount);
            if (!flowAccount) {
                return null;
            }
        } else {
            // Get next flow account (round-robin)
            flowAccount = getNextFlowAccount();
        }
        
        if (!flowAccount) {
            console.warn(`[Auto Generator] ⚠️ No flow accounts with cookies available`);
            return null;
        }

        const cookieFile = getCookieFileFromFlowAccount(flowAccount.code, retrySkip);
        if (!cookieFile) {
            if (retrySkip === 0) {
                console.warn(`[Auto Generator] ⚠️ No cookie file found in ${flowAccount.code}`);
            }
            return null;
        }

        console.log(`[Auto Generator] 📂 Using flow account: ${flowAccount.code}, cookie: ${path.basename(cookieFile)}`);
        const cookieData = fs.readFileSync(cookieFile, 'utf8');
        const cookies = JSON.parse(cookieData);
        
        if (!Array.isArray(cookies) || cookies.length === 0) {
            console.warn(`[Auto Generator] ⚠️ Cookie file is empty or invalid`);
            return null;
        }

        console.log(`[Auto Generator] ✅ Loaded ${cookies.length} cookies from ${flowAccount.code}`);
        return {
            cookies,
            flowAccountCode: flowAccount.code,
            cookieFile: path.basename(cookieFile)
        };
    } catch (error) {
        console.error(`[Auto Generator] ❌ Error loading cookies:`, error.message);
        return null;
    }
}

/**
 * Convert cookie format for Puppeteer (from Playwright format)
 */
function normalizeSameSiteForPuppeteer(sameSite) {
    if (sameSite == null || sameSite === 'unspecified' || sameSite === '') return 'Lax';
    const s = String(sameSite).toLowerCase();
    if (s === 'lax') return 'Lax';
    if (s === 'strict') return 'Strict';
    if (s === 'none') return 'None';
    return 'Lax';
}

function formatCookiesForPuppeteer(cookies) {
    return cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        expires: cookie.expires && cookie.expires > 0 ? cookie.expires : -1,
        httpOnly: cookie.httpOnly !== false, // Default to true
        secure: cookie.secure !== false, // Default to true
        sameSite: normalizeSameSiteForPuppeteer(cookie.sameSite)
    }));
}

/**
 * Chromium starts with one default tab (often about:blank). Calling browser.newPage() opens a *second* tab.
 * Reuse the first tab and close any extras so only one tab exists.
 */
async function acquireSingletonPage(browser) {
    const pages = await browser.pages();
    if (pages.length > 0) {
        const first = pages[0];
        for (let i = 1; i < pages.length; i++) {
            try {
                await pages[i].close();
            } catch {
                /* ignore */
            }
        }
        return first;
    }
    return browser.newPage();
}

/** One exported file per video generation — prefix for pruning old files */
const FLOW_VID_COOKIE_PREFIX = 'flow_vid_';
const MAX_FLOW_VID_COOKIE_FILES = 80;

function mapCdpCookieToExport(c) {
    return {
        name: c.name,
        value: c.value,
        domain: c.domain || '',
        path: c.path || '/',
        expires: typeof c.expires === 'number' && c.expires > 0 ? c.expires : -1,
        httpOnly: !!c.httpOnly,
        secure: c.secure !== false,
        sameSite: c.sameSite ? String(c.sameSite) : 'Lax',
    };
}

function pruneOldFlowVidCookies(flowAccountDir) {
    try {
        if (!fs.existsSync(flowAccountDir)) return;
        const files = fs
            .readdirSync(flowAccountDir)
            .filter((f) => f.startsWith(FLOW_VID_COOKIE_PREFIX) && f.endsWith('.json'))
            .map((f) => ({ f, t: fs.statSync(path.join(flowAccountDir, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t);
        while (files.length > MAX_FLOW_VID_COOKIE_FILES) {
            const last = files.pop();
            if (last) fs.unlinkSync(path.join(flowAccountDir, last.f));
        }
    } catch {
        /* ignore */
    }
}

/**
 * After Labs page is ready, dump current browser cookies to a new JSON file (1 file per video session).
 * Uses CDP Network.getAllCookies so refreshed OAuth / session cookies are captured.
 */
async function saveFreshSessionCookieFile(page, flowAccountCode) {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Network.enable');
    const { cookies } = await cdp.send('Network.getAllCookies');
    await cdp.detach().catch(() => {});

    const googleish = (c) => {
        const d = (c.domain || '').toLowerCase();
        return d.includes('google') || d.includes('youtube') || d.includes('gstatic');
    };
    let list = (cookies || []).filter(googleish).map(mapCdpCookieToExport);
    if (list.length === 0) {
        list = (cookies || []).map(mapCdpCookieToExport);
    }

    const dir = path.join(COOKIES_DIR, flowAccountCode);
    fs.mkdirSync(dir, { recursive: true });
    const fname = `${FLOW_VID_COOKIE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 10)}.json`;
    const fpath = path.join(dir, fname);
    fs.writeFileSync(fpath, JSON.stringify(list, null, 2), 'utf8');
    console.log(`[Auto Generator] 💾 Fresh session cookie file (this video only): ${flowAccountCode}/${fname} (${list.length} cookies)`);
    pruneOldFlowVidCookies(dir);
    return fname;
}

/** One cookie file for unified video session: OAuth (Flask) + reCAPTCHA (same Puppeteer page) */
const FLOW_UNIFIED_COOKIE_PREFIX = 'flow_unified_';
const MAX_FLOW_UNIFIED_COOKIE_FILES = 40;

function pruneOldFlowUnifiedCookies(flowAccountDir) {
    try {
        if (!fs.existsSync(flowAccountDir)) return;
        const files = fs
            .readdirSync(flowAccountDir)
            .filter((f) => f.startsWith(FLOW_UNIFIED_COOKIE_PREFIX) && f.endsWith('.json'))
            .map((f) => ({ f, t: fs.statSync(path.join(flowAccountDir, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t);
        while (files.length > MAX_FLOW_UNIFIED_COOKIE_FILES) {
            const last = files.pop();
            if (last) fs.unlinkSync(path.join(flowAccountDir, last.f));
        }
    } catch {
        /* ignore */
    }
}

const BACKEND_ADMIN_BASE = process.env.BOT_ADMIN_API_URL || 'http://127.0.0.1:1247';
const BRIDGE_INTERNAL_KEY = (process.env.MONOKLIX_BRIDGE_INTERNAL_KEY || '').trim();

async function saveUnifiedSessionCookieFile(page, flowAccountCode) {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Network.enable');
    const { cookies } = await cdp.send('Network.getAllCookies');
    await cdp.detach().catch(() => {});

    const googleish = (c) => {
        const d = (c.domain || '').toLowerCase();
        return d.includes('google') || d.includes('youtube') || d.includes('gstatic');
    };
    let list = (cookies || []).filter(googleish).map(mapCdpCookieToExport);
    if (list.length === 0) {
        list = (cookies || []).map(mapCdpCookieToExport);
    }

    const dir = path.join(COOKIES_DIR, flowAccountCode);
    fs.mkdirSync(dir, { recursive: true });
    const fname = `${FLOW_UNIFIED_COOKIE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 10)}.json`;
    const fpath = path.join(dir, fname);
    fs.writeFileSync(fpath, JSON.stringify(list, null, 2), 'utf8');
    console.log(
        `[Auto Generator] 💾 Unified session cookie file (OAuth + reCAPTCHA this job): ${flowAccountCode}/${fname} (${list.length} cookies)`
    );
    pruneOldFlowUnifiedCookies(dir);
    return fname;
}

/**
 * Bearer OAuth from a single cookie JSON via Flask :1247 (AuthTokenFetcher) — must match saved unified file.
 */
async function fetchOAuthFromCookieFile(relativePath) {
    const url = `${BACKEND_ADMIN_BASE}/api/bridge/oauth-from-cookie`;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (BRIDGE_INTERNAL_KEY) {
        headers['X-Bridge-Internal-Key'] = BRIDGE_INTERNAL_KEY;
    }
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ relativePath }),
    });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`oauth-from-cookie: invalid JSON (${res.status})`);
    }
    if (!res.ok) {
        throw new Error(data.error || `oauth-from-cookie HTTP ${res.status}`);
    }
    if (!data.success || !data.token) {
        throw new Error(data.error || 'OAuth fetch failed');
    }
    return { token: data.token, credits: data.credits ?? null };
}

/**
 * Email/password for flow account — from Flask (Supabase ultra_ai_email_pool).
 * Requires web dashboard on 1247; optional X-Bridge-Internal-Key if not localhost.
 */
async function fetchFlowCredentialsFromBackend(flowAccountCode) {
    const code = encodeURIComponent(flowAccountCode.trim());
    const url = `${BACKEND_ADMIN_BASE}/api/bridge/flow-credentials/${code}`;
    const headers = { Accept: 'application/json' };
    if (BRIDGE_INTERNAL_KEY) {
        headers['X-Bridge-Internal-Key'] = BRIDGE_INTERNAL_KEY;
    }
    const res = await fetch(url, { headers });
    const text = await res.text();
    if (!res.ok) {
        console.error(`[Auto Generator] ❌ flow-credentials ${res.status}:`, text.slice(0, 200));
        return null;
    }
    try {
        const data = JSON.parse(text);
        if (!data.email || !data.password) return null;
        return { email: data.email, password: data.password };
    } catch {
        return null;
    }
}

/**
 * Fresh Google login in Puppeteer (same idea as backend/cookie_grabber.py auto_login).
 * 2FA accounts will fail — user must use app password or disable 2FA for automation.
 */
async function puppeteerGoogleFlowLogin(page, email, password) {
    console.log('[Auto Generator] 🔐 Full login: opening Labs Flow...');
    await page.goto(LABS_URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(3500);

    const clicked = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        for (const el of nodes) {
            const t = (el.innerText || el.textContent || '').trim();
            if (/create with flow|get started|start creating/i.test(t)) {
                el.click();
                return t.slice(0, 48);
            }
        }
        return null;
    });
    if (clicked) {
        console.log('[Auto Generator] 🔐 Clicked entry control:', clicked);
    } else {
        console.log('[Auto Generator] ⚠️ No Create/Get started button — waiting for login form anyway');
    }
    await page.waitForTimeout(2500);

    await page.waitForSelector('input[type="email"], input[name="identifier"]', { visible: true, timeout: 90000 });
    await page.focus('input[type="email"], input[name="identifier"]');
    await page.evaluate((e) => {
        const i = document.querySelector('input[type="email"]') || document.querySelector('input[name="identifier"]');
        if (i) {
            i.value = '';
            i.focus();
        }
    }, email);
    await page.keyboard.type(email, { delay: 15 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    await page.waitForSelector('input[type="password"]', { visible: true, timeout: 60000 });
    await page.focus('input[type="password"]');
    await page.evaluate(() => {
        const p = document.querySelector('input[type="password"]');
        if (p) p.value = '';
    });
    await page.keyboard.type(password, { delay: 15 });
    await page.keyboard.press('Enter');

    console.log('[Auto Generator] 🔐 Waiting for Labs session after password...');
    await page.waitForFunction(
        () =>
            /labs\.google\/fx\/tools\/flow/.test(window.location.href) ||
            (document.body && /flow|labs\.google/i.test(document.body.innerText || '')),
        { timeout: 120000 }
    );
    await page.waitForTimeout(4000);

    const snippet = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 8000) : ''));
    if (/verify it'?s you|2-step verification|2-step verification|authenticator/i.test(snippet)) {
        throw new Error(
            'Full login: 2FA required — automation cannot continue. Use an account without 2FA or complete login manually once.'
        );
    }
    if (/couldn.?t sign you in|wrong password/i.test(snippet)) {
        throw new Error('Full login: invalid email or password');
    }
    console.log('[Auto Generator] ✅ Full login flow completed (Labs reachable)');
}

/**
 * Check current pool size from bridge server
 */
async function checkPoolSize() {
    try {
        const response = await fetch(`${BRIDGE_SERVER_URL}/pool`);
        if (response.ok) {
            const data = await response.json();
            return data.freshTokens || 0;
        }
    } catch (error) {
        console.error('[Auto Generator] ❌ Error checking pool:', error.message);
    }
    return 0;
}

/**
 * Send token to bridge server
 */
async function sendTokenToBridge(token, tokenId = null) {
    try {
        const payload = {
            token: token,
            tokenId: tokenId || `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: Date.now()
        };

        const response = await fetch(`${BRIDGE_SERVER_URL}/add-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`[Auto Generator] ✅ Token sent to bridge server: ${data.tokenId}`);
            return true;
        } else {
            const errorText = await response.text();
            console.error(`[Auto Generator] ❌ Failed to send token: ${response.status}`, errorText);
            return false;
        }
    } catch (error) {
        console.error('[Auto Generator] ❌ Error sending token:', error.message);
        return false;
    }
}

/**
 * Load specific cookie file from flow account
 */
function loadSpecificCookieFile(flowAccountCode, cookieFileName) {
    if (!flowAccountCode || !cookieFileName) {
        return null;
    }
    
    let cookieDir;
    if (flowAccountCode === 'ROOT') {
        cookieDir = COOKIES_DIR;
    } else {
        cookieDir = path.join(COOKIES_DIR, flowAccountCode);
    }
    
    const cookieFile = path.join(cookieDir, cookieFileName);
    
    if (!fs.existsSync(cookieFile)) {
        console.warn(`[Auto Generator] ⚠️ Cookie file not found: ${cookieFile}`);
        return null;
    }
    
    try {
        const cookieData = fs.readFileSync(cookieFile, 'utf8');
        const cookies = JSON.parse(cookieData);
        
        if (!Array.isArray(cookies) || cookies.length === 0) {
            return null;
        }
        
        console.log(`[Auto Generator] ✅ Loaded ${cookies.length} cookies from ${flowAccountCode}/${cookieFileName}`);
        return {
            cookies,
            flowAccountCode,
            cookieFile: cookieFileName
        };
    } catch (error) {
        console.error(`[Auto Generator] ❌ Error loading cookie file ${cookieFileName}:`, error.message);
        return null;
    }
}

/**
 * Load cookies from specific flow account
 */
function loadCookiesFromFlowAccount(flowAccountCode) {
    if (!flowAccountCode) {
        // Fallback to round-robin if no flow account specified
        return loadCookies();
    }
    
    const cookieFile = getCookieFileFromFlowAccount(flowAccountCode, 0);
    if (!cookieFile) {
        return null;
    }
    
    try {
        const cookieData = fs.readFileSync(cookieFile, 'utf8');
        const cookies = JSON.parse(cookieData);
        
        if (!Array.isArray(cookies) || cookies.length === 0) {
            return null;
        }
        
        console.log(`[Auto Generator] ✅ Loaded ${cookies.length} cookies from ${flowAccountCode}`);
        return {
            cookies,
            flowAccountCode,
            cookieFile: path.basename(cookieFile)
        };
    } catch (error) {
        console.error(`[Auto Generator] ❌ Error loading cookies from ${flowAccountCode}:`, error.message);
        return null;
    }
}

/**
 * Generate reCAPTCHA token using Puppeteer
 * @param {string} flowAccountCode - Optional: specific flow account code (e.g., 'G1', 'E1')
 * @param {string} projectId - Optional: project ID to use in URL
 * @param {string} cookieFileName - Optional: specific cookie file name (e.g., 'flow_g11_c1.json') to use same cookie file as auth token
 * @param {string} action - Optional: reCAPTCHA action type (VIDEO_GENERATION, IMAGE_GENERATION, etc.)
 * @param {object} [options] - { freshCookiesPerVideo?, fullLogin? } — fullLogin: Puppeteer logs in with email/password from Flask (port 1247), then opens project URL (needs BOT_ADMIN_API_URL / backend running).
 */
async function generateToken(flowAccountCode = null, projectId = null, cookieFileName = null, action = null, options = null) {
    // Removed isGenerating check - browser can handle multiple pages simultaneously
    // Each request will create its own page and close it when done
    let page = null;
    let cookieInfo = null;
    let retryCount = 0;
    const MAX_RETRIES = 3; // Try up to 3 different cookies

    try {
        while (retryCount < MAX_RETRIES) {
            try {
                const genOpts = options && typeof options === 'object' ? options : {};
                const useFullLogin = !!genOpts.fullLogin && flowAccountCode && projectId;
                const unifiedVideoSession = !!genOpts.unifiedVideoSession;

                if (unifiedVideoSession && (!flowAccountCode || !projectId)) {
                    throw new Error('unifiedVideoSession requires flowAccountCode and projectId');
                }

                console.log('[Auto Generator] 🚀 Starting token generation...', {
                    flowAccountCode: flowAccountCode || 'round-robin',
                    projectId: projectId ? `${projectId.substring(0, 8)}...` : 'none',
                    cookieFileName: cookieFileName || 'auto-select',
                    retryAttempt: retryCount + 1,
                    freshCookiesPerVideo: !!genOpts.freshCookiesPerVideo,
                    fullLogin: useFullLogin,
                    unifiedVideoSession,
                });

                if (!useFullLogin) {
                    // Load cookies - prioritize specific cookie file if provided (same as auth token)
                    if (retryCount === 0) {
                        if (cookieFileName && flowAccountCode) {
                            cookieInfo = loadSpecificCookieFile(flowAccountCode, cookieFileName);

                            if (!cookieInfo) {
                                console.warn(`[Auto Generator] ⚠️ Cookie file ${cookieFileName} not found, falling back to auto-select`);
                                cookieInfo = loadCookiesFromFlowAccount(flowAccountCode);
                            }
                        } else if (flowAccountCode) {
                            cookieInfo = loadCookiesFromFlowAccount(flowAccountCode);
                        } else {
                            cookieInfo = loadCookies();
                        }
                    } else {
                        const retryFlowAccount = cookieInfo?.flowAccountCode || flowAccountCode;
                        cookieInfo = loadCookies(retryFlowAccount, retryCount);

                        if (!cookieInfo && !flowAccountCode) {
                            cookieInfo = loadCookies();
                        }
                    }

                    if (!cookieInfo || !cookieInfo.cookies || cookieInfo.cookies.length === 0) {
                        if (retryCount < MAX_RETRIES - 1) {
                            retryCount++;
                            console.log(`[Auto Generator] ⚠️ No cookies available, retrying (${retryCount}/${MAX_RETRIES})...`);
                            continue;
                        }
                        throw new Error('No cookies available. Please add cookies to backend/cookies/ directory.');
                    }
                } else {
                    cookieInfo = { cookies: [], flowAccountCode, cookieFile: '(full-login)' };
                }

                const cookies = cookieInfo.cookies;

                // Full login: run headless by default (no visible window). Debug / 2FA: set PUPPETEER_FULL_LOGIN_VISIBLE=1
                const fullLoginVisible = process.env.PUPPETEER_FULL_LOGIN_VISIBLE === '1';
                const headlessMode = useFullLogin ? (fullLoginVisible ? false : 'new') : 'new';

                if (useFullLogin && browser) {
                    console.log('[Auto Generator] 🔄 Restarting browser for full-login (fresh session)...');
                    try {
                        await browser.close();
                    } catch {
                        /* ignore */
                    }
                    browser = null;
                }

                // Launch browser if not already launched
                if (!browser) {
                    console.log(
                        '[Auto Generator] 🌐 Launching browser...',
                        headlessMode === false ? '(visible — set PUPPETEER_FULL_LOGIN_VISIBLE=1)' : '(headless — no window)'
                    );
                    browser = await puppeteer.launch({
                        headless: headlessMode,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-accelerated-2d-canvas',
                            '--disable-gpu',
                            '--disable-blink-features=AutomationControlled',
                            '--window-size=1920,1080',
                        ],
                    });
                }

                page = await acquireSingletonPage(browser);

                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
                await page.setViewport({ width: 1920, height: 1080 });

                let targetUrl = LABS_URL_BASE;
                if (projectId) {
                    targetUrl = `${LABS_URL_BASE}/project/${projectId}`;
                }

                if (useFullLogin) {
                    const creds = await fetchFlowCredentialsFromBackend(flowAccountCode);
                    if (!creds) {
                        throw new Error(
                            `Full login: could not read email/password for ${flowAccountCode}. Is web dashboard running at ${BACKEND_ADMIN_BASE} and /api/bridge/flow-credentials reachable?`
                        );
                    }
                    await puppeteerGoogleFlowLogin(page, creds.email, creds.password);
                    console.log('[Auto Generator] 📍 Navigating to project after login:', targetUrl);
                    try {
                        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 90000 });
                    } catch (e) {
                        console.log('[Auto Generator] ⚠️ networkidle2 timeout after login, trying domcontentloaded...');
                        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
                        await page.waitForTimeout(5000);
                    }
                } else {
                    console.log('[Auto Generator] 🍪 Setting cookies...');
                    const formattedCookies = formatCookiesForPuppeteer(cookies);
                    await page.setCookie(...formattedCookies);
                    console.log(`[Auto Generator] ✅ Set ${formattedCookies.length} cookies`);

                    console.log(`[Auto Generator] 📍 Navigating to: ${targetUrl}`);
                    try {
                        await page.goto(targetUrl, {
                            waitUntil: 'networkidle2',
                            timeout: 60000,
                        });
                    } catch (error) {
                        console.log('[Auto Generator] ⚠️ networkidle2 timeout, trying domcontentloaded...');
                        await page.goto(targetUrl, {
                            waitUntil: 'domcontentloaded',
                            timeout: 60000,
                        });
                        await page.waitForTimeout(5000);
                    }
                }

                // Check if we're logged in (check for redirect to login / OAuth error)
                const currentUrl = page.url();
                if (isLikelyLoggedOutPageUrl(currentUrl)) {
                    console.warn(`[Auto Generator] ⚠️ Cookie expired/invalid — URL: ${currentUrl}`);
                    await page.close();
                    page = null;
                    throw new Error(`Not logged in - cookies expired/invalid. Please update cookies.`);
                }

                // Wait for grecaptcha to load
                console.log('[Auto Generator] ⏳ Waiting for grecaptcha to load...');
                try {
                    await page.waitForFunction(
                        () => {
                            try {
                                return typeof window.grecaptcha !== 'undefined' && 
                                       typeof window.grecaptcha.enterprise !== 'undefined' &&
                                       typeof window.grecaptcha.enterprise.execute === 'function';
                            } catch (e) {
                                return false;
                            }
                        },
                        { 
                            timeout: 60000,
                            polling: 1000
                        }
                    );
                    console.log('[Auto Generator] ✅ grecaptcha loaded successfully');
                } catch (error) {
                    // Diagnostic
                    const diagnostics = await page.evaluate(() => {
                        return {
                            grecaptchaExists: typeof window.grecaptcha !== 'undefined',
                            enterpriseExists: typeof window.grecaptcha?.enterprise !== 'undefined',
                            executeExists: typeof window.grecaptcha?.enterprise?.execute === 'function',
                            pageUrl: window.location.href,
                            pageTitle: document.title
                        };
                    });
                    console.error('[Auto Generator] ❌ grecaptcha timeout. Diagnostics:', diagnostics);
                    throw new Error(`grecaptcha not available: ${JSON.stringify(diagnostics)}`);
                }

                // Wait for page to be fully interactive (critical for reCAPTCHA v3)
                console.log('[Auto Generator] ⏳ Waiting for page to stabilize...');
                await page.waitForTimeout(3000); // Wait 3 seconds for page to stabilize

                let oauthToken = null;
                let oauthCredits = null;
                let unifiedCookieFileName = null;

                // One cookie file → Flask OAuth + same-page reCAPTCHA (unified video session)
                if (unifiedVideoSession && flowAccountCode && retryCount === 0) {
                    unifiedCookieFileName = await saveUnifiedSessionCookieFile(page, flowAccountCode);
                    const relPath = `${flowAccountCode}/${unifiedCookieFileName}`;
                    console.log('[Auto Generator] 🔑 Fetching Bearer OAuth from unified cookie file via backend...');
                    const oauth = await fetchOAuthFromCookieFile(relPath);
                    oauthToken = oauth.token;
                    oauthCredits = oauth.credits;
                } else if (genOpts.freshCookiesPerVideo && flowAccountCode && retryCount === 0) {
                    // 1 video = 1 fresh cookie file on disk (reCAPTCHA-only path)
                    await saveFreshSessionCookieFile(page, flowAccountCode);
                }

                // Light interaction only — synthetic document clicks can trigger SPA navigations and destroy the execution context
                console.log('[Auto Generator] 🖱️ Simulating user interaction...');
                try {
                    await page.evaluate(() => {
                        window.scrollBy(0, 120);
                        window.scrollBy(0, -40);
                        document.body?.dispatchEvent(
                            new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 80, clientY: 120, view: window })
                        );
                    });
                    console.log('[Auto Generator] ✅ User interaction simulated');
                } catch (error) {
                    console.warn('[Auto Generator] ⚠️ Error simulating interaction:', error.message);
                }

                // Brief settle after scroll/move (avoid waitForNavigation — no nav expected, and it can burn the full timeout)
                await page.waitForTimeout(2500);

                // Re-check URL after any navigation
                const urlAfterInteract = page.url();
                if (isLikelyLoggedOutPageUrl(urlAfterInteract)) {
                    console.warn(`[Auto Generator] ⚠️ Post-interaction URL looks logged out: ${urlAfterInteract}`);
                    await page.close();
                    page = null;
                    throw new Error(`Not logged in - cookies expired/invalid. Please update cookies.`);
                }

                // Re-wait for grecaptcha if page reloaded after interaction
                try {
                    await page.waitForFunction(
                        () =>
                            typeof window.grecaptcha !== 'undefined' &&
                            typeof window.grecaptcha?.enterprise !== 'undefined' &&
                            typeof window.grecaptcha?.enterprise?.execute === 'function',
                        { timeout: 45000, polling: 500 }
                    );
                } catch (e) {
                    const diagUrl = page.url();
                    console.error('[Auto Generator] ❌ grecaptcha not ready after interaction. URL:', diagUrl);
                    if (isLikelyLoggedOutPageUrl(diagUrl)) {
                        await page.close();
                        page = null;
                        throw new Error(`Not logged in - cookies expired/invalid. Please update cookies.`);
                    }
                    throw new Error(`grecaptcha not ready after interaction: ${e.message}`);
                }

                // Extract site key from page (preferred) or use fallback
                console.log('[Auto Generator] 🔍 Extracting site key from page...');
                let siteKey = RECAPTCHA_SITE_KEY; // Fallback
                try {
                    const extractedSiteKey = await page.evaluate(() => {
                        // Try to find site key from page
                        // Check for data-sitekey attribute
                        const siteKeyElement = document.querySelector('[data-sitekey]');
                        if (siteKeyElement) {
                            return siteKeyElement.getAttribute('data-sitekey');
                        }
                        // Check for grecaptcha.ready callback
                        if (window.grecaptcha && window.grecaptcha.enterprise) {
                            // Try to get from grecaptcha config if available
                            try {
                                const config = window.grecaptcha.enterprise;
                                // Site key might be in page context
                                return null; // Will use fallback
                            } catch (e) {
                                return null;
                            }
                        }
                        return null;
                    });
                    
                    if (extractedSiteKey) {
                        siteKey = extractedSiteKey;
                        console.log(`[Auto Generator] ✅ Using extracted site key: ${siteKey.substring(0, 20)}...`);
                    } else {
                        console.log(`[Auto Generator] ⚠️ No site key found on page, using fallback: ${siteKey.substring(0, 20)}...`);
                    }
                } catch (error) {
                    console.warn('[Auto Generator] ⚠️ Error extracting site key, using fallback:', error.message);
                }

                // Generate token
                const finalAction = action || 'VIDEO_GENERATION'; // Default to VIDEO_GENERATION if not specified
                console.log('[Auto Generator] 🔐 Generating reCAPTCHA token...');
                console.log(`[Auto Generator] 🎯 Using action: ${finalAction}`);
                const token = await Promise.race([
                    page.evaluate(async (siteKey, action) => {
                        const g = window.grecaptcha;
                        if (!g || !g.enterprise || typeof g.enterprise.execute !== 'function') {
                            throw new Error(
                                `grecaptcha.enterprise not available: ${JSON.stringify({
                                    hasGrecaptcha: !!window.grecaptcha,
                                    hasEnterprise: !!(g && g.enterprise),
                                    href: window.location.href
                                })}`
                            );
                        }
                        return await g.enterprise.execute(siteKey, { action });
                    }, siteKey, finalAction),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Token generation timeout after 45s')), 45000)
                    )
                ]);

                if (!token || token.length < 50) {
                    throw new Error(`Invalid token received: ${token ? `length=${token.length}` : 'null'}`);
                }

                console.log(`[Auto Generator] ✅ Token generated: ${token.substring(0, 50)}...`);

                // Close page
                await page.close();
                page = null;

                if (unifiedVideoSession) {
                    return {
                        __unified: true,
                        recaptchaToken: token,
                        oauthToken,
                        cookieFileName: unifiedCookieFileName,
                        credits: oauthCredits,
                    };
                }

                // For on-demand generation, don't send to bridge server pool (return directly)
                // Bridge server will add it to pool if needed
                return token;

            } catch (error) {
                // Close page on error
                if (page) {
                    try {
                        await page.close();
                    } catch (e) {
                        // Ignore
                    }
                    page = null;
                }

                // If it's a login/expired cookie error, throw immediately (no retry with different cookie)
                if (error.message.includes('Not logged in') || error.message.includes('expired')) {
                    throw error;
                }

                // Otherwise, throw the error
                throw error;
            }
        }

        // This should not be reached since we removed retry logic for expired cookies
        throw new Error(`Failed to generate token`);

    } catch (error) {
        console.error('[Auto Generator] ❌ Error generating token:', error.message);
        console.error('[Auto Generator] ❌ Full error:', error);
        
        // Close page on error
        if (page) {
            try {
                await page.close();
            } catch (e) {
                // Ignore
            }
        }

        return null;
    } finally {
        // Always close page if it exists
        if (page) {
            try {
                await page.close();
                console.log('[Auto Generator] ✅ Page closed');
            } catch (e) {
                console.warn('[Auto Generator] ⚠️ Error closing page:', e.message);
            }
        }
    }
}

/**
 * Generate tokens until pool reaches target size
 */
async function maintainPool() {
    try {
        const currentPoolSize = await checkPoolSize();
        console.log(`[Auto Generator] 📊 Current pool size: ${currentPoolSize}/${MAX_POOL_SIZE}`);

        if (currentPoolSize < MIN_POOL_SIZE) {
            const tokensNeeded = MIN_POOL_SIZE - currentPoolSize;
            console.log(`[Auto Generator] 🔄 Pool is low, generating ${tokensNeeded} token(s)...`);

            // Generate tokens one by one (don't parallelize to avoid rate limiting)
            for (let i = 0; i < tokensNeeded && currentPoolSize + i < MAX_POOL_SIZE; i++) {
                await generateToken();
                
                // Wait a bit between generations to avoid rate limiting
                if (i < tokensNeeded - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay (faster)
                }
            }
        } else {
            console.log(`[Auto Generator] ✅ Pool is healthy (${currentPoolSize} tokens)`);
        }
    } catch (error) {
        console.error('[Auto Generator] ❌ Error maintaining pool:', error.message);
    }
}

/**
 * HTTP Server for on-demand token generation
 */
function startHttpServer() {
    const server = http.createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        const url = new URL(req.url, `http://${req.headers.host}`);
        
        if (url.pathname === '/generate' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    const { flowAccountCode, projectId, cookieFileName, action, freshSession, fullLogin, unifiedSession } =
                        JSON.parse(body);
                    const unifiedVideoSession = unifiedSession === true || unifiedSession === '1';
                    const freshCookiesPerVideo =
                        unifiedVideoSession
                            ? false
                            : freshSession === true ||
                              freshSession === '1' ||
                              (freshSession !== false && freshSession !== '0' && action === 'VIDEO_GENERATION');
                    const useFullLogin = fullLogin === true || fullLogin === '1';

                    console.log(`[Auto Generator] 📥 On-demand generation request:`, {
                        flowAccountCode: flowAccountCode || 'none',
                        projectId: projectId ? `${projectId.substring(0, 8)}...` : 'none',
                        cookieFileName: cookieFileName || 'auto-select',
                        action: action || 'VIDEO_GENERATION (default)',
                        freshCookiesPerVideo,
                        fullLogin: useFullLogin,
                        unifiedVideoSession,
                    });

                    const token = await generateToken(flowAccountCode, projectId, cookieFileName, action, {
                        freshCookiesPerVideo,
                        fullLogin: useFullLogin,
                        unifiedVideoSession,
                    });
                    
                    if (token) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        if (typeof token === 'object' && token.__unified) {
                            res.end(
                                JSON.stringify({
                                    success: true,
                                    token: token.recaptchaToken,
                                    oauthToken: token.oauthToken,
                                    cookieFileName: token.cookieFileName,
                                    credits: token.credits,
                                    unifiedSession: true,
                                })
                            );
                        } else {
                            res.end(JSON.stringify({ success: true, token }));
                        }
                    } else {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Token generation failed' }));
                    }
                } catch (error) {
                    console.error('[Auto Generator] ❌ On-demand generation error:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: error.message }));
                }
            });
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    });
    
    server.listen(GENERATOR_PORT, () => {
        console.log(`[Auto Generator] 🚀 On-demand generator server listening on port ${GENERATOR_PORT}`);
    });
    
    return server;
}

/**
 * Start the on-demand generation service
 */
async function start() {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║     reCAPTCHA Auto Generator Service - Starting...            ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║  Bridge Server: ${BRIDGE_SERVER_URL}`);
    console.log(`║  Generator Port: ${GENERATOR_PORT}`);
    console.log(`║  Mode: On-Demand Generation (No Auto Pool)`);
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    // Check bridge server availability
    try {
        const response = await fetch(`${BRIDGE_SERVER_URL}/status`);
        if (!response.ok) {
            throw new Error(`Bridge server returned ${response.status}`);
        }
        console.log('[Auto Generator] ✅ Bridge server is available');
    } catch (error) {
        console.error(`[Auto Generator] ❌ Bridge server not available at ${BRIDGE_SERVER_URL}`);
        console.error('[Auto Generator] 💡 Make sure bridge server is running: node recaptcha_generator/bridge-server.js --port=6003');
        process.exit(1);
    }

    // Scan flow accounts on startup
    availableFlowAccounts = scanFlowAccounts();
    if (availableFlowAccounts.length === 0) {
        console.error('[Auto Generator] ❌ No flow accounts with cookies found!');
        console.error('[Auto Generator] 💡 Please add cookies to backend/cookies/ directory (G1/, G2/, etc.)');
        process.exit(1);
    }
    console.log(`[Auto Generator] 📂 Available flow accounts: ${availableFlowAccounts.map(fa => fa.code).join(', ')}`);

    // Start HTTP server for on-demand generation
    startHttpServer();
    
    console.log('[Auto Generator] ✅ Service ready for on-demand token generation');
}

/**
 * Graceful shutdown
 */
async function shutdown() {
    console.log('\n[Auto Generator] 🛑 Shutting down...');
    
    if (generationInterval) {
        clearInterval(generationInterval);
    }

    if (browser) {
        await browser.close();
        browser = null;
    }

    console.log('[Auto Generator] ✅ Shutdown complete');
    process.exit(0);
}

// Export for in-process use by bridge-server (single process, one window)
export { generateToken };

// Only start HTTP server when run as standalone script (not when imported by bridge)
const isMain = process.argv[1] && (process.argv[1].endsWith('auto-generator.js') || process.argv[1].includes('auto-generator'));
if (isMain) {
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    start().catch(error => {
        console.error('[Auto Generator] ❌ Fatal error:', error);
        process.exit(1);
    });
}
