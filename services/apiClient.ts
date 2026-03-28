
import { addLogEntry } from './aiLogService';
import { type User } from '../types';
import { supabase } from './supabaseClient';
import { PROXY_SERVER_URLS, getLocalhostServerUrl } from './serverConfig';
import { solveCaptcha } from './antiCaptchaService';
import { solveCaptcha as solveCaptchaEz } from './ezCaptchaService';
import { solveCaptcha as solveCaptchaCap } from './capsolverService';
import { getTokenFromBridge, checkBridgeServer, getBridgeUnifiedVideoSession } from './bridgeServerService';
import { hasActiveTokenUltra, hasActiveTokenUltraWithRegistration, getMasterRecaptchaToken, updateUserProxyServer } from './userService';
import { isElectron, isLocalhost } from './environment';
import { BRAND_CONFIG } from './brandConfig';

// Helper to get brand-aware default server URL
const getDefaultServerUrl = (): string => {
  const isEsaie = BRAND_CONFIG.name === 'ESAIE';
  const domain = isEsaie ? 'esaie.tech' : 'monoklix.com';
  return `https://s1.${domain}`;
};

export const getVeoProxyUrl = (): string => {
  const localhostUrl = getLocalhostServerUrl();
  
  // Electron: always localhost
  if (isElectron()) {
    return localhostUrl;
  }
  
  // Web: selection logic
  if (isLocalhost()) {
    const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
    // If user selected localhost or nothing selected, use localhost
    if (!userSelectedProxy || userSelectedProxy === localhostUrl) {
      return localhostUrl;
    }
    // If user explicitly selected a different server, respect that choice
    return userSelectedProxy;
  }
  
  // Not on localhost - use user selection or default
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
      return userSelectedProxy;
  }
  // Default if nothing selected - Use a known active server (s1)
  return getDefaultServerUrl();
};

export const getImagenProxyUrl = (): string => {
  const localhostUrl = getLocalhostServerUrl();
  
  // Electron: always localhost
  if (isElectron()) {
    return localhostUrl;
  }
  
  // Web: selection logic (same as Veo)
  if (isLocalhost()) {
    const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
    if (!userSelectedProxy || userSelectedProxy === localhostUrl) {
      return localhostUrl;
    }
    return userSelectedProxy;
  }
  
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
      return userSelectedProxy;
  }
  return getDefaultServerUrl();
};

export const getNanobanana2ProxyUrl = (): string => {
  const localhostUrl = getLocalhostServerUrl();
  
  // Electron: always localhost
  if (isElectron()) {
    return localhostUrl;
  }
  
  // Web: selection logic (same as Veo/Imagen)
  if (isLocalhost()) {
    const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
    if (!userSelectedProxy || userSelectedProxy === localhostUrl) {
      return localhostUrl;
    }
    return userSelectedProxy;
  }
  
  // Not on localhost - use user selection or default
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
    return userSelectedProxy;
  }
  return getDefaultServerUrl();
};

const getPersonalTokenLocal = (): { token: string; createdAt: string; } | null => {
    try {
        const userJson = localStorage.getItem('currentUser');
        if (userJson) {
            const user = JSON.parse(userJson);
            if (user && user.personalAuthToken && typeof user.personalAuthToken === 'string' && user.personalAuthToken.trim().length > 0) {
                return { token: user.personalAuthToken, createdAt: 'personal' };
            }
        }
    } catch (e) {
        console.error("Could not parse user from localStorage to get personal token", e);
    }
    return null;
};

// Fallback: Fetch fresh token from DB if missing locally
const getFreshPersonalTokenFromDB = async (): Promise<string | null> => {
    try {
        const userJson = localStorage.getItem('currentUser');
        if (!userJson) {
            console.warn('[API Client] No currentUser in localStorage');
            return null;
        }
        
        const user = JSON.parse(userJson);
        if (!user || !user.id) {
            console.warn('[API Client] User object invalid or missing ID');
            return null;
        }

        // Removed sensitive data logging - user ID is sensitive
        // console.log(`[API Client] Fetching token for user ${user.id} from DB...`);
        const { data, error } = await supabase
            .from('users')
            .select('personal_auth_token')
            .eq('id', user.id)
            .single();
            
        if (error) {
            console.error('[API Client] Supabase error fetching token:', error);
            return null;
        }

        if (data && data.personal_auth_token) {
            // Update local storage to prevent future fetches
            const updatedUser = { ...user, personalAuthToken: data.personal_auth_token };
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            console.log('[API Client] Refreshed personal token from DB and updated localStorage.');
            return data.personal_auth_token;
        } else {
            console.warn('[API Client] DB query returned no token (null/empty).');
        }
    } catch (e) {
        console.error("[API Client] Exception refreshing token from DB", e);
    }
    return null;
};

const getCurrentUserInternal = (): User | null => {
    try {
        const savedUserJson = localStorage.getItem('currentUser');
        if (savedUserJson) {
            const user = JSON.parse(savedUserJson) as User;
            if (user && user.id) {
                return user;
            }
        }
    } catch (error) {
        console.error("Failed to parse user from localStorage for activity log.", error);
    }
    return null;
};

/**
 * Flow folder code (G1, G2, …) for bridge unified Veo. User object in localStorage may omit email_code
 * even when Token Ultra registration exists only in sessionStorage.
 */
function resolveFlowAccountCodeForVeo(): string | null {
  const u = getCurrentUserInternal();
  if (!u) return null;
  const fromUser = `${u.email_code || ''}`.trim() || `${u.flow_account_code || ''}`.trim();
  if (fromUser) return fromUser;
  try {
    const raw = sessionStorage.getItem(`token_ultra_registration_${u.id}`);
    if (raw) {
      const reg = JSON.parse(raw) as { email_code?: string | null };
      const code = `${reg?.email_code || ''}`.trim();
      if (code) return code;
    }
  } catch {
    /* ignore */
  }
  if (typeof localStorage !== 'undefined') {
    const manual = `${localStorage.getItem('veoFlowAccountCode') || ''}`.trim();
    if (manual) return manual.toUpperCase();
  }
  try {
    const env = import.meta.env?.VITE_DEFAULT_VEO_FLOW_ACCOUNT as string | undefined;
    if (env && `${env}`.trim()) return `${env}`.trim().toUpperCase();
  } catch {
    /* ignore */
  }
  return null;
}

