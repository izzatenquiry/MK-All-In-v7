
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { type User, type AiLogItem, type Language } from '../../../types';
import { assignPersonalTokenAndIncrementUsage, hasActiveTokenUltra, hasActiveTokenUltraWithRegistration } from '../../../services/userService';
import {
    CreditCardIcon, CheckCircleIcon, XIcon, EyeIcon, EyeOffIcon, ChatIcon,
    AlertTriangleIcon, DatabaseIcon, TrashIcon, RefreshCwIcon, WhatsAppIcon, SparklesIcon, VideoIcon, ImageIcon, KeyIcon, ActivityIcon, DownloadIcon, PlayIcon, UserIcon, ServerIcon
} from '../../Icons';
import Spinner from '../../common/Spinner';
import Tabs, { type Tab } from '../../common/Tabs';
import { getTranslations } from '../../../services/translations';
import { getFormattedCacheStats, clearVideoCache } from '../../../services/videoCacheService';
import { runComprehensiveTokenTest, type TokenTestResult } from '../../../services/imagenV3Service';
import eventBus from '../../../services/eventBus';
import FlowLogin from './FlowLogin';
import RecaptchaSettingsPanel from './RecaptchaSettingsPanel';
import RegisterTokenUltra from './RegisterTokenUltra';
import FAQView from './FAQView';
import MasterDashboardView from '../admin/MasterDashboardView';
import ETutorialAdminView from '../admin/ETutorialAdminView';
import { BRAND_CONFIG } from '../../../services/brandConfig';

// Define the types for the settings view tabs
export type SettingsTabId = 'profile' | 'flowLogin' | 'recaptcha' | 'faq' | 'server-status' | 'content-admin';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface SettingsViewProps {
  currentUser: User;
  tempApiKey: string | null;
  onUserUpdate: (user: User) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  veoTokenRefreshedAt: string | null;
  assignTokenProcess: () => Promise<{ success: boolean; error: string | null; }>;
  onOpenChangeServerModal: () => void;
  initialTab?: SettingsTabId;
  onTabChange?: (tab: SettingsTabId) => void;
  /** When true (FAQ opened from sidebar), only FAQ content is shown — no Profile / Token Setting tabs. */
  hideSettingsTabBar?: boolean;
}

const ClaimTokenModal: React.FC<{
  status: 'searching' | 'success' | 'error';
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}> = ({ status, error, onRetry, onClose }) => {
    const T = getTranslations().claimTokenModal;
    return (
    <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-50 p-4 animate-zoomIn" aria-modal="true" role="dialog">
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl p-8 text-center max-w-sm w-full">
        {status === 'searching' && (
            <>
            <Spinner />
            <h2 className="text-lg sm:text-xl font-semibold mt-4">{T.searchingTitle}</h2>
            <p className="text-neutral-500 dark:text-neutral-400 mt-2 text-sm sm:text-base">
                {T.searchingMessage}
            </p>
            </>
        )}
        {status === 'success' && (
            <>
            <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-lg sm:text-xl font-semibold mt-4">{T.successTitle}</h2>
            <p className="text-neutral-500 dark:text-neutral-400 mt-2 text-sm sm:text-base">
                {T.successMessage}
            </p>
            </>
        )}
        {status === 'error' && (
            <>
            <AlertTriangleIcon className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-lg sm:text-xl font-semibold mt-4">{T.errorTitle}</h2>
            <p className="text-neutral-500 dark:text-neutral-400 mt-2 text-sm sm:text-base">
                {error || T.errorMessageDefault}
            </p>
            <div className="mt-6 flex gap-4">
                <button onClick={onClose} className="w-full bg-neutral-200 dark:bg-neutral-700 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors">
                {T.closeButton}
                </button>
                <button onClick={onRetry} className="w-full bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 transition-colors">
                {T.retryButton}
                </button>
            </div>
            </>
        )}
        </div>
    </div>
)};

// --- PANELS ---

interface ProfilePanelProps extends Pick<SettingsViewProps, 'currentUser' | 'onUserUpdate' | 'assignTokenProcess' | 'onOpenChangeServerModal'> {
    language: Language;
    setLanguage: (lang: Language) => void;
}

