/**
 * Centralized configuration for application-wide constants.
 * Unified version that works for both Electron and Web.
 */
import { isElectron, isLocalhost } from './environment';
import { BRAND_CONFIG } from './brandConfig';

export const APP_VERSION = isElectron()
  ? BRAND_CONFIG.appVersion.electron
  : BRAND_CONFIG.appVersion.web;

const PROD_API = `https://api.${BRAND_CONFIG.domain}`;

/** Optional override — `.env`: `VITE_BOT_ADMIN_API_URL` (same-origin proxy, etc.) */
const envBotAdminBase = (import.meta.env?.VITE_BOT_ADMIN_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '';

export const getBotAdminApiUrl = (): string => {
  if (isLocalhost() || isElectron()) {
    return 'http://localhost:1247';
  }
  if (envBotAdminBase) return envBotAdminBase;
  return PROD_API;
};

export const getBotAdminApiUrlWithFallback = async (): Promise<string> => {
  if (isLocalhost() || isElectron()) {
    return 'http://localhost:1247';
  }
  if (envBotAdminBase) return envBotAdminBase;
  return PROD_API;
};

export const BOT_ADMIN_API_URL = getBotAdminApiUrl();