/** Same as resolveFlowAccountCodeForVeo but awaits Token Ultra registration if session cache is empty (first click race). */
async function resolveFlowAccountCodeForVeoAsync(): Promise<string | null> {
  const sync = resolveFlowAccountCodeForVeo();
  if (sync) return sync;
  const u = getCurrentUserInternal();
  if (!u?.id) return null;
  try {
    const { hasActiveTokenUltraWithRegistration } = await import('./userService');
    const { registration } = await hasActiveTokenUltraWithRegistration(u.id, false);
    const code = `${registration?.email_code || ''}`.trim();
    if (code) {
      try {
        sessionStorage.setItem(`token_ultra_registration_${u.id}`, JSON.stringify(registration));
      } catch {
        /* ignore */
      }
      return code;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Get selected captcha provider from localStorage
 * Default: 'anti-captcha' (Anti-Captcha.com Standard) - consistent with FlowLogin component
 */
type CaptchaProvider = 'anti-captcha' | 'ez-captcha' | 'capsolver' | 'bridge-server';
const getCaptchaProvider = (): CaptchaProvider => {
    const currentUser = getCurrentUserInternal();
    const isAdmin = currentUser?.role === 'admin';
    
    // Non-admin: Always use anti-captcha
    if (!isAdmin) {
        // Force save anti-captcha to localStorage to prevent override
        localStorage.setItem('captchaProvider', 'anti-captcha');
        console.log('[API Client] Non-admin user - forcing anti-captcha provider');
        return 'anti-captcha';
    }
    
    // Admin: Use saved preference or default to anti-captcha
    const stored = localStorage.getItem('captchaProvider') as CaptchaProvider;
    const provider = stored || 'anti-captcha';
    
    // Debug logging
    console.log('[API Client] getCaptchaProvider() called:', {
        isAdmin,
        storedValue: stored,
        selectedProvider: provider,
        timestamp: new Date().toISOString()
    });
    
    return provider;
};

/**
 * Get reCAPTCHA token from selected captcha provider
 * Returns null if captcha provider is disabled or if there's an error
 * @param projectId - Optional project ID to use for captcha solving (must match request body)
 * @param action - Optional reCAPTCHA action type (VIDEO_GENERATION, IMAGE_GENERATION, etc.)
 * @param onStatusUpdate - Optional callback for status updates
 */
const getRecaptchaToken = async (projectId?: string, action?: string, onStatusUpdate?: (status: string) => void): Promise<string | null> => {
    try {
        // Anti-captcha is always enabled
        const currentUser = getCurrentUserInternal();
        if (!currentUser) {
            console.error('[API Client] getRecaptchaToken: No current user found');
            return null;
        }

        // Import BRAND_CONFIG dynamically to avoid circular dependency
        const { BRAND_CONFIG } = await import('./brandConfig');

        // For ESAIE: Always use master token
        if (BRAND_CONFIG.name === 'ESAIE') {
            const cachedMasterToken = sessionStorage.getItem('master_recaptcha_token');
            let apiKey: string;
            
            if (cachedMasterToken && cachedMasterToken.trim()) {
                apiKey = cachedMasterToken;
                console.log('[API Client] Using master recaptcha token (ESAIE user)');
            } else {
                // Fallback: try to fetch if not cached
                console.warn('[API Client] Master token not in cache, fetching...');
                const masterTokenResult = await getMasterRecaptchaToken();
                if (masterTokenResult.success && masterTokenResult.apiKey) {
                    apiKey = masterTokenResult.apiKey;
                    console.log('[API Client] Using master recaptcha token (ESAIE user - fetched)');
                } else {
                    console.error('[API Client] Master token fetch failed for ESAIE user');
                    return null; // ESAIE must have master token
                }
            }

            // Continue with apiKey for ESAIE (skip to end of function)
            if (!apiKey.trim()) {
                console.error('[API Client] ❌ Anti-Captcha enabled but no master API key configured for ESAIE');
                return null;
            }

            // Use projectId from parameter (from request body), fallback to localStorage, then undefined (will auto-generate)
            const finalProjectId = projectId || localStorage.getItem('antiCaptchaProjectId') || undefined;

            // Get selected provider
            const provider = getCaptchaProvider();
            console.log(`[API Client] Using captcha provider: ${provider}`);
            if (action) {
                console.log(`[API Client] Using action: ${action}`);
            }

            if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA...');
            
            // Route to appropriate provider
            if (provider === 'bridge-server') {
                console.log('[API Client] 🌉 Using Bridge Server (Auto Generator)');
                if (onStatusUpdate) onStatusUpdate('Generating reCAPTCHA token...');
                
                // Check if bridge server is available first
                console.log('[API Client] 🔍 Checking bridge server availability...');
                const isAvailable = await checkBridgeServer();
                console.log('[API Client] 🔍 Bridge server check result:', isAvailable ? '✅ AVAILABLE' : '❌ NOT AVAILABLE');
                
                if (!isAvailable) {
                    const errorMsg = 'Bridge server is not available. Localhost: start bridge (port 6003) and auto-generator. Production: ensure https://captcha.monoklix.com is reachable.';
                    console.error('[API Client] ❌', errorMsg);
                    if (onStatusUpdate) onStatusUpdate('Bridge server unavailable');
                    throw new Error(errorMsg);
                }

                // Get current user's flow_account_code
                const flowAccountCode = currentUser?.email_code || currentUser?.flow_account_code || null;
                
                // Get cookie_file name from user profile (stored in Supabase when auth token was generated)
                const cookieFileName = currentUser?.lastCookiesFile || null;
                
                if (flowAccountCode) {
                    console.log(`[API Client] 🎯 Using flow account: ${flowAccountCode} for reCAPTCHA token`);
                } else {
                    console.warn('[API Client] ⚠️ No flow_account_code found for user - token may not match auth token');
                }
                
                if (cookieFileName) {
                    console.log(`[API Client] 🎯 Using cookie file: ${cookieFileName} for reCAPTCHA token (same as auth token)`);
                } else {
                    console.warn('[API Client] ⚠️ No cookie file name available - reCAPTCHA token may use different cookie file');
                }
                
                if (finalProjectId) {
                    console.log(`[API Client] 🎯 Using projectId: ${finalProjectId.substring(0, 8)}... for reCAPTCHA token`);
                }
                
                console.log('[API Client] ✅ Bridge server is available, fetching token...');
                const token = await getTokenFromBridge(undefined, flowAccountCode, finalProjectId, cookieFileName, action);

                if (token) {
                    console.log('[API Client] ✅ reCAPTCHA token obtained, length:', token.length);
                } else {
                    console.error('[API Client] ❌ solveCaptcha returned null/empty token');
                }
                return token;
            } else if (provider === 'anti-captcha') {
                console.log('[API Client] 🛡️ Using Anti-Captcha service');
                if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA with Anti-Captcha...');
                const token = await solveCaptcha({
                    apiKey: apiKey,
                    projectId: finalProjectId,
                    action: action // Pass dynamic action parameter
                });
                return token;
            } else if (provider === 'ez-captcha') {
                console.log('[API Client] 🛡️ Using EZ-Captcha service');
                if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA with EZ-Captcha...');
                const token = await solveCaptchaEz({
                    apiKey: apiKey,
                    projectId: finalProjectId
                });
                return token;
            } else if (provider === 'capsolver') {
                console.log('[API Client] 🛡️ Using CapSolver service');
                if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA with CapSolver...');
                const token = await solveCaptchaCap({
                    apiKey: apiKey,
                    projectId: finalProjectId
                });
                return token;
            } else {
                throw new Error(`Unknown captcha provider: ${provider}`);
            }
        }

        // For MONOKLIX: Use logic based on Token Ultra status
        // Default: Use personal token from users.recaptcha_token
        let apiKey = currentUser.recaptchaToken || '';

        // Force personal token for Veo flows.
        // In practice, master token frequently causes 403 "reCAPTCHA evaluation failed" for I2V/T2V.
        const forcePersonalForVeo =
          action === 'VIDEO_GENERATION' || action === 'FLOW_GENERATION';
        if (forcePersonalForVeo) {
          apiKey = currentUser.recaptchaToken || '';
          console.log('[API Client] 🛡️ Force using personal Anti-Captcha key for VEO action:', action);
        }

        // Check Token Ultra registration status
        // Try to get from cache first
        const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
        let tokenUltraReg: any = null;
        
        if (cachedReg) {
            try {
                tokenUltraReg = JSON.parse(cachedReg);
            } catch (e) {
                console.warn('[API Client] Failed to parse cached registration', e);
            }
        }

        // If not in cache, fetch from database
        if (!tokenUltraReg) {
            const ultraResult = await hasActiveTokenUltraWithRegistration(currentUser.id);
            if (ultraResult.isActive && ultraResult.registration) {
                tokenUltraReg = ultraResult.registration;
            }
        }

        // If Token Ultra is active, check allow_master_token from registration
        if (tokenUltraReg && !forcePersonalForVeo) {
            const expiresAt = new Date(tokenUltraReg.expires_at);
            const now = new Date();
            const isActive = (tokenUltraReg.status === 'active' || tokenUltraReg.status === 'expiring_soon') && expiresAt > now;

            if (isActive) {
                // Token Ultra is active - check allow_master_token from users table
                // null/undefined = true (default), false = block master token
                const isBlockedFromMaster = tokenUltraReg.allow_master_token === false;

                if (!isBlockedFromMaster) {
                    // Token Ultra active + NOT blocked → Use master token
                    const cachedMasterToken = sessionStorage.getItem('master_recaptcha_token');
                    if (cachedMasterToken && cachedMasterToken.trim()) {
                        apiKey = cachedMasterToken;
                        console.log('[API Client] Using master recaptcha token (Token Ultra user)');
                    } else {
                        // Fallback: try to fetch if not cached
                        console.warn('[API Client] Master token not in cache, fetching...');
                        const masterTokenResult = await getMasterRecaptchaToken();
                        if (masterTokenResult.success && masterTokenResult.apiKey) {
                            apiKey = masterTokenResult.apiKey;
                            console.log('[API Client] Using master recaptcha token (Token Ultra user - fetched)');
                        } else {
                            console.warn('[API Client] Master token fetch failed, falling back to user token');
                            apiKey = currentUser.recaptchaToken || '';
                        }
                    }
                } else {
                    // Token Ultra active but BLOCKED from master token → Use personal token
                    apiKey = currentUser.recaptchaToken || '';
                    console.log('[API Client] Using personal recaptcha token (Token Ultra user - master token blocked)');
                }
            } else {
                // Token Ultra expired/inactive → Use personal token
                apiKey = currentUser.recaptchaToken || '';
                console.log('[API Client] Using user\'s own recaptcha token (Token Ultra expired)');
            }
        } else {
            // Normal User (no Token Ultra) → Use personal token
            if (apiKey) {
                console.log('[API Client] Using user\'s own recaptcha token (Normal User)');
            }
        }

        if (!apiKey.trim()) {
            console.error('[API Client] ❌ Anti-Captcha enabled but no API key configured', {
                hasTokenUltra: !!tokenUltraReg,
                hasUserToken: !!currentUser.recaptchaToken
            });
            return null;
        }

        // Use projectId from parameter (from request body), fallback to localStorage, then undefined (will auto-generate)
        const finalProjectId = projectId || localStorage.getItem('antiCaptchaProjectId') || undefined;

        // Get selected provider
        const provider = getCaptchaProvider();
        console.log(`[API Client] Using captcha provider: ${provider}`);
        if (action) {
            console.log(`[API Client] Using action: ${action}`);
        }

        if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA...');
        
        // Route to appropriate provider
        if (provider === 'bridge-server') {
            console.log('[API Client] 🌉 Using Bridge Server (Auto Generator - MONOKLIX)');
            if (onStatusUpdate) onStatusUpdate('Generating reCAPTCHA token...');
            
            // Check if bridge server is available first
            console.log('[API Client] 🔍 Checking bridge server availability...');
            const isAvailable = await checkBridgeServer();
            console.log('[API Client] 🔍 Bridge server check result:', isAvailable ? '✅ AVAILABLE' : '❌ NOT AVAILABLE');
            
            if (!isAvailable) {
                const errorMsg = 'Bridge server is not available. Localhost: start bridge (port 6003) and auto-generator. Production: ensure https://captcha.monoklix.com is reachable.';
                console.error('[API Client] ❌', errorMsg);
                if (onStatusUpdate) onStatusUpdate('Bridge server unavailable');
                throw new Error(errorMsg);
            }

            // Get current user's flow_account_code
            const flowAccountCode = currentUser?.email_code || currentUser?.flow_account_code || null;
            
            // Get cookie_file name from user profile (stored in Supabase when auth token was generated)
            const cookieFileName = currentUser?.lastCookiesFile || null;
            
            if (flowAccountCode) {
                console.log(`[API Client] 🎯 Using flow account: ${flowAccountCode} for reCAPTCHA token`);
            } else {
                console.warn('[API Client] ⚠️ No flow_account_code found for user - token may not match auth token');
            }
            
            if (cookieFileName) {
                console.log(`[API Client] 🎯 Using cookie file: ${cookieFileName} for reCAPTCHA token (same as auth token)`);
            } else {
                console.warn('[API Client] ⚠️ No cookie file name available - reCAPTCHA token may use different cookie file');
            }
            
            if (finalProjectId) {
                console.log(`[API Client] 🎯 Using projectId: ${finalProjectId.substring(0, 8)}... for reCAPTCHA token`);
            }
            
            console.log('[API Client] ✅ Bridge server is available, fetching token...');
            const token = await getTokenFromBridge(undefined, flowAccountCode, finalProjectId, cookieFileName, action);
            
            if (token) {
                console.log('[API Client] ✅ reCAPTCHA token obtained, length:', token.length);
                console.log('[API Client] 🔍 Token freshness check:', {
                    length: token.length,
                    firstChars: token.substring(0, 20),
                    lastChars: token.substring(token.length - 20),
                    timestamp: new Date().toISOString()
                });
            } else {
                console.error('[API Client] ❌ Bridge server returned null/empty token');
            }
            
            // ✅ Ensure token is used immediately (not cached) - return fresh token
            return token;
        } else if (provider === 'anti-captcha') {
            console.log('[API Client] 🛡️ Using Anti-Captcha service');
            if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA with Anti-Captcha...');
            const token = await solveCaptcha({
                apiKey: apiKey,
                projectId: finalProjectId,
                action: action // Pass dynamic action parameter
            });
            return token;
        } else if (provider === 'ez-captcha') {
            console.log('[API Client] 🛡️ Using EZ-Captcha service');
            if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA with EZ-Captcha...');
            const token = await solveCaptchaEz({
                apiKey: apiKey,
                projectId: finalProjectId
            });
            return token;
        } else if (provider === 'capsolver') {
            console.log('[API Client] 🛡️ Using CapSolver service');
            if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA with CapSolver...');
            const token = await solveCaptchaCap({
                apiKey: apiKey,
                projectId: finalProjectId
            });
            return token;
        } else {
            throw new Error(`Unknown captcha provider: ${provider}`);
        }
    } catch (error) {
        console.error('[API Client] ❌ Failed to get reCAPTCHA token:', error);
        // Don't throw error, just return null and let request proceed without captcha token
        // Server might handle it differently
        return null;
    }
};

/**
 * Get reCAPTCHA token from anti-captcha.com - PERSONAL KEY ONLY
 * For NANOBANANA PRO: Only uses personal key, NEVER uses master key
 * Returns null if personal key is not configured
 * @param projectId - Optional project ID to use for captcha solving (must match request body)
 * @param action - Optional reCAPTCHA action type (VIDEO_GENERATION, IMAGE_GENERATION, etc.)
 * @param onStatusUpdate - Optional callback for status updates
 */
const getPersonalRecaptchaToken = async (projectId?: string, action?: string, onStatusUpdate?: (status: string) => void): Promise<string | null> => {
    try {
        const currentUser = getCurrentUserInternal();
        if (!currentUser) {
            console.error('[API Client] getPersonalRecaptchaToken: No current user found');
            return null;
        }

        // NANOBANANA PRO: Force use personal key only - NEVER use master key
        const personalKey = currentUser.recaptchaToken || '';
        
        if (!personalKey.trim()) {
            console.error('[API Client] ❌ NANOBANANA PRO requires personal Anti-Captcha API key');
            if (onStatusUpdate) onStatusUpdate('Personal Anti-Captcha API key required');
            return null;
        }

        console.log('[API Client] Using personal Anti-Captcha API key for NANOBANANA PRO');

        // Use projectId from parameter (from request body), fallback to localStorage, then undefined (will auto-generate)
        const finalProjectId = projectId || localStorage.getItem('antiCaptchaProjectId') || undefined;

        // Get selected provider
        const provider = getCaptchaProvider();
        console.log(`[API Client] Using captcha provider: ${provider}`);
        if (action) {
            console.log(`[API Client] Using action: ${action}`);
        }

        if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA...');
        
        // Route to appropriate provider
        if (provider === 'bridge-server') {
            console.log('[API Client] 🌉 Using Bridge Server (Auto Generator - personal key)');
            if (onStatusUpdate) onStatusUpdate('Generating reCAPTCHA token...');
            
            // Check if bridge server is available first
            console.log('[API Client] 🔍 Checking bridge server availability...');
            const isAvailable = await checkBridgeServer();
            console.log('[API Client] 🔍 Bridge server check result:', isAvailable ? '✅ AVAILABLE' : '❌ NOT AVAILABLE');
            
            if (!isAvailable) {
                const errorMsg = 'Bridge server is not available. Localhost: start bridge (port 6003) and auto-generator. Production: ensure https://captcha.monoklix.com is reachable.';
                console.error('[API Client] ❌', errorMsg);
                if (onStatusUpdate) onStatusUpdate('Bridge server unavailable');
                throw new Error(errorMsg);
            }

            // Get current user's flow_account_code and cookie_file name (if available)
            const flowAccountCode = currentUser?.email_code || currentUser?.flow_account_code || null;
            const cookieFileName = currentUser?.lastCookiesFile || null;
            
            console.log('[API Client] ✅ Bridge server is available, fetching token...');
            const token = await getTokenFromBridge(undefined, flowAccountCode, finalProjectId, cookieFileName, action);

            if (token) {
                console.log('[API Client] ✅ reCAPTCHA token obtained (personal key), length:', token.length);
                console.log('[API Client] 🔍 Token freshness check:', {
                    length: token.length,
                    firstChars: token.substring(0, 20),
                    lastChars: token.substring(token.length - 20),
                    timestamp: new Date().toISOString()
                });
            } else {
                console.error('[API Client] ❌ Bridge server returned null/empty token');
            }
            // ✅ Ensure token is used immediately (not cached) - return fresh token
            return token;
        } else if (provider === 'anti-captcha') {
            console.log('[API Client] 🛡️ Using Anti-Captcha service (personal key)');
            if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA with Anti-Captcha...');
            const token = await solveCaptcha({
                apiKey: personalKey,
                projectId: finalProjectId,
                action: action // Pass dynamic action parameter
            });
            return token;
        } else if (provider === 'ez-captcha') {
            console.log('[API Client] 🛡️ Using EZ-Captcha service (personal key)');
            if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA with EZ-Captcha...');
            const token = await solveCaptchaEz({
                apiKey: personalKey,
                projectId: finalProjectId
            });
            return token;
        } else if (provider === 'capsolver') {
            console.log('[API Client] 🛡️ Using CapSolver service (personal key)');
            if (onStatusUpdate) onStatusUpdate('Solving reCAPTCHA with CapSolver...');
            const token = await solveCaptchaCap({
                apiKey: personalKey,
                projectId: finalProjectId
            });
            return token;
        } else {
            throw new Error(`Unknown captcha provider: ${provider}`);
        }
    } catch (error) {
        console.error('[API Client] ❌ Failed to get reCAPTCHA token (personal key):', error);
        return null;
    }
};

// --- EXECUTE REQUEST (STRICT PERSONAL TOKEN ONLY) ---

export const executeProxiedRequest = async (
  relativePath: string,
  serviceType: 'veo' | 'imagen' | 'nanobanana' | 'nanobanana2',
  requestBody: any,
  logContext: string,
  specificToken?: string,
  onStatusUpdate?: (status: string) => void,
  overrideServerUrl?: string // New parameter to force a specific server
): Promise<{ data: any; successfulToken: string; successfulServerUrl: string }> => {
  const isStatusCheck = logContext === 'VEO STATUS';
  const isHealthCheck = logContext.includes('HEALTH CHECK');
  
  if (!isStatusCheck) {
      console.log(`[API Client] Starting process for: ${logContext}`);
  }
  
  // Use override URL if provided, otherwise default to standard proxy selection
  let currentServerUrl: string;
  if (overrideServerUrl) {
    currentServerUrl = overrideServerUrl;
  } else if (serviceType === 'veo') {
    currentServerUrl = getVeoProxyUrl();
  } else if (serviceType === 'imagen' || serviceType === 'nanobanana') {
    currentServerUrl = getImagenProxyUrl();
  } else if (serviceType === 'nanobanana2') {
    currentServerUrl = getImagenProxyUrl(); // Use same proxy URL for nanobanana2
  } else {
    throw new Error(`Unknown service type: ${serviceType}`);
  }
  
  // 1. Determine reCAPTCHA action based on service type and log context
  const isGenerationRequest = logContext.includes('GENERATE') || logContext.includes('RECIPE') || logContext.includes('UPLOAD') || logContext.includes('HEALTH CHECK');
  // For reCAPTCHA: only GENERATE and HEALTH CHECK for Veo and NANOBANANA 2 (exclude UPLOAD, Imagen, and whisk-based nanobanana)
  // NANOBANANA 2 uses flowMedia endpoint and needs recaptcha, but whisk-based nanobanana (same as Imagen) does not
  const isNanobanana2 = serviceType === 'nanobanana2';
  const needsRecaptcha = (logContext.includes('GENERATE') || logContext.includes('HEALTH CHECK')) && (serviceType === 'veo' || isNanobanana2);
  let recaptchaAction: string | undefined = undefined;

  if (isGenerationRequest && needsRecaptcha) {
    // Determine action based on service type and operation
    if (serviceType === 'veo') {
      // For Veo endpoints (I2V/T2V), reCAPTCHA action must be aligned to VIDEO generation.
      recaptchaAction = 'VIDEO_GENERATION';
    } else if (serviceType === 'nanobanana2' || serviceType === 'imagen') {
      // NANOBANANA 2 and Imagen are both for image generation
      recaptchaAction = 'IMAGE_GENERATION';
    } else {
      recaptchaAction = 'FLOW_GENERATION'; // Default fallback
    }
    console.log(`[API Client] 🎯 Using reCAPTCHA action: ${recaptchaAction}`);
  }

  // 2. Get reCAPTCHA token if needed
  let recaptchaToken: string | null = null;
  /** When bridge unified session is used, Bearer must match the same cookie file as reCAPTCHA */
  let bridgeUnifiedOAuth: string | undefined;
  let useBridgeUnifiedForVeo = false;

  // Only get reCAPTCHA token for Veo and NANOBANANA 2 GENERATE requests, not for UPLOAD or Imagen
  // Extract projectId from request body if exists (MUST match for Google API validation)
  // For NANOBANANA 2, projectId is in requests[0].clientContext.projectId
  const projectIdFromBody = requestBody.clientContext?.projectId || requestBody.requests?.[0]?.clientContext?.projectId;
  
  // ✅ CRITICAL: Each request MUST generate a fresh reCAPTCHA token
  // reCAPTCHA tokens can only be used ONCE - reusing will cause 403 errors
  let tokenGenerationTimestamp = Date.now();
  
  if (needsRecaptcha) {
    // ✅ Verify projectId match for debugging
    if (projectIdFromBody) {
      console.log('[API Client] 🔍 Using projectId for reCAPTCHA:', projectIdFromBody.substring(0, 8) + '...' + projectIdFromBody.substring(projectIdFromBody.length - 8));
      console.log('[API Client] 🔍 projectId in request body matches:', projectIdFromBody === requestBody.clientContext?.projectId ? '✅ MATCH' : '⚠️ DIFFERENT');
    } else {
      console.warn('[API Client] ⚠️ No projectId found in request body - will generate new one for reCAPTCHA');
    }
    
    console.log('[API Client] 🔄 Generating FRESH reCAPTCHA token for this request (timestamp:', new Date(tokenGenerationTimestamp).toISOString() + ')');

    // Veo (MONOKLIX): default to Puppeteer unified session — one cookie file → OAuth Bearer + reCAPTCHA (no manual Token Setting).
    // Opt out: localStorage.setItem('bridgeUnifiedVideoSession', '0')
    const bridgeUnifiedOptOut =
      typeof localStorage !== 'undefined' && localStorage.getItem('bridgeUnifiedVideoSession') === '0';
    const wantAutoUnifiedVeo =
      serviceType === 'veo' &&
      BRAND_CONFIG.name !== 'ESAIE' &&
      !bridgeUnifiedOptOut;

    if (wantAutoUnifiedVeo) {
      const resolvedFlow = await resolveFlowAccountCodeForVeoAsync();
      try {
        const bridgeOk = await checkBridgeServer();
        const canUnified = !!(bridgeOk && resolvedFlow && projectIdFromBody);

        if (canUnified) {
          useBridgeUnifiedForVeo = true;
          const fullLogin =
            typeof localStorage !== 'undefined' && localStorage.getItem('bridgeUnifiedVideoSessionFullLogin') !== '0';
          if (onStatusUpdate) onStatusUpdate('Auto: Puppeteer (login + cookies + OAuth + reCAPTCHA)...');
          const pack = await getBridgeUnifiedVideoSession(
            undefined,
            resolvedFlow,
            projectIdFromBody,
            recaptchaAction,
            fullLogin
          );
          recaptchaToken = pack.recaptchaToken;
          bridgeUnifiedOAuth = pack.oauthToken;
        } else {
          if (!bridgeOk) {
            console.warn(
              '[API Client] Bridge server not reachable — using captcha provider + saved token. Start bridge :6003 + auto-generator + Flask :1247 for auto OAuth.'
            );
          } else if (!resolvedFlow) {
            console.warn(
              '[API Client] No flow folder code (G1/G2). Set users.email_code, localStorage veoFlowAccountCode, or VITE_DEFAULT_VEO_FLOW_ACCOUNT — or use Token Setting for a manual token.'
            );
          } else if (!projectIdFromBody) {
            console.warn('[API Client] No projectId in request — skipping unified Veo.');
          }
        }
      } catch (unifiedErr: unknown) {
        useBridgeUnifiedForVeo = false;
        const msg = unifiedErr instanceof Error ? unifiedErr.message : String(unifiedErr);
        if (resolvedFlow && projectIdFromBody) {
          throw new Error(
            `Auto Veo (Puppeteer) gagal: ${msg}. Pastikan bridge :6003, auto-generator, Flask :1247, dan kredensial flow (${resolvedFlow}) OK.`
          );
        }
        console.warn('[API Client] Unified Veo session failed, falling back to standard captcha/token:', msg);
      }
    }

    if (!recaptchaToken && isNanobanana2) {
        // ESAIE: Use master token (via getRecaptchaToken which auto-handles master for ESAIE)
        // MONOKLIX: Use personal key only (bypass master key)
        if (BRAND_CONFIG.name === 'ESAIE') {
            console.log('[API Client] NANOBANANA 2 (ESAIE): Using master token');
            recaptchaToken = await getRecaptchaToken(projectIdFromBody, recaptchaAction, onStatusUpdate);
        } else {
            console.log('[API Client] NANOBANANA 2 (MONOKLIX): Using personal key only');
            recaptchaToken = await getPersonalRecaptchaToken(projectIdFromBody, recaptchaAction, onStatusUpdate);
        }
    } else if (!recaptchaToken) {
        // Veo / others: only if unified (or NB2) did not already supply a token
        recaptchaToken = await getRecaptchaToken(projectIdFromBody, recaptchaAction, onStatusUpdate);
    }

    // Inject reCAPTCHA token into request body if available
    // Same for Veo and NANOBANANA 2 - only inject in top level clientContext
    // UPDATED: Google now requires recaptchaContext object with token and applicationType
    // IMPORTANT: recaptchaContext must be FIRST in clientContext object (based on HAR file analysis)
    let tokenInjectionTime: number | null = null;
    if (recaptchaToken) {
      // ✅ CRITICAL: Verify projectId match before injection
      const projectIdInRequestBody = requestBody.clientContext?.projectId || requestBody.requests?.[0]?.clientContext?.projectId;
      if (projectIdFromBody && projectIdInRequestBody) {
        const projectIdMatch = projectIdFromBody === projectIdInRequestBody;
        console.log('[API Client] 🔍 CRITICAL: Verifying projectId match:', {
          projectIdUsedForToken: projectIdFromBody,
          projectIdInRequestBody: projectIdInRequestBody,
          match: projectIdMatch ? '✅ MATCH' : '❌ MISMATCH - THIS WILL CAUSE 403!',
          websiteURLUsed: `https://labs.google/fx/tools/flow/project/${projectIdFromBody}`
        });
        if (!projectIdMatch) {
          console.error('[API Client] ❌ PROJECTID MISMATCH DETECTED! Token was generated with different projectId than request body.');
          console.error('[API Client] ⚠️ This will cause 403 "reCAPTCHA evaluation failed" error.');
        }
      } else {
        console.warn('[API Client] ⚠️ Cannot verify projectId match - one or both are missing:', {
          projectIdFromBody: projectIdFromBody || 'MISSING',
          projectIdInRequestBody: projectIdInRequestBody || 'MISSING'
        });
      }

      if (requestBody.clientContext) {
        // ✅ REMOVE old recaptchaToken field (if exists) to avoid conflict with recaptchaContext
        if (requestBody.clientContext.recaptchaToken) {
          delete requestBody.clientContext.recaptchaToken;
        }
        
        // ✅ REMOVE userPaygateTier for NANOBANANA 2 (not required, only for VEO)
        if (serviceType === 'nanobanana2') {
          delete requestBody.clientContext.userPaygateTier;
        }
        
        // ✅ CRITICAL: For NANOBANANA 2, ensure projectId and tool are in top-level clientContext
        // These should come from requests[0].clientContext if not already in top-level
        if (serviceType === 'nanobanana2') {
          const projectIdFromRequest = requestBody.requests?.[0]?.clientContext?.projectId;
          const toolFromRequest = requestBody.requests?.[0]?.clientContext?.tool;
          
          if (projectIdFromRequest && !requestBody.clientContext.projectId) {
            requestBody.clientContext.projectId = projectIdFromRequest;
            console.log('[API Client] ✅ Added projectId to top-level clientContext:', projectIdFromRequest.substring(0, 8) + '...');
          }
          if (toolFromRequest && !requestBody.clientContext.tool) {
            requestBody.clientContext.tool = toolFromRequest;
            console.log('[API Client] ✅ Added tool to top-level clientContext:', toolFromRequest);
          }
        }
        
        // ✅ NEW FORMAT: Google API now requires recaptchaContext object with applicationType
        const recaptchaContext = {
          token: recaptchaToken,
          applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB"
        };
        
        // Ensure sessionId is fresh
        requestBody.clientContext.sessionId = requestBody.clientContext.sessionId || `;${Date.now()}`;

        // HAR-style ordering: recaptchaContext MUST be first key in clientContext (matches Labs browser JSON).
        const { recaptchaContext: _oldRecaptchaContext, ...restClientContext } = requestBody.clientContext;
        requestBody.clientContext = {
          recaptchaContext,
          ...restClientContext,
        };
        
        // Debug: Log token injection
        tokenInjectionTime = Date.now();
        console.log('[API Client] ✅ Injected reCAPTCHA token into request (new format: recaptchaContext)');
        console.log('[API Client] 🔍 Token injection timing:', {
          tokenInjectionTime: new Date(tokenInjectionTime).toISOString(),
          tokenLength: recaptchaToken.length
        });
      }
      
      // ✅ NEW: Also inject recaptchaContext into requests[].clientContext for NANOBANANA 2 (Imagen T2I only)
      // Note: Image to Video (I2V) does NOT need this - only Text to Image (T2I)
      if (serviceType === 'nanobanana2' && requestBody.requests && Array.isArray(requestBody.requests)) {
        requestBody.requests.forEach((req: any, index: number) => {
          if (req.clientContext && typeof req.clientContext === 'object') {
            // ✅ REMOVE old recaptchaToken field (if exists) to avoid conflict with recaptchaContext
            if (req.clientContext.recaptchaToken) {
              delete req.clientContext.recaptchaToken;
            }
            
            // ✅ NEW FORMAT: Direct assignment
            req.clientContext.recaptchaContext = {
              token: recaptchaToken,
              applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB"
            };
            
            console.log(`[API Client] ✅ Injected recaptchaContext into requests[${index}].clientContext (NANOBANANA 2 T2I)`);
          }
        });
      }
      
      console.log('[API Client] ✅ Injected reCAPTCHA token into request body (new format: recaptchaContext)');
      
      // ✅ ADD DELAY: Wait 500ms after token injection to ensure Google processes the token
      // Increased from 300ms to 500ms for better reliability
      console.log('[API Client] ⏳ Waiting 500ms for reCAPTCHA token to be processed by Google...');
      const delayStartTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 500));
      const delayEndTime = Date.now();
      const actualDelay = delayEndTime - delayStartTime;
      console.log('[API Client] ✅ Delay complete (' + actualDelay + 'ms), proceeding with request');
      
      // Log token age at request time
      if (tokenInjectionTime) {
        const tokenAgeAtRequest = Date.now() - tokenInjectionTime;
        console.log('[API Client] 🔍 Token age at request time:', tokenAgeAtRequest + 'ms');
      }
    } else {
      console.error('[API Client] ❌ Failed to get reCAPTCHA token - request will proceed without token');
      // Request will still proceed, but Google API may reject it
    }
  }

  // 2. Resolve Token
  let finalToken = specificToken;
  let sourceLabel: 'Specific' | 'Personal' = 'Specific';

  if (!finalToken) {
      // Step A: Check Local Storage
      const personalLocal = getPersonalTokenLocal();
      if (personalLocal) {
          finalToken = personalLocal.token;
          sourceLabel = 'Personal';
      }

      // Step B: If local missing, check Database
      if (!finalToken) {
          const freshToken = await getFreshPersonalTokenFromDB();
          if (freshToken) {
              finalToken = freshToken;
              sourceLabel = 'Personal';
          }
      }
  }

  if (bridgeUnifiedOAuth) {
    finalToken = bridgeUnifiedOAuth;
    sourceLabel = 'Specific';
    console.log('[API Client] 🔑 Using Bearer from unified bridge session (same cookie file as reCAPTCHA)');
  }

  if (!finalToken) {
      console.error(`[API Client] Authentication failed. No token found in LocalStorage or DB.`);
      throw new Error(`Authentication failed: No Personal Token found. Please go to Settings > Token & API and set your token.`);
  }

  // 4. Log
  if (!isStatusCheck && sourceLabel === 'Personal') {
      // console.log(`[API Client] Using Personal Token: ...${finalToken.slice(-6)}`);
  }

  const currentUser = getCurrentUserInternal();

  // ✅ Check user status before allowing API calls (untuk kedua-dua brand)
  if (currentUser) {
    // Check if user is inactive
    if (currentUser.status === 'inactive') {
      throw new Error('Your account is inactive. Please contact Admin for assistance.');
    }
    
    // Check if subscription expired
    if (currentUser.status === 'subscription' && currentUser.subscriptionExpiry) {
      const now = Date.now();
      if (currentUser.subscriptionExpiry < now) {
        throw new Error('Your subscription has expired. Please renew your subscription.');
      }
    }
    
    // Token Ultra check removed for MONOKLIX - users with personal token + personal anti-captcha key do not require Token Ultra.
  }

  // 4.5. Record server usage with timestamp (fire-and-forget, only for Web version and actual API calls)
  if (!isElectron() && currentUser && currentServerUrl && !isStatusCheck) {
    // Record the actual server being used (not hardcoded)
    updateUserProxyServer(currentUser.id, currentServerUrl).catch(err => {
      // Silently fail - don't block API calls for logging
      console.warn('Failed to record server usage:', err);
    });
  }

  // 5. Execute
  const isVeo = serviceType === 'veo';
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
      // Detect if running in Electron (desktop mode)
      // In Electron, always use absolute URL (file:// protocol doesn't support relative API paths)
      // In browser, use relative path to leverage Vite proxy during development
      const isLocalhostServer = currentServerUrl.includes('localhost:3001');
      const endpoint = (isElectron() || !isLocalhostServer)
          ? `${currentServerUrl}/api/${serviceType}${relativePath}`  // Use absolute URL for Electron or remote servers
          : `/api/${serviceType}${relativePath}`;  // Use proxy path for browser with localhost
      
      // Debug log for endpoint URL
      if (!isStatusCheck && (serviceType === 'nanobanana2' || logContext.includes('NANOBANANA 2'))) {
          console.log(`[API Client] 🍌 NANOBANANA 2 Request - Endpoint: ${endpoint}, ServiceType: ${serviceType}, RelativePath: ${relativePath}`);
      }

      // VEO timeout: avoid "Load failed" on slow mobile when upload/generate takes too long
      const VEO_UPLOAD_TIMEOUT_MS = 120000;   // 2 min for image upload (large payload on mobile)
      const VEO_GENERATE_TIMEOUT_MS = 180000; // 3 min for generate/status
      let abortController: AbortController | null = null;
      if (isVeo) {
        const ms = logContext === 'VEO UPLOAD' ? VEO_UPLOAD_TIMEOUT_MS : VEO_GENERATE_TIMEOUT_MS;
        abortController = new AbortController();
        timeoutId = setTimeout(() => abortController!.abort(), ms);
      }

      const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${finalToken}`,
              'x-user-username': currentUser?.username || 'unknown',
          },
          body: JSON.stringify(requestBody),
          ...(abortController ? { signal: abortController.signal } : {}),
      });
      if (timeoutId) clearTimeout(timeoutId);

      let data;
      const textResponse = await response.text();
      try {
          data = JSON.parse(textResponse);
      } catch {
          data = { error: { message: `Proxy returned non-JSON (${response.status}): ${textResponse.substring(0, 100)}` } };
      }

      if (!response.ok) {
          const status = response.status;
          let errorMessage = data.error?.message || data.message || `API call failed (${status})`;
          const lowerMsg = errorMessage.toLowerCase();

          // Check for authentication errors (401/UNAUTHENTICATED)
          if (status === 401 || lowerMsg.includes('unauthorized') || lowerMsg.includes('unauthenticated') || 
              lowerMsg.includes('invalid authentication credentials') || 
              lowerMsg.includes('request had invalid authentication credentials')) {
              // Create a more informative error message for token issues
              const tokenErrorMsg = `ERROR 401 - Your token is invalid or has expired. Please go to Settings > Token Setting to generate a new token.`;
              console.error(`[API Client] 🔑 Authentication failed (${status}): Token invalid or expired`);
              console.error(`[API Client] 💡 Action required: Generate new token in Settings > Token Setting`);
              throw new Error(tokenErrorMsg);
          }

          // ✅ Check for reCAPTCHA 403 errors - retry with fresh token (based on useapi.net approach)
          // More comprehensive check for reCAPTCHA errors
          const isRecaptchaError = status === 403 && (
              lowerMsg.includes('recaptcha') || 
              lowerMsg.includes('captcha') ||
              data.error?.message?.toLowerCase().includes('recaptcha') ||
              data.error?.message?.toLowerCase().includes('captcha') ||
              (data.error?.status === 'PERMISSION_DENIED' && lowerMsg.includes('evaluation failed'))
          );
          
          if (isRecaptchaError) {
              console.warn(`[API Client] ⚠️ reCAPTCHA 403 error detected. Attempting retry with fresh token...`);
              console.log('[API Client] 🔍 Error details:', {
                  status: status,
                  message: errorMessage,
                  errorMessage: data.error?.message,
                  errorStatus: data.error?.status
              });
              
              // Only retry if we haven't already retried and if this is a generation request with reCAPTCHA
              if (needsRecaptcha && recaptchaToken) {
                  // Generate fresh token and retry once
                  console.log('[API Client] 🔄 Retry attempt: Generating fresh reCAPTCHA token...');
                  
                  let freshToken: string | null = null;
                  let freshOAuth: string | undefined;
                  try {
                      // For VEO we should NOT flip the recaptcha action on retry.
                      // The HAR-success path expects a stable action; switching actions can
                      // cause reCAPTCHA evaluation to be rejected.
                      const retryAction = recaptchaAction;

                      if (isNanobanana2) {
                          if (BRAND_CONFIG.name === 'ESAIE') {
                              freshToken = await getRecaptchaToken(projectIdFromBody, retryAction, onStatusUpdate);
                          } else {
                              freshToken = await getPersonalRecaptchaToken(projectIdFromBody, retryAction, onStatusUpdate);
                          }
                      } else if (useBridgeUnifiedForVeo) {
                          const flowAccountCode = resolveFlowAccountCodeForVeo();
                          const fullLogin =
                              typeof localStorage !== 'undefined' &&
                              localStorage.getItem('bridgeUnifiedVideoSessionFullLogin') !== '0';
                          const pack = await getBridgeUnifiedVideoSession(
                              undefined,
                              flowAccountCode || undefined,
                              projectIdFromBody,
                              retryAction,
                              fullLogin
                          );
                          freshToken = pack.recaptchaToken;
                          freshOAuth = pack.oauthToken;
                      } else {
                          freshToken = await getRecaptchaToken(projectIdFromBody, retryAction, onStatusUpdate);
                      }
                      console.log(`[API Client] 🔄 Retry action used: ${retryAction}`);
                      
                      if (freshToken && requestBody.clientContext) {
                          // ✅ REMOVE old recaptchaToken field (if exists)
                          if (requestBody.clientContext.recaptchaToken) {
                            delete requestBody.clientContext.recaptchaToken;
                          }
                          
                          // Update token in request body using simple format
                          requestBody.clientContext.recaptchaContext = {
                              token: freshToken,
                              applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB"
                          };
                          // Fresh sessionId
                          requestBody.clientContext.sessionId = `;${Date.now()}`;

                          // HAR order: recaptchaContext first on retry as well.
                          const {
                            recaptchaContext: _retryRecaptchaContext,
                            ...restRetryClientContext
                          } = requestBody.clientContext;
                          requestBody.clientContext = {
                            recaptchaContext: _retryRecaptchaContext,
                            ...restRetryClientContext,
                          };
                          
                          console.log('[API Client] ✅ Fresh token injected, retrying request...');
                          
                          // Wait 500ms before retry
                          await new Promise(resolve => setTimeout(resolve, 500));
                          
                          const retryBearer = freshOAuth ?? finalToken;

                          // Retry the request
                          const retryResponse = await fetch(endpoint, {
                              method: 'POST',
                              headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${retryBearer}`,
                                  'x-user-username': currentUser?.username || 'unknown',
                              },
                              body: JSON.stringify(requestBody),
                          });
                          
                          const retryTextResponse = await retryResponse.text();
                          let retryData;
                          try {
                              retryData = JSON.parse(retryTextResponse);
                          } catch {
                              retryData = { error: { message: `Proxy returned non-JSON (${retryResponse.status}): ${retryTextResponse.substring(0, 100)}` } };
                          }
                          
                          if (retryResponse.ok) {
                              console.log('[API Client] ✅ Retry successful with fresh token!');
                              return { data: retryData, successfulToken: finalToken, successfulServerUrl: currentServerUrl };
                          } else {
                              console.error('[API Client] ❌ Retry also failed:', retryResponse.status, retryData);
                              // Fall through to throw error
                          }
                      } else {
                          console.error('[API Client] ❌ Failed to generate fresh token for retry');
                      }
                  } catch (retryError) {
                      console.error('[API Client] ❌ Error during retry:', retryError);
                  }
              }
              
              // If retry failed or not applicable, throw the original error
              const recaptchaErrorMsg = `ERROR 403 - reCAPTCHA evaluation failed. ${needsRecaptcha ? 'Retry with fresh token also failed.' : 'Please check your Anti-Captcha API key.'}`;
              console.error(`[API Client] 🔐 reCAPTCHA validation failed (${status})`);
              throw new Error(recaptchaErrorMsg);
          }

          // Check for hard errors
          if (status === 400 || lowerMsg.includes('safety') || lowerMsg.includes('blocked')) {
              console.warn(`[API Client] 🛑 Non-retriable error (${status}). Prompt issue.`);
              throw new Error(`[${status}] ${errorMessage}`);
          }
          
          throw new Error(errorMessage);
      }

      if (!isStatusCheck) {
          console.log(`[API Client] ✅ Success using ${sourceLabel} token on ${currentServerUrl}`);
      }
      return { data, successfulToken: finalToken, successfulServerUrl: currentServerUrl };

  } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      const errMsg = error instanceof Error ? error.message : String(error);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (isAbort && isVeo) {
          const friendly = 'Request took too long. Try Wi-Fi or a smaller image.';
          throw new Error(friendly);
      }
      const isSafetyError = errMsg.includes('[400]') || errMsg.toLowerCase().includes('safety') || errMsg.toLowerCase().includes('blocked');

      if (!specificToken && !isSafetyError && !isStatusCheck) {
          addLogEntry({ 
              model: logContext, 
              prompt: `Failed using ${sourceLabel} token`, 
              output: errMsg, 
              tokenCount: 0, 
              status: 'Error', 
              error: errMsg 
          });
      }
      throw error;
  }
};

