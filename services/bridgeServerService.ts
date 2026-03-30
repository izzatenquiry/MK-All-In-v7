/**
 * Bridge Server Service - Fetch reCAPTCHA tokens from Auto Generator Service
 * 
 * - Localhost: http://localhost:6003
 * - Production: set VITE_BRIDGE_PRODUCTION_URL or default below
 * No Chrome Extension required - fully automated.
 */

import { isElectron, isLocalhost } from './environment';

const DEFAULT_BRIDGE_PORT = 6003;

/** Puppeteer: one cookie file → OAuth (Flask) + reCAPTCHA (same browser) — see GET /get-fresh-token?unifiedSession=1 */
export interface BridgeUnifiedVideoSession {
  recaptchaToken: string;
  oauthToken: string;
  cookieFileName?: string;
  credits?: number | null;
}
const PRODUCTION_BRIDGE_URL =
  ((import.meta as any).env?.VITE_BRIDGE_PRODUCTION_URL as string | undefined) || 'https://captcha.veoly-ai.com';

export function getBridgeServerUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.VITE_BRIDGE_URL || PRODUCTION_BRIDGE_URL;
  }
  // Electron loads file:// (or custom protocol) — hostname is not localhost; still use local bridge like getVeoProxyUrl / token gen.
  if (isLocalhost() || isElectron()) {
    const customPort = localStorage.getItem('bridgeServerPort');
    return customPort ? `http://localhost:${customPort}` : `http://localhost:${DEFAULT_BRIDGE_PORT}`;
  }
  return PRODUCTION_BRIDGE_URL;
}

const BRIDGE_TIMEOUT = 90000; // 90 seconds (Puppeteer token generation can be slow)

export interface BridgeServerConfig {
  bridgeUrl?: string; // Optional: override default URL
  timeout?: number;  // Optional: override default timeout
}

/**
 * Get fresh reCAPTCHA token from bridge server
 * 
 * The bridge server will:
 * 1. Generate token on-demand with specific flowAccountCode and projectId
 * 2. Return token immediately after generation
 * 
 * @param config - Optional bridge server configuration
 * @param flowAccountCode - Flow account code (e.g., 'G1', 'E1') to use same cookies as auth token
 * @param projectId - Project ID to use in URL for token generation (must match request body)
 * @param cookieFileName - Cookie file name (e.g., 'flow_g11_c1.json') — seed cookies loaded before navigating; see freshSession
 * @param action - Optional reCAPTCHA action type (VIDEO_GENERATION, IMAGE_GENERATION, etc.)
 * @param freshSession - Optional: false disables “1 video = 1 cookie file” export. Default (omit): bridge treats VIDEO_GENERATION as fresh export on.
 * @param fullLogin - Optional: true = Puppeteer logs in via Google (email/password from Flask :1247) before reCAPTCHA; heavy — use when cookie files are dead.
 */
