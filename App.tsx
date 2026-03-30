
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { type View, type User, type Language, type Announcement } from './types';
import Navigation from './components/Navigation'; // New Nav
import DashboardView from './components/views/DashboardView'; // New Home
import AiTextSuiteView from './components/views/ai-text/AiTextSuiteView';
import AiImageSuiteView from './components/views/ai-image/AiImageSuiteView';
import AiVideoSuiteView from './components/views/ai-video/AiVideoSuiteView';
import SettingsView, { type SettingsTabId } from './components/views/settings/SettingsView';
import PaymentReturnHandler from './components/views/settings/PaymentReturnHandler';
import LoginPage from './LoginPage';
import { GalleryView } from './components/views/GalleryView';
import WelcomeAnimation from './components/WelcomeAnimation';
import { RefreshCwIcon, TerminalIcon, SunIcon, MoonIcon, AlertTriangleIcon, CheckCircleIcon, XIcon, SparklesIcon, MenuIcon } from './components/Icons';
import { createPortal } from 'react-dom';
import { signOutUser, logActivity, getVeoAuthTokens, getSharedMasterApiKey, updateUserLastSeen, assignPersonalTokenAndIncrementUsage, saveUserPersonalAuthToken, updateUserProxyServer, getAvailableServersForUser, getDeviceOS, getServerUsageCounts, getUserProfile, getMasterRecaptchaToken, hasActiveTokenUltra, hasActiveTokenUltraWithRegistration } from './services/userService';
import Spinner from './components/common/Spinner';
import { loadData, saveData } from './services/indexedDBService';
import { GetStartedView } from './components/views/GetStartedView';
import AiPromptLibrarySuiteView from './components/views/ai-prompt-library/AiPromptLibrarySuiteView';
import eventBus from './services/eventBus';
import { supabase, type Database } from './services/supabaseClient';
import { runComprehensiveTokenTest } from './services/imagenV3Service';
import ConsoleLogSidebar from './components/ConsoleLogSidebar';
import { getTranslations } from './services/translations';
import { getAnnouncements } from './services/contentService';
import MasterDashboardView from './components/views/admin/MasterDashboardView';
import TokenManagementSuiteView from './components/views/token-management/TokenManagementSuiteView';
import UltraAiSalesSuiteView from './components/views/ultra-ai-sales/UltraAiSalesSuiteView';
import SuiteLayout from './components/common/SuiteLayout';
import ServerSelectionModal from './components/common/ServerSelectionModal';
import { isElectron, isLocalhost } from './services/environment';
import { APP_VERSION } from './services/appConfig';
import { getServerUrl } from './services/serverConfig';
import { BRAND_CONFIG, applyBrandTheme, isMaintenanceMode } from './services/brandConfig';
import MaintenancePage from './components/MaintenancePage';

// ... (Keep existing Interfaces VideoGenPreset, ImageEditPreset etc.)
interface VideoGenPreset {
  prompt: string;
  image: { base64: string; mimeType: string; };
}
interface ImageEditPreset {
  base64: string;
  mimeType: string;
}

// Theme Switcher Component
const ThemeSwitcher: React.FC<{ theme: string; setTheme: (theme: string) => void }> = ({ theme, setTheme }) => (
    <button
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        className="p-2 rounded-lg hover:bg-white/10 dark:hover:bg-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
        title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
    >
        {theme === 'light' ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />}
    </button>
);

