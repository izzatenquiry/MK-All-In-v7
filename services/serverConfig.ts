/**
 * Centralized configuration for Proxy Servers.
 * Unified version that works for both Electron and Web.
 */
import { isElectron, isLocalhost } from './environment';
import { BRAND_CONFIG } from './brandConfig';

/**
 * Get localhost server URL with appropriate protocol
 * Uses HTTP for backend server (port 3001) as it's a separate service
 */
export const getLocalhostServerUrl = (): string => {
  // Backend server runs on HTTP, so always use http://localhost:3001
  return 'http://localhost:3001';
};

// Proxy server URLs - Brand-aware (ESAIE uses esaie.tech, MONOKLIX uses monoklix.com)
// ESAIE: s1-s5 (5 servers), MONOKLIX: s1-s12 (12 servers)
const getProxyServerUrls = (): string[] => {
  const isEsaie = BRAND_CONFIG.name === 'ESAIE';
  const domain = isEsaie ? 'esaie.tech' : 'monoklix.com';
  const maxServers = isEsaie ? 5 : 12; // ESAIE: 5 servers, MONOKLIX: 12 servers
  const servers: string[] = [];
  for (let i = 1; i <= maxServers; i++) {
    servers.push(`https://s${i}.${domain}`);
  }
  return servers;
};

export const PROXY_SERVER_URLS = getProxyServerUrls();

/**
 * Helper to generate structured server objects for UI components (Dashboards, etc).
 * Returns array of { id, name, url }
 */
export const UI_SERVER_LIST = PROXY_SERVER_URLS.map((url, index) => {
  const id = `s${index + 1}`;
  let name = `Server S${index + 1}`;

  // Label S1, S2, S3, S4, and S6 for iOS users
  if (['s1', 's2', 's3', 's4', 's6'].includes(id)) {
    name += ' (iOS)';
  }
  
  // Label S12 for Admin/Special users (VIP)
  if (id === 's12') {
    name += ' (VIP)';
  }

  return {
    id,
    name,
    url
  };
});

/**
 * Get the server URL
 * - Electron: always returns localhost:3001
 * - Web: returns selected server, or default production server (NOT localhost in production)
 */
export const getServerUrl = (): string => {
  // Electron: always localhost
  if (isElectron()) {
    return getLocalhostServerUrl();
  }
  
  // Web: can use multiple servers
  const selected = sessionStorage.getItem('selectedProxyServer');
  
  // If server is selected, use it
  if (selected) {
    return selected;
  }
  
  // No server selected yet - use default based on environment
  if (isLocalhost()) {
    // Development: use localhost
    return getLocalhostServerUrl();
  }
  
  // Production: use default server (s1) instead of localhost
  // This prevents CORS errors when health check runs before server assignment
  const isEsaie = BRAND_CONFIG.name === 'ESAIE';
  const domain = isEsaie ? 'esaie.tech' : 'monoklix.com';
  return `https://s1.${domain}`;
};