const ProfilePanel: React.FC<ProfilePanelProps> = ({ currentUser, onUserUpdate, language, setLanguage, assignTokenProcess, onOpenChangeServerModal }) => {
    const T = getTranslations().settingsView;
    const T_Profile = T.profile;

    const [email, setEmail] = useState(currentUser.email);
    
    // Video Tutorial Modal State
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    const [currentServer, setCurrentServer] = useState<string | null>(null);
    const fetchCurrentServer = useCallback(() => {
        setCurrentServer(sessionStorage.getItem('selectedProxyServer'));
    }, []);

    useEffect(() => {
        fetchCurrentServer();
        const handleServerChanged = () => fetchCurrentServer();
        eventBus.on('serverChanged', handleServerChanged);
        return () => {
            eventBus.remove('serverChanged', handleServerChanged);
        };
    }, [fetchCurrentServer]);

    // Auto-play video when modal opens
    useEffect(() => {
        if (isVideoModalOpen && videoRef.current) {
            videoRef.current.play().catch(err => {
                console.error('Error auto-playing video:', err);
            });
        }
    }, [isVideoModalOpen]);

    const getAccountStatus = (user: User): { text: string; colorClass: string } => {
        switch (user.status) {
            case 'admin': return { text: T_Profile.status.admin, colorClass: 'text-green-500' };
            case 'lifetime': return { text: T_Profile.status.lifetime, colorClass: 'text-green-500' };
            case 'subscription': return { text: T_Profile.status.subscription, colorClass: 'text-green-500' };
            case 'trial': return { text: T_Profile.status.trial, colorClass: 'text-yellow-500' };
            case 'inactive': return { text: T_Profile.status.inactive, colorClass: 'text-red-500' };
            case 'pending_payment': return { text: T_Profile.status.pending, colorClass: 'text-yellow-500' };
            default: return { text: T_Profile.status.unknown, colorClass: 'text-neutral-500' };
        }
    };


    const accountStatus = getAccountStatus(currentUser);
    // Hide expiry info for both brands (subscription_expiry not displayed)
    let expiryInfo = null;

    return (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-6 h-full overflow-y-auto border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                    <UserIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">{T_Profile.title}</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage your account information and settings</p>
                </div>
            </div>

            {/* Account Status Panel */}
            <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800 mb-6">
                <h3 className="text-base sm:text-lg font-bold mb-4 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-primary-500" />
                    Account Status
                </h3>
                <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-[0.5px] border-blue-200 dark:border-blue-800 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600 dark:text-neutral-400">{T_Profile.accountStatus}</span>
                        <span className={`text-sm font-bold ${accountStatus.colorClass}`}>{accountStatus.text}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-blue-200 dark:border-blue-800">
                        <span className="text-sm text-neutral-600 dark:text-neutral-400">{T_Profile.email}</span>
                        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{email}</span>
                    </div>
                    {/* Access code: show what is stored in `users.access_code`. */}
                    <div className="flex items-center justify-between pt-2 border-t border-blue-200 dark:border-blue-800">
                        <span className="text-sm text-neutral-600 dark:text-neutral-400">Access code</span>
                        <span className="text-sm font-mono text-neutral-800 dark:text-neutral-200">
                            {currentUser.accessCode ? String(currentUser.accessCode).trim() : 'NOT CONFIGURED'}
                        </span>
                    </div>
                    {expiryInfo && (
                        <div className="pt-2 border-t border-blue-200 dark:border-blue-800">
                            <p className="text-xs text-blue-800 dark:text-blue-200">{expiryInfo}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Generation Server — same UI as former Token Setting panel; lives on Profile for quick access */}
            <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800 mb-6">
                <h3 className="text-base sm:text-lg font-bold mb-4 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                    <ServerIcon className="w-5 h-5 text-primary-500" />
                    Generation Server
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                    Choose the backend server for processing your requests. Switching servers can help if one is slow or overloaded.
                </p>
                <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 flex items-center justify-between transition-all">
                    <div className="min-w-0 flex-1 mr-4">
                        <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-1">Status: Connected to</p>
                        <p className="font-mono text-sm text-brand-start dark:text-brand-end truncate">
                            {currentServer ? currentServer.replace('https://', '').toUpperCase() : 'NOT CONFIGURED'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenChangeServerModal}
                        className="flex items-center justify-center gap-2 shrink-0 rounded-lg bg-gradient-to-r from-brand-start to-brand-end text-white text-sm font-semibold py-2.5 px-4 border border-white/15 shadow-[0_8px_24px_rgba(74,108,247,0.25)] hover:opacity-95 active:scale-[0.99] transition-all dark:shadow-[0_8px_28px_rgba(74,108,247,0.35)]"
                    >
                        Change Server
                    </button>
                </div>
            </div>

            {/* Downloads: PC app + video tutorial (Telegram support lives in FAQ) */}
            <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800">
                <h3 className="text-base sm:text-lg font-bold mb-4 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                    <DownloadIcon className="w-5 h-5 text-brand-start dark:text-brand-end" />
                    Downloads
                </h3>
                <div className="space-y-3">
                    <a
                        href="https://drive.google.com/file/d/1aTNwIXpx7JekPui2UmsXkVL1MNKEWjdd/view?usp=sharing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 bg-neutral-700 dark:bg-neutral-600 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-700 transition-colors"
                    >
                        <DownloadIcon className="w-5 h-5" />
                        Download PC Version
                    </a>
                    <button
                        onClick={() => setIsVideoModalOpen(true)}
                        className="w-full flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                        <PlayIcon className="w-5 h-5" />
                        Video Tutorial PC Version
                    </button>
                </div>
            </div>

            {/* Video Tutorial Modal - Fullscreen */}
            {isVideoModalOpen && (
                <div 
                    className="fixed inset-0 bg-black z-[9999] flex items-center justify-center animate-zoomIn"
                    onClick={() => setIsVideoModalOpen(false)}
                >
                    {/* Close Button */}
                    <button
                        onClick={() => setIsVideoModalOpen(false)}
                        className="absolute top-6 right-6 z-10 p-3 bg-black/70 hover:bg-black/90 rounded-full text-white transition-colors shadow-lg"
                        aria-label="Close video"
                    >
                        <XIcon className="w-6 h-6" />
                    </button>

                    {/* Fullscreen Video Player */}
                    <div 
                        className="relative w-full h-full flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <video
                            ref={videoRef}
                            src="https://veoly-ai.com/wp-content/uploads/2026/01/Video-04-Desktop-PC-Mode.mp4"
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                            playsInline
                            onLoadedMetadata={() => {
                                if (videoRef.current) {
                                    videoRef.current.requestFullscreen?.().catch(err => {
                                        console.log('Fullscreen request failed:', err);
                                    });
                                }
                            }}
                        >
                            Your browser does not support the video tag.
                        </video>
                    </div>
                </div>
            )}
        </div>
    );
};

interface CacheManagerPanelProps {
    currentUser: User;
}

const CacheManagerPanel: React.FC<CacheManagerPanelProps> = ({ currentUser }) => {
    const T = getTranslations().settingsView.cache;
  const [stats, setStats] = useState<{
    size: string;
    count: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const formattedStats = await getFormattedCacheStats();
      setStats(formattedStats);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleClearCache = async () => {
    if (!confirm(T.confirmClear)) {
      return;
    }

    setIsClearing(true);
    try {
      await clearVideoCache();
      await loadStats();
      alert(T.clearSuccess);
    } catch (error) {
      console.error('Failed to clear cache:', error);
      alert(T.clearFail);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-6 h-full overflow-y-auto border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <DatabaseIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">{T.title}</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {T.subtitle}
            </p>
          </div>
        </div>

        {/* Usage Statistics / Credits */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 border-b border-neutral-200 dark:border-neutral-800 pb-6">
            <div className="p-3 sm:p-4 bg-neutral-50 dark:bg-neutral-800/30 border-[0.5px] border-neutral-200 dark:border-neutral-800 rounded-lg flex items-center justify-between transition-all hover:border-blue-200 dark:hover:border-blue-900/50">
                <div>
                    <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">Images Generated</p>
                    <p className="text-xl sm:text-2xl font-bold text-neutral-800 dark:text-neutral-200">{currentUser.totalImage || 0}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
            </div>
            <div className="p-3 sm:p-4 bg-neutral-50 dark:bg-neutral-800/30 border-[0.5px] border-neutral-200 dark:border-neutral-800 rounded-lg flex items-center justify-between transition-all hover:border-purple-200 dark:hover:border-purple-900/50">
                <div>
                    <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">Videos Generated</p>
                    <p className="text-xl sm:text-2xl font-bold text-neutral-800 dark:text-neutral-200">{currentUser.totalVideo || 0}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <VideoIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
            </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : stats ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="p-3 sm:p-4 bg-neutral-50 dark:bg-neutral-800/30 border-[0.5px] border-neutral-200 dark:border-neutral-800 rounded-lg flex items-center justify-between transition-all hover:border-green-200 dark:hover:border-green-900/50">
                <div>
                  <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">{T.storageUsed}</p>
                  <p className="text-xl sm:text-2xl font-bold text-neutral-800 dark:text-neutral-200">{stats.size}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                  <DatabaseIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
              <div className="p-3 sm:p-4 bg-neutral-50 dark:bg-neutral-800/30 border-[0.5px] border-neutral-200 dark:border-neutral-800 rounded-lg flex items-center justify-between transition-all hover:border-purple-200 dark:hover:border-purple-900/50">
                <div>
                  <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">{T.videosCached}</p>
                  <p className="text-xl sm:text-2xl font-bold text-neutral-800 dark:text-neutral-200">{stats.count}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  <VideoIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
            </div>
            
            <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 border-[0.5px] border-blue-200 dark:border-blue-800 rounded-lg">
              <h3 className="text-[11px] sm:text-xs font-semibold text-blue-900 dark:text-blue-100 mb-2">
                {T.howItWorks}
              </h3>
              <ul className="text-[11px] sm:text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <li>{T.l1}</li>
                <li>{T.l2}</li>
                <li>{T.l3}</li>
                <li>{T.l4}</li>
              </ul>
            </div>

            <div className="flex gap-3 w-full">
              <button onClick={loadStats} disabled={isLoading} className="flex-1 flex items-center justify-center gap-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50">
                <RefreshCwIcon className="w-4 h-4" /> {T.refresh}
              </button>
              <button
                onClick={handleClearCache}
                disabled={isClearing || stats.count === 0}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-red-300/90 dark:border-red-500/35 bg-red-50/90 dark:bg-red-950/35 text-red-800 dark:text-red-200 font-semibold py-2 px-4 hover:bg-red-100 dark:hover:bg-red-950/55 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClearing ? (<><Spinner /> {T.clearing}</>) : (<><TrashIcon className="w-4 h-4" /> {T.clear}</>)}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-neutral-500">{T.failLoad}</div>
        )}
      </div>
  );
};

const SettingsView: React.FC<SettingsViewProps> = ({
    currentUser,
    tempApiKey,
    onUserUpdate,
    language,
    setLanguage,
    veoTokenRefreshedAt,
    assignTokenProcess,
    onOpenChangeServerModal,
    initialTab = 'profile',
    onTabChange,
    hideSettingsTabBar = false,
}) => {
    // ============================================================================
    // STATE
    // ============================================================================
    const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const handleTabChange = useCallback(
        (action: React.SetStateAction<SettingsTabId>) => {
            setActiveTab(prev => {
                const next = typeof action === 'function' ? action(prev) : action;
                onTabChange?.(next);
                return next;
            });
        },
        [onTabChange]
    );
    const [isTokenUltraActive, setIsTokenUltraActive] = useState(false);
    const [tokenUltraStatus, setTokenUltraStatus] = useState<'active' | 'expired' | 'expiring_soon' | null>(null);
    
    // ============================================================================
    // CHECK TOKEN ULTRA STATUS
    // ============================================================================
    useEffect(() => {
        const checkTokenUltraStatus = async () => {
            if (!currentUser) return;
            
            // Check if we've already checked for this user in this session
            const checkKey = `token_ultra_checked_${currentUser.id}`;
            const alreadyChecked = sessionStorage.getItem(checkKey);
            
            // Only check once per session (after login)
            if (alreadyChecked) {
                // Use cached status from hasActiveTokenUltra
                const cached = sessionStorage.getItem(`token_ultra_active_${currentUser.id}`);
                const isActive = cached === 'true';
                setIsTokenUltraActive(isActive);
                
                // ✅ Get registration status from cache
                const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
                if (cachedReg) {
                    try {
                        const registration = JSON.parse(cachedReg);
                        setTokenUltraStatus(registration.status || null);
                    } catch (e) {
                        // Ignore parse error
                    }
                }
                return;
            }
            
            // Mark as checked
            sessionStorage.setItem(checkKey, 'true');
            
            // ✅ Use hasActiveTokenUltraWithRegistration to get both status and registration
            const result = await hasActiveTokenUltraWithRegistration(currentUser.id, false);
            
            setIsTokenUltraActive(result.isActive);
            setTokenUltraStatus(result.registration?.status || null);
            
            // Token Ultra UI is merged into Token Setting; no separate tab to switch away from.
        };
        
        checkTokenUltraStatus();
    }, [currentUser?.id]);
    
    // ============================================================================
    // ADMIN CHECK
    // ============================================================================
    // Only users with role === 'admin' can access admin tabs
    const isAdmin = currentUser?.role === 'admin';
    
    // ============================================================================
    // BUILD TABS ARRAY
    // ============================================================================
    const T = getTranslations().settingsView;
    const tabs: Tab<SettingsTabId>[] = [];
    
    // Basic tabs - always shown
    tabs.push(
        { id: 'profile', label: T.tabs.profile },
        { id: 'flowLogin', label: 'Token Setting' }
    );
    
    const shouldShowTokenUltraTab = !isTokenUltraActive || 
                                     tokenUltraStatus === 'expiring_soon' || 
                                     tokenUltraStatus === 'expired';

    // Admin tabs - only add if user is admin
    if (isAdmin) {
        tabs.push(
            { id: 'recaptcha', label: 'reCAPTCHA', adminOnly: true },
            { id: 'server-status', label: 'Server Status', adminOnly: true },
            { id: 'content-admin', label: 'Content Admin', adminOnly: true }
        );
    }

    // Final filter - remove admin tabs if user is not admin (safety check)
    const finalTabs = tabs.filter(tab => {
        const isAdminTab =
            tab.id === 'recaptcha' || tab.id === 'server-status' || tab.id === 'content-admin';
        return !(isAdminTab && !isAdmin);
    });

    // ============================================================================
    // PROTECT ADMIN TABS FROM NON-ADMIN ACCESS
    // ============================================================================
    useEffect(() => {
        if (
            !isAdmin &&
            (activeTab === 'recaptcha' || activeTab === 'server-status' || activeTab === 'content-admin')
        ) {
            handleTabChange('profile');
        }
    }, [isAdmin, activeTab, handleTabChange]);

    // ============================================================================
    // RENDER CONTENT
    // ============================================================================
    const renderContent = () => {
        // Block admin routes for non-admin users
        if (
            !isAdmin &&
            (activeTab === 'recaptcha' || activeTab === 'server-status' || activeTab === 'content-admin')
        ) {
            return (
                <div className="flex items-center justify-center h-full">
                    <div className="text-center p-6">
                        <AlertTriangleIcon className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-neutral-800 dark:text-neutral-200 mb-2">Access Denied</h3>
                        <p className="text-neutral-600 dark:text-neutral-400">This section is only available for administrators.</p>
                    </div>
                </div>
            );
        }

        switch (activeTab) {
            case 'profile':
                return (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        <ProfilePanel
                            currentUser={currentUser}
                            onUserUpdate={onUserUpdate}
                            language={language}
                            setLanguage={setLanguage}
                            assignTokenProcess={assignTokenProcess}
                            onOpenChangeServerModal={onOpenChangeServerModal}
                        />
                        <div className="h-full">
                            <CacheManagerPanel currentUser={currentUser} />
                        </div>
                    </div>
                );
            case 'flowLogin': {
                const showTokenUltraColumn =
                    BRAND_CONFIG.name === 'VEOLY-AI' || shouldShowTokenUltraTab;
                return (
                    <div className="w-full">
                        <div
                            className={
                                showTokenUltraColumn
                                    ? 'grid w-full grid-cols-1 items-stretch gap-8 xl:grid-cols-2'
                                    : 'w-full'
                            }
                        >
                            <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
                                <FlowLogin
                                    currentUser={currentUser}
                                    onUserUpdate={onUserUpdate}
                                    pairWithTokenUltraPanel={showTokenUltraColumn}
                                />
                            </div>
                            {showTokenUltraColumn && (
                                <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
                                    <RegisterTokenUltra
                                        currentUser={currentUser}
                                        onUserUpdate={onUserUpdate}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );
            }
            case 'recaptcha':
                return (
                    <div className="w-full">
                        <RecaptchaSettingsPanel currentUser={currentUser} onUserUpdate={onUserUpdate} />
                    </div>
                );
            case 'faq':
                return (
                    <div className="w-full">
                        <FAQView />
                    </div>
                );
            case 'server-status':
                return (
                    <div className="w-full h-full">
                        <MasterDashboardView 
                            currentUser={currentUser}
                            language={language}
                        />
                    </div>
                );
            case 'content-admin':
                return (
                    <div className="w-full h-full">
                        <ETutorialAdminView />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="h-full flex flex-col">
            {!hideSettingsTabBar && (
                <div className="mb-6 flex shrink-0 justify-center">
                    <Tabs
                        tabs={finalTabs}
                        activeTab={activeTab}
                        setActiveTab={handleTabChange}
                        isAdmin={isAdmin}
                    />
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
                {renderContent()}
            </div>
        </div>
    );
};

export default SettingsView;