const App: React.FC = () => {
  // ... (State initialization remains mostly the same)
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeApiKey, setActiveApiKey] = useState<string | null>(null);
  const [isApiKeyLoading, setIsApiKeyLoading] = useState(true);
  const [activeView, setActiveView] = useState<View>('home');
  const [theme, setTheme] = useState('dark'); // Default to dark theme
  const [language, setLanguage] = useState<Language>('en');
  const [videoGenPreset, setVideoGenPreset] = useState<VideoGenPreset | null>(null);
  const [imageToReEdit, setImageToReEdit] = useState<ImageEditPreset | null>(null);
  const [imageGenPresetPrompt, setImageGenPresetPrompt] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // For mobile drawer
  const [isLogSidebarOpen, setIsLogSidebarOpen] = useState(false);
  const [isShowingWelcome, setIsShowingWelcome] = useState(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [veoTokenRefreshedAt, setVeoTokenRefreshedAt] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const isAssigningTokenRef = useRef(false);
  const [needsSilentTokenAssignment, setNeedsSilentTokenAssignment] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [tokenUltraMessage, setTokenUltraMessage] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'operational' | 'checking' | 'offline'>('checking');
  const [lastHealthCheck, setLastHealthCheck] = useState<number | null>(null);
  
  const T = getTranslations().app;

  // ... (Keep existing useEffects for loading settings, user session, etc.)
  useEffect(() => {
    // Apply brand theme on mount
    applyBrandTheme(BRAND_CONFIG);
    
    const loadSettings = async () => {
        // Load saved theme or default to dark
        const savedTheme = await loadData<string>('theme');
        if (savedTheme) {
            setTheme(savedTheme);
        } else {
            setTheme('dark'); // Default to dark
        }
        const savedLang = await loadData<Language>('language');
        if (savedLang) setLanguage(savedLang);
    };
    loadSettings();
    getAnnouncements().then(setAnnouncements).catch(console.error);

    // Check for token ultra ready message after reload
    const message = sessionStorage.getItem('token_ultra_ready_message');
    if (message) {
      sessionStorage.removeItem('token_ultra_ready_message');
      setTokenUltraMessage(message);
    }

    // Check if this is a payment return page
    // Only trigger if path is /payment-return AND has payment parameters
    // ToyyibPay uses 'status_id' parameter, not 'status'
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('status_id') || urlParams.get('status');
    const billcode = urlParams.get('billcode');
    const isPaymentReturnPath = window.location.pathname === '/payment-return';
    
    // Only trigger if we're on payment-return path AND have payment parameters
    if (isPaymentReturnPath && (paymentStatus || billcode)) {
      // This is a payment return - set view and clean URL
      setActiveView('payment-return');
      // Clean URL but keep query params for PaymentReturnHandler
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  // Refresh announcements when admin updates them
  useEffect(() => {
    const refreshAnnouncements = () => {
      getAnnouncements().then(setAnnouncements).catch(console.error);
    };
    
    eventBus.on('announcementsUpdated', refreshAnnouncements);
    
    return () => {
      eventBus.remove('announcementsUpdated', refreshAnnouncements);
    };
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    saveData('theme', theme);
  }, [theme]);

  // ... (Keep User Update, Logout, Clear Cache Logic)
  const handleUserUpdate = useCallback((updatedUser: User) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
  }, []);

  // Live-update header (e.g. PACKAGE CREDITS) after RPC deducts credits (video success, etc.)
  useEffect(() => {
    const handleUserProfileUpdated = (u: User) => {
      setCurrentUser((prev) => {
        if (!u?.id || !prev || prev.id !== u.id) return prev;
        localStorage.setItem('currentUser', JSON.stringify(u));
        return u;
      });
    };
    eventBus.on('userProfileUpdated', handleUserProfileUpdated);
    return () => eventBus.remove('userProfileUpdated', handleUserProfileUpdated);
  }, []);

  const handleLogout = useCallback(async () => {
    // Conditional: Only update server in Web version
    if (!isElectron() && currentUser) {
      await updateUserProxyServer(currentUser.id, null);
    }
    await signOutUser();
    localStorage.removeItem('currentUser');
    sessionStorage.clear();
    setCurrentUser(null);
    setActiveApiKey(null);
    setActiveView('home');
  }, [currentUser]);

  // ... (Keep Token Assignment Logic - assignTokenProcess, etc.)
  const assignTokenProcess = useCallback(async (): Promise<{ success: boolean; error: string | null; }> => {
      if (!currentUser) {
          return { success: false, error: 'User session not found.' };
      }

      // Prevent parallel assignment attempts.
      if (isAssigningTokenRef.current) {
          return { success: false, error: 'Token assignment already in progress.' };
      }

      isAssigningTokenRef.current = true;
      setScanProgress({ current: 0, total: 0 });

      try {
          const tokensJson = sessionStorage.getItem('veoAuthTokens');
          const parsedTokens: Array<{ token: string; createdAt: string; totalUser?: number }> =
              tokensJson ? JSON.parse(tokensJson) : [];

          if (!Array.isArray(parsedTokens) || parsedTokens.length === 0) {
              return { success: false, error: 'No available token found in pool.' };
          }

          const tokenCandidates = parsedTokens
              .map(t => t.token)
              .filter((token): token is string => typeof token === 'string' && token.trim().length > 0);

          if (tokenCandidates.length === 0) {
              return { success: false, error: 'No valid token found in pool.' };
          }

          setScanProgress({ current: 0, total: tokenCandidates.length });

          // Clear current personal token first for clean reassignment.
          await saveUserPersonalAuthToken(currentUser.id, null);

          for (let i = 0; i < tokenCandidates.length; i++) {
              const token = tokenCandidates[i];
              setScanProgress({ current: i + 1, total: tokenCandidates.length });

              try {
                  const results = await runComprehensiveTokenTest(token);
                  const isUsable = Array.isArray(results) && results.some(r => r.success);

                  if (!isUsable) {
                      continue;
                  }

                  const assignResult = await assignPersonalTokenAndIncrementUsage(currentUser.id, token);
                  if (assignResult.success) {
                      handleUserUpdate(assignResult.user);
                      return { success: true, error: null };
                  }
              } catch (tokenError) {
                  // Continue scanning next candidate.
                  console.warn('[assignTokenProcess] Candidate token failed test/assign', tokenError);
              }
          }

          return { success: false, error: 'No working token available at the moment.' };
      } catch (error) {
          return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to auto-assign token.',
          };
      } finally {
          isAssigningTokenRef.current = false;
      }
  }, [currentUser]);

  // Check Session
  useEffect(() => {
        const savedUserJson = localStorage.getItem('currentUser');
        if (savedUserJson) setCurrentUser(JSON.parse(savedUserJson));
        setSessionChecked(true);
        setIsApiKeyLoading(false);
  }, []);

  // AUTO-SYNC: Fetch fresh profile from DB on load to ensure personalAuthToken is up to date
  useEffect(() => {
      if (currentUser?.id) {
          getUserProfile(currentUser.id).then(freshUser => {
              if (freshUser) {
                  // If the DB has a token but local doesn't, or they differ, update local.
                  if (freshUser.personalAuthToken !== currentUser.personalAuthToken) {
                      console.log('[Auto-Sync] Syncing user data from DB to local session.');
                      handleUserUpdate(freshUser);
                  }
                  // Also update status or other fields if they changed
                  if (freshUser.status !== currentUser.status) {
                      handleUserUpdate(freshUser);
                  }
              }
          }).catch(err => console.error("Background profile sync failed", err));
      }
  }, [currentUser?.id, handleUserUpdate]);

  // Update last seen timestamp when user logs in or app loads
  useEffect(() => {
    if (currentUser?.id) {
      // Update last seen timestamp (fire-and-forget)
      updateUserLastSeen(currentUser.id);
    }
  }, [currentUser?.id]);

  // Initialize System Resources (API Key, Proxy Server, Veo Tokens)
  useEffect(() => {
    const initSystem = async () => {
        if (!currentUser) return;

        // 1. Shared API Key — same for all builds
        if (!activeApiKey) {
            const key = await getSharedMasterApiKey();
            if (key) {
                setActiveApiKey(key);
                sessionStorage.setItem(BRAND_CONFIG.sessionKey, key);
            }
        }

        // 2. Proxy Server - CONDITIONAL behavior
        let serverWasAssigned = false;
        if (isElectron()) {
            // Electron: always localhost
            const localhostUrl = 'http://localhost:3001';
            sessionStorage.setItem('selectedProxyServer', localhostUrl);
            serverWasAssigned = true;
        } else {
            // Web: selection logic
            const currentServer = sessionStorage.getItem('selectedProxyServer');
            if (!currentServer) {
                const servers = await getAvailableServersForUser(currentUser);
                if (servers.length > 0) {
                    let selected: string;
                    if (isLocalhost()) {
                        // If running on localhost, prefer localhost server
                        const localhostUrl = 'http://localhost:3001'; // Backend uses HTTP
                        const localhostServer = servers.find(s => s === localhostUrl);
                        selected = localhostServer || servers[0];
                    } else {
                        // For webbase users, randomly select from available servers
                        const randomIndex = Math.floor(Math.random() * servers.length);
                        selected = servers[randomIndex];
                    }
                    sessionStorage.setItem('selectedProxyServer', selected);
                    serverWasAssigned = true;
                }
            }
        }
        
        // Trigger health check after server is assigned
        // Note: checkServerHealth will be called via the health check useEffect after server is set
        if (serverWasAssigned) {
            // Trigger server changed event to notify health check useEffect
            // Small delay to ensure sessionStorage is updated
            setTimeout(() => {
                eventBus.dispatch('serverChanged');
            }, 100);
        }

        // 3. Veo Tokens (Background) - DISABLED: Token pool no longer used, users generate tokens themselves
        // getVeoAuthTokens().then(tokens => {
        //     if (tokens) {
        //         sessionStorage.setItem('veoAuthTokens', JSON.stringify(tokens));
        //         setVeoTokenRefreshedAt(new Date().toISOString());
        //     }
        // });

        // 4. Token Ultra Registration Status & Master Recaptcha Token (Load once if active)
        // Use a flag to prevent duplicate calls even if useEffect runs multiple times
        const initFlagKey = `token_ultra_init_${currentUser.id}`;
        const hasInitialized = sessionStorage.getItem(initFlagKey);
        
        if (!hasInitialized) {
            // Mark as initialized immediately to prevent duplicate calls
            sessionStorage.setItem(initFlagKey, 'true');
            
            // Check if already loaded to prevent duplicate calls
            const cachedMasterToken = sessionStorage.getItem('master_recaptcha_token');
            const cachedTimestamp = sessionStorage.getItem('master_recaptcha_token_timestamp');
            const cacheAge = cachedTimestamp ? Date.now() - parseInt(cachedTimestamp, 10) : Infinity;
            const isCacheValid = cachedMasterToken && cachedMasterToken.trim() && cacheAge < 5 * 60 * 1000; // 5 minutes
            
            // Also check cached token ultra status
            const cachedUltraStatus = sessionStorage.getItem(`token_ultra_active_${currentUser.id}`);
            const cachedUltraTimestamp = sessionStorage.getItem(`token_ultra_active_timestamp_${currentUser.id}`);
            const ultraCacheAge = cachedUltraTimestamp ? Date.now() - parseInt(cachedUltraTimestamp, 10) : Infinity;
            const isUltraCacheValid = cachedUltraStatus && ultraCacheAge < 5 * 60 * 1000; // 5 minutes
            
            if (!isCacheValid || !isUltraCacheValid) {
                hasActiveTokenUltraWithRegistration(currentUser.id).then(result => {
                    if (result.isActive && result.registration) {
                        // User has active Token Ultra - cache registration data and load master token if needed
                        // Cache registration data with allow_master_token
                        sessionStorage.setItem(`token_ultra_registration_${currentUser.id}`, JSON.stringify(result.registration));
                        console.log('[App] User has active Token Ultra registration - cached registration data', {
                            allow_master_token: result.registration.allow_master_token
                        });
                        
                        // Load master token if user can use it (allow_master_token != false)
                        if (result.registration.allow_master_token !== false && !isCacheValid) {
                            console.log('[App] User can use master token - loading master recaptcha token');
                            // Load master token once and cache in sessionStorage
                            getMasterRecaptchaToken().then(masterResult => {
                                if (masterResult.success && masterResult.apiKey) {
                                    console.log('[App] ✅ Master recaptcha token loaded and cached for session');
                                } else {
                                    console.warn('[App] ⚠️ Master recaptcha token not found');
                                }
                            });
                        } else if (result.registration.allow_master_token === false) {
                            console.log('[App] User blocked from using master token - will use personal token');
                        }
                    } else {
                        // Normal User (no active Token Ultra) - use their own recaptcha token
                        // Clear any cached registration data
                        sessionStorage.removeItem(`token_ultra_registration_${currentUser.id}`);
                        console.log('[App] Normal User - will use their own recaptcha token');
                    }
                });
            } else {
                // Both are cached, skip
                if (cachedUltraStatus === 'true') {
                    console.log('[App] Master recaptcha token and Token Ultra status already cached, skipping reload');
                } else {
                    console.log('[App] Normal User status already cached, skipping reload');
                }
            }
        }
    };

    if (currentUser) {
        initSystem();
    }
  }, [currentUser, activeApiKey]);

  // Check server health status
  const checkServerHealth = useCallback(async () => {
    try {
      const currentServerUrl = getServerUrl();
      
      if (!currentServerUrl) {
        console.warn('[Health Check] No server URL available');
        setServerStatus('offline');
        return;
      }

      // Try /health endpoint first (works for both localhost and production if available)
      try {
        const healthResponse = await fetch(`${currentServerUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000), // 5 second timeout
          mode: 'cors',
          cache: 'no-cache',
          credentials: 'omit',
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (healthResponse.ok) {
          try {
            const data = await healthResponse.json();
            if (data.status === 'ok' || data.status === 'healthy') {
              setServerStatus('operational');
              setLastHealthCheck(Date.now());
              return; // Success, exit early
            }
          } catch (parseError) {
            // Response OK but invalid JSON - still consider server operational
            setServerStatus('operational');
            setLastHealthCheck(Date.now());
            return;
          }
        }
      } catch (healthError: any) {
        // Health endpoint not available or failed, try alternative
        // Don't mark as offline yet, try fallback endpoint
        if (healthError.name !== 'AbortError') {
          // Only log non-timeout errors
          console.log('[Health Check] /health endpoint not available, trying fallback...');
        }
      }
      
      // Fallback 1: Try /api/veo/status endpoint (expect 401 without auth = server is up)
      try {
        const response = await fetch(`${currentServerUrl}/api/veo/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(5000), // 5 second timeout
          mode: 'cors',
          cache: 'no-cache',
          credentials: 'omit'
        });
        
        // Any response (even 401/400/500) means server is reachable and operational
        // 401 = no auth token (but server is up)
        // 400 = bad request (but server is up)
        // 500 = server error (but server is up)
        // 200 = OK
        if (response.status >= 200 && response.status < 600) {
          // Any HTTP status code means server responded
          setServerStatus('operational');
          setLastHealthCheck(Date.now());
          return;
        }
      } catch (veoError: any) {
        // Try another fallback endpoint
        if (veoError.name !== 'AbortError') {
          console.log('[Health Check] /api/veo/status not available, trying final fallback...');
        }
      }

      // Fallback 2: Try a simple GET request to root or /api endpoint
      try {
        const rootResponse = await fetch(`${currentServerUrl}/api`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
          mode: 'cors',
          cache: 'no-cache',
          credentials: 'omit'
        });
        
        // Any response means server is operational
        if (rootResponse.status >= 200 && rootResponse.status < 600) {
          setServerStatus('operational');
          setLastHealthCheck(Date.now());
          return;
        }
      } catch (apiError: any) {
        // Final fallback failed - check error type
        if (apiError.name === 'AbortError') {
          // Timeout - server might be slow or unreachable
          console.warn('[Health Check] Server health check timeout:', currentServerUrl);
          setServerStatus('offline');
        } else if (apiError.name === 'TypeError' && (apiError.message.includes('fetch') || apiError.message.includes('Failed to fetch'))) {
          // Network error - server not reachable
          console.warn('[Health Check] Server not reachable:', currentServerUrl, apiError.message);
          setServerStatus('offline');
        } else if (apiError.message?.includes('CORS')) {
          // CORS error - server might be up but blocking CORS
          // Still mark as operational if we got to this point (means DNS resolution worked)
          console.warn('[Health Check] CORS error, but server might be operational:', currentServerUrl);
          setServerStatus('operational');
          setLastHealthCheck(Date.now());
        } else {
          // Other errors - mark as offline
          console.warn('[Health Check] Server health check error:', currentServerUrl, apiError);
          setServerStatus('offline');
        }
      }
    } catch (error: any) {
      // Unexpected error in health check logic
      console.error('[Health Check] Unexpected error:', error);
      setServerStatus('offline');
    }
  }, []);

  // Auto-check server health ONLY AFTER LOGIN
  useEffect(() => {
    // Only check health if user is logged in AND has a server selected
    if (!currentUser) {
      // Not logged in yet - skip health check
      setServerStatus('checking');
      return;
    }
    
    // Check if server is selected (for web users)
    if (!isElectron()) {
      const selectedServer = sessionStorage.getItem('selectedProxyServer');
      if (!selectedServer) {
        // Server not selected yet - wait for initSystem to assign one
        setServerStatus('checking');
        return;
      }
    }
    
    // User is logged in and has server - now check health
    checkServerHealth();
  }, [currentUser, checkServerHealth]);

  // Listen for server changes and re-check (only if logged in)
  useEffect(() => {
    if (!currentUser) return; // Skip if not logged in
    
    const handleServerChange = () => {
        setServerStatus('checking');
        checkServerHealth();
    };
    
    eventBus.on('serverChanged', handleServerChange);
    return () => {
        eventBus.remove('serverChanged', handleServerChange);
    };
  }, [checkServerHealth, currentUser]);

  // --- VIEW RENDERING WITH NEW LAYOUT ---
  const renderView = () => {
    if (!currentUser) return null;

    switch (activeView) {
      case 'home':
        return (
            <SuiteLayout title="Dashboard" subtitle="Overview and quick actions">
                <DashboardView currentUser={currentUser} language={language} navigateTo={setActiveView} announcements={announcements} />
            </SuiteLayout>
        );
      
      case 'ai-text-suite':
        return (
            <SuiteLayout title="AI Content Suite">
                <AiTextSuiteView currentUser={currentUser} language={language} />
            </SuiteLayout>
        );

      case 'ai-image-suite':
        return (
            <SuiteLayout title="AI Image Suite">
                <AiImageSuiteView 
                  onCreateVideo={(p) => { setVideoGenPreset(p); setActiveView('ai-video-suite'); }} 
                  onReEdit={(p) => { setImageToReEdit(p); setActiveView('ai-image-suite'); }}
                  imageToReEdit={imageToReEdit}
                  clearReEdit={() => setImageToReEdit(null)}
                  presetPrompt={imageGenPresetPrompt}
                  clearPresetPrompt={() => setImageGenPresetPrompt(null)}
                  currentUser={currentUser}
                  onUserUpdate={handleUserUpdate}
                  language={language}
                />
            </SuiteLayout>
        );

      case 'ai-video-suite':
        return (
            <SuiteLayout title="AI Video & Voice">
                <AiVideoSuiteView 
                  currentUser={currentUser}
                  preset={videoGenPreset} 
                  clearPreset={() => setVideoGenPreset(null)}
                  onCreateVideo={(p) => { setVideoGenPreset(p); setActiveView('ai-video-suite'); }}
                  onReEdit={(p) => { setImageToReEdit(p); setActiveView('ai-image-suite'); }}
                  onUserUpdate={handleUserUpdate}
                  language={language}
                />
            </SuiteLayout>
        );

      case 'ai-prompt-library-suite':
        return (
            <SuiteLayout title="Prompt Library">
                <AiPromptLibrarySuiteView 
                    onUsePrompt={(p) => { 
                        setImageGenPresetPrompt(p); 
                        setActiveView('ai-image-suite'); 
                    }} 
                    language={language} 
                />
            </SuiteLayout>
        );
        
      case 'gallery':
         return (
            <SuiteLayout title="Your Gallery">
                <GalleryView 
                    onCreateVideo={(p) => { setVideoGenPreset(p); setActiveView('ai-video-suite'); }} 
                    onReEdit={(p) => { setImageToReEdit(p); setActiveView('ai-image-suite'); }} 
                    language={language} 
                />
            </SuiteLayout>
         );

      case 'get-started':
         return <SuiteLayout title="Get Started"><GetStartedView language={language} /></SuiteLayout>;
      
      case 'settings':
      case 'settings-faq': {
        const settingsInitialTab: SettingsTabId = activeView === 'settings-faq' ? 'faq' : 'profile';
        return (
          <SuiteLayout
            title={activeView === 'settings-faq' ? 'Support and FAQ' : 'Settings'}
            subtitle={activeView === 'settings-faq' ? 'Help and common questions' : 'Token & app controls'}
          >
            <SettingsView
              currentUser={currentUser}
              tempApiKey={null}
              onUserUpdate={handleUserUpdate}
              language={language}
              setLanguage={setLanguage}
              veoTokenRefreshedAt={veoTokenRefreshedAt}
              assignTokenProcess={assignTokenProcess}
              onOpenChangeServerModal={() => setShowServerModal(true)}
              initialTab={settingsInitialTab}
              hideSettingsTabBar={activeView === 'settings-faq'}
              onTabChange={tab => {
                if (activeView === 'settings-faq' && tab !== 'faq') {
                  setActiveView('settings');
                }
              }}
            />
          </SuiteLayout>
        );
      }

      case 'token-management-suite':
          return (
              <SuiteLayout title="Token Management" subtitle="Manage tokens, cookies, and account access">
                  <TokenManagementSuiteView currentUser={currentUser} language={language} />
              </SuiteLayout>
          );

      case 'ultra-ai-sales':
          return (
              <SuiteLayout title="Google ULTRA AI Sales Management">
                  <UltraAiSalesSuiteView currentUser={currentUser} language={language} />
              </SuiteLayout>
          );

      case 'payment-return':
          return (
              <SuiteLayout title="Payment Status" subtitle="Finalize order and update account credits">
                  <PaymentReturnHandler 
                    currentUser={currentUser}
                    onUserUpdate={handleUserUpdate}
                    onNavigateToSettings={() => setActiveView('settings')}
                  />
              </SuiteLayout>
          );

      default:
        return (
            <SuiteLayout title="Dashboard" subtitle="Overview and quick actions">
                <DashboardView currentUser={currentUser} language={language} navigateTo={setActiveView} />
            </SuiteLayout>
        );
    }
  };

  const activeViewMeta: { title: string; subtitle: string } = (() => {
    switch (activeView) {
      case 'home':
        return { title: 'Dashboard', subtitle: 'Overview and quick actions' };
      case 'ai-text-suite':
        return { title: 'AI Content Suite', subtitle: 'Generate text and copywriting assets' };
      case 'ai-image-suite':
        return { title: 'AI Image Suite', subtitle: 'Create and edit images with AI tools' };
      case 'ai-video-suite':
        return { title: 'AI Video & Voice', subtitle: 'Generate videos from prompt and media' };
      case 'ai-prompt-library-suite':
        return { title: 'Prompt Library', subtitle: 'Reusable prompts for faster workflow' };
      case 'gallery':
        return { title: 'Your Gallery', subtitle: 'Your generated assets and outputs' };
      case 'get-started':
        return { title: 'Get Started', subtitle: 'Setup and onboarding guidance' };
      case 'settings':
        return { title: 'Settings', subtitle: 'Token & app controls' };
      case 'settings-faq':
        return { title: 'Support and FAQ', subtitle: 'Help and common questions' };
      case 'token-management-suite':
        return { title: 'Token Management', subtitle: 'Manage tokens, cookies, and account access' };
      case 'ultra-ai-sales':
        return { title: 'Google ULTRA AI Sales Management', subtitle: 'Manage ULTRA AI sales operations' };
      case 'payment-return':
        return { title: 'Payment Status', subtitle: 'Finalize order and update account credits' };
      default:
        return { title: BRAND_CONFIG.shortName, subtitle: 'AI workspace' };
    }
  })();

  if (isMaintenanceMode()) return <MaintenancePage />;

  if (!sessionChecked || isApiKeyLoading) return <div className="flex items-center justify-center min-h-screen bg-[#050505]"><Spinner /></div>;

  /** ToyyibPay return URL must run even when the user is not logged in yet (signup → pay → apply credits). */
  const paymentReturnParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isPaymentReturnFlow =
    typeof window !== 'undefined' &&
    window.location.pathname === '/payment-return' &&
    !!(
      paymentReturnParams?.get('status_id') ||
      paymentReturnParams?.get('status') ||
      paymentReturnParams?.get('billcode')
    );

  if (isPaymentReturnFlow) {
    return (
      <PaymentReturnHandler
        currentUser={currentUser}
        onUserUpdate={(u) => {
          localStorage.setItem('currentUser', JSON.stringify(u));
          setCurrentUser(u);
          setJustLoggedIn(true);
        }}
        onNavigateToSettings={() => setActiveView('settings')}
      />
    );
  }
  
  if (!currentUser) return <LoginPage onLoginSuccess={(u) => { 
      // CRITICAL FIX: Save to localStorage immediately upon login to ensure API client can read it.
      localStorage.setItem('currentUser', JSON.stringify(u));
      setCurrentUser(u); 
      setJustLoggedIn(true); 
  }} />;
  
  if (isShowingWelcome) return <WelcomeAnimation onAnimationEnd={() => { setIsShowingWelcome(false); setActiveView('home'); }} />;

  return (
    // Main App Container - Using dvh for better mobile viewport handling
    <div className="relative flex h-screen sm:h-[100dvh] font-sans selection:bg-brand-start selection:text-white overflow-hidden bg-[radial-gradient(circle_at_8%_12%,rgba(74,108,247,0.20),transparent_36%),radial-gradient(circle_at_92%_24%,rgba(160,91,255,0.20),transparent_34%),linear-gradient(120deg,#f8fbff_0%,#f4f7ff_45%,#eef3ff_100%)] dark:bg-[radial-gradient(circle_at_12%_10%,rgba(74,108,247,0.22),transparent_35%),radial-gradient(circle_at_92%_18%,rgba(160,91,255,0.20),transparent_34%),linear-gradient(125deg,#02030a_0%,#060814_45%,#090b17_100%)]">
        
        {/* Unified Navigation (Floating Rail/Bottom) */}
        <Navigation 
            activeView={activeView} 
            setActiveView={setActiveView} 
            currentUser={currentUser} 
            onLogout={handleLogout}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            appVersion={APP_VERSION}
        />

        <main className="flex-1 flex flex-col min-w-0 md:pl-[292px] transition-all duration-300 relative z-10 h-full">
            {/* Header (Full Width "Full Petak") */}
            <header className="sticky top-0 z-30 w-full shrink-0">
                <div className="w-full px-3 pt-3 md:px-5 md:pt-4">
                    <div className="w-full rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/75 dark:bg-white/[0.04] backdrop-blur-2xl shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.45)] px-4 py-3 md:px-6 flex items-center justify-between">
                    {/* Mobile Logo Left (Rail handles desktop logo) */}
                    <div className="md:hidden font-black text-xl tracking-tighter flex items-center gap-2 text-neutral-900 dark:text-white">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-start to-brand-end flex items-center justify-center text-white font-bold text-lg">
                            {BRAND_CONFIG.logo.letter}
                        </div>
                        <span>{BRAND_CONFIG.shortName}</span>
                    </div>
                    
                    {/* Desktop Title */}
                    <div className="hidden md:block min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                            {activeViewMeta.title}
                        </p>
                        <p className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate">
                            {activeViewMeta.subtitle}
                        </p>
                    </div>
                    
                    {/* Right Actions */}
                    <div className="flex items-center gap-3 ml-auto">
                        
                        {/* Operational Status */}
                        <div className={`hidden md:flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 rounded-full border transition-colors ${
                            serverStatus === 'operational' 
                                ? 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20 border-green-300/80 dark:border-green-500/20'
                                : serverStatus === 'checking'
                                ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20 border-yellow-300/80 dark:border-yellow-500/20'
                                : 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20 border-red-300/80 dark:border-red-500/20'
                        }`}>
                            <span className="relative flex h-2 w-2">
                                {serverStatus === 'operational' && (
                                    <>
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 dark:bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </>
                                )}
                                {serverStatus === 'checking' && (
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500 animate-pulse"></span>
                                )}
                                {serverStatus === 'offline' && (
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                )}
                            </span>
                            {serverStatus === 'operational' && 'OPERATIONAL'}
                            {serverStatus === 'checking' && 'CHECKING...'}
                            {serverStatus === 'offline' && 'OFFLINE'}
                        </div>

                        {/* Package Credits */}
                        {currentUser && (
                            <div className="hidden md:flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 rounded-full border-[0.5px] text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/20 border-blue-300/80 dark:border-blue-500/20">
                                <span>PACKAGE CREDITS:</span>
                                <span className="font-mono">
                                    {currentUser.creditBalance != null
                                        ? currentUser.creditBalance.toLocaleString()
                                        : '0'}
                                </span>
                            </div>
                        )}

                        <div className="h-4 w-px bg-neutral-300/90 dark:bg-white/10 hidden md:block"></div>

                        {/* Theme Switcher */}
                        <ThemeSwitcher theme={theme} setTheme={setTheme} />

                        {/* Reload Button - Desktop only */}
                        <button
                            onClick={() => window.location.reload()}
                            className="hidden md:flex p-2 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            title="Refresh App"
                        >
                            <RefreshCwIcon className="w-5 h-5" />
                        </button>

                        {/* Console Log - Moved position */}
                        <button
                            onClick={() => setIsLogSidebarOpen(!isLogSidebarOpen)}
                            className="p-2 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        >
                            <TerminalIcon className="w-5 h-5" />
                        </button>

                        {/* Menu Icon - Mobile Only */}
                        <button
                            onClick={() => setIsMenuOpen(true)}
                            className="md:hidden p-2 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        >
                            <MenuIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                </div>
            </header>

            {/* Main Content Area - Responsive scrolling behavior */}
            {/* UPDATED: Removed fixed overflow to allow natural page scrolling on desktop */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-5 lg:p-6 custom-scrollbar">
                {/* View Content */}
                <div className="animate-zoomIn w-full min-h-full pb-48 md:pb-2">
                    {renderView()}
                </div>
            </div>
        </main>

        <ConsoleLogSidebar isOpen={isLogSidebarOpen} onClose={() => setIsLogSidebarOpen(false)} />
        
        {currentUser && (
            <ServerSelectionModal 
                isOpen={showServerModal} 
                onClose={() => setShowServerModal(false)} 
                currentUser={currentUser}
                onServerChanged={() => {
                    // Force refresh or update state if needed
                    console.log('Server changed, updating session...');
                    eventBus.dispatch('serverChanged');
                }}
            />
        )}

        {/* Token Ultra Ready Message Modal */}
        {tokenUltraMessage && createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-zoomIn" aria-modal="true" role="dialog">
                <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border-[0.5px] border-neutral-200/80 dark:border-neutral-800/80" onClick={e => e.stopPropagation()}>
                    <div className="flex items-start gap-4 mb-6">
                        <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                            <CheckCircleIcon className="w-6 h-6 text-green-600 dark:text-green-400" aria-hidden="true" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">Akaun TOKEN ULTRA AI Siap</h3>
                            <p className="text-sm text-neutral-600 dark:text-neutral-300">{tokenUltraMessage}</p>
                        </div>
                        <button
                            onClick={() => setTokenUltraMessage(null)}
                            className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex-shrink-0"
                            aria-label="Close"
                        >
                            <XIcon className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={() => setTokenUltraMessage(null)}
                            className="px-4 py-2 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                        >
                            OK
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}
    </div>
  );
};

export default App;