export async function getTokenFromBridge(
  config?: BridgeServerConfig,
  flowAccountCode?: string,
  projectId?: string,
  cookieFileName?: string,
  action?: string,
  freshSession?: boolean,
  fullLogin?: boolean
): Promise<string> {
  const bridgeUrl = config?.bridgeUrl || getBridgeServerUrl();
  const timeout = config?.timeout || BRIDGE_TIMEOUT;
  
  // Add flowAccountCode, projectId, cookieFileName, and action to query params
  const params = new URLSearchParams();
  if (flowAccountCode) params.append('flowAccountCode', flowAccountCode);
  if (projectId) params.append('projectId', projectId);
  if (cookieFileName) params.append('cookieFileName', cookieFileName);
  if (action) params.append('action', action);
  if (freshSession === true) params.append('freshSession', '1');
  else if (freshSession === false) params.append('freshSession', '0');
  if (fullLogin === true) params.append('fullLogin', '1');
  
  const queryString = params.toString();
  const url = queryString 
    ? `${bridgeUrl}/get-fresh-token?${queryString}`
    : `${bridgeUrl}/get-fresh-token`;
  
  console.log('[Bridge Server] Fetching token from:', url);
  console.log('[Bridge Server] Timeout:', timeout, 'ms');
  if (flowAccountCode) {
    console.log(`[Bridge Server] 🎯 Using flow account: ${flowAccountCode}`);
  }
  if (cookieFileName) {
    console.log(`[Bridge Server] 🎯 Using cookie file: ${cookieFileName} (same as auth token)`);
  }
  if (projectId) {
    console.log(`[Bridge Server] 🎯 Using projectId: ${projectId.substring(0, 8)}...`);
  }
  if (action) {
    console.log(`[Bridge Server] 🎯 Using action: ${action}`);
  }
  
  try {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    // Read response body once
    const responseText = await response.text();
    let data: any;
    
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { error: 'Invalid JSON response', bodyText: responseText };
    }
    
    if (!response.ok) {
      if (response.status === 503) {
        // Pool is empty - auto generator will refill it
        throw new Error(`Bridge server pool is empty. Auto generator is refilling pool. Please retry in a few seconds.`);
      }

      const detail =
        typeof data?.message === 'string' && data.message.trim()
          ? `${data.error ? `${data.error}: ` : ''}${data.message}`.trim()
          : data?.error || data?.message || 'Unknown error';
      throw new Error(`Bridge server returned ${response.status}: ${response.statusText}. Error: ${detail}`);
    }
    
    if (data.success && data.token) {
      console.log('[Bridge Server] ✅ Token received, length:', data.token.length);
      console.log('[Bridge Server] 🔍 Token details:', {
        length: data.token.length,
        firstChars: data.token.substring(0, 20),
        lastChars: data.token.substring(data.token.length - 20),
        tokenId: data.tokenId || 'N/A'
      });
      return data.token;
    } else {
      throw new Error(data.error || 'No token in response');
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Bridge server timeout after ${timeout}ms. Make sure auto generator service is running and bridge server is accessible.`);
    }
    throw new Error(`Bridge server error: ${error.message}`);
  }
}

/**
 * Unified Flow session: login (optional) → save flow_unified_*.json → Bearer via Flask :1247 → reCAPTCHA on same page.
 * VEOLY-AI — Veo + NanoBanana Pro: unified mode is on by default in apiClient (same fresh session; avoids stale flow_*.json).
 * Opt out: localStorage.setItem('bridgeUnifiedVideoSession', '0').
 * Cookie-only (no Puppeteer password login): localStorage.setItem('bridgeUnifiedVideoSessionFullLogin', '0').
 */
export async function getBridgeUnifiedVideoSession(
  config?: BridgeServerConfig,
  flowAccountCode?: string,
  projectId?: string,
  action?: string,
  fullLogin: boolean = true
): Promise<BridgeUnifiedVideoSession> {
  const bridgeUrl = config?.bridgeUrl || getBridgeServerUrl();
  const timeout = config?.timeout || BRIDGE_TIMEOUT;

  const params = new URLSearchParams();
  params.append('unifiedSession', '1');
  if (flowAccountCode) params.append('flowAccountCode', flowAccountCode);
  if (projectId) params.append('projectId', projectId);
  if (action) params.append('action', action);
  params.append('fullLogin', fullLogin ? '1' : '0');

  const url = `${bridgeUrl}/get-fresh-token?${params.toString()}`;
  console.log('[Bridge Server] Unified session request:', url.replace(/projectId=[^&]+/, 'projectId=…'));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { error: 'Invalid JSON response', bodyText: responseText };
    }

    if (!response.ok) {
      const detail =
        typeof data?.message === 'string' && data.message.trim()
          ? `${data.error ? `${data.error}: ` : ''}${data.message}`.trim()
          : data?.error || data?.message || 'Unknown error';
      throw new Error(`Bridge server returned ${response.status}: ${detail}`);
    }

    if (data.success && data.token && data.oauthToken) {
      return {
        recaptchaToken: data.token,
        oauthToken: data.oauthToken,
        cookieFileName: data.cookieFileName,
        credits: data.credits,
      };
    }
    throw new Error(data.error || data.message || 'Unified session response missing token or oauthToken');
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(
        `Bridge unified session timeout after ${timeout}ms. Ensure bridge + auto-generator run and Flask :1247 is up for OAuth.`
      );
    }
    throw new Error(`Bridge unified session error: ${error.message}`);
  }
}

/**
 * Check if bridge server is available
 * 
 * Note: This checks server availability, not extension registration.
 * Extension is not required - auto generator service handles token generation.
 */
export async function checkBridgeServer(config?: BridgeServerConfig): Promise<boolean> {
  const bridgeUrl = config?.bridgeUrl || getBridgeServerUrl();
  
  console.log('[Bridge Server] 🔍 Checking availability at:', bridgeUrl);
  
  try {
    const response = await fetch(`${bridgeUrl}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout for status check
    });
    
    console.log('[Bridge Server] 🔍 Status check response:', response.status, response.ok);
    
    if (response.ok) {
      try {
        const data = await response.json();
        console.log('[Bridge Server] ✅ Bridge server is available:', data);
      } catch (e) {
        console.log('[Bridge Server] ✅ Bridge server is available (no JSON response)');
      }
    }
    
    return response.ok;
  } catch (error: any) {
    console.error('[Bridge Server] ❌ Status check failed:', error.message);
    console.error('[Bridge Server] ❌ Error type:', error.name);
    if (error.name === 'AbortError') {
      console.error('[Bridge Server] ❌ Timeout: Bridge server did not respond within 5 seconds');
    } else if (error.message?.includes('Failed to fetch')) {
      console.error('[Bridge Server] ❌ Network error: Bridge server may not be running on', bridgeUrl);
      console.error('[Bridge Server] 💡 Localhost: start bridge (port 6003) and auto-generator. Production: ensure your bridge URL (VITE_BRIDGE_PRODUCTION_URL / captcha.veoly-ai.com) is reachable.');
    }
    return false;
  }
}
