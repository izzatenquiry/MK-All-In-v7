
import React, { useState, useEffect, useRef } from 'react';
import { type User, type AiLogItem, type Language } from '../../../types';
import { assignPersonalTokenAndIncrementUsage, hasActiveTokenUltra, hasActiveTokenUltraWithRegistration } from '../../../services/userService';
import {
    CreditCardIcon, CheckCircleIcon, XIcon, EyeIcon, EyeOffIcon, ChatIcon,
    AlertTriangleIcon, DatabaseIcon, TrashIcon, RefreshCwIcon, WhatsAppIcon, InformationCircleIcon, SparklesIcon, VideoIcon, ImageIcon, KeyIcon, ActivityIcon, TelegramIcon, DownloadIcon, PlayIcon, UserIcon
} from '../../Icons';
import Spinner from '../../common/Spinner';
import Tabs, { type Tab } from '../../common/Tabs';
import { getTranslations } from '../../../services/translations';
import { getFormattedCacheStats, clearVideoCache } from '../../../services/videoCacheService';
import { runComprehensiveTokenTest, type TokenTestResult } from '../../../services/imagenV3Service';
import eventBus from '../../../services/eventBus';
import FlowLogin from './FlowLogin';
import RegisterTokenUltra from './RegisterTokenUltra';
import FAQView from './FAQView';
import MasterDashboardView from '../admin/MasterDashboardView';
import ETutorialAdminView from '../admin/ETutorialAdminView';
import { BRAND_CONFIG } from '../../../services/brandConfig';

// Define the types for the settings view tabs
type SettingsTabId = 'profile' | 'flowLogin' | 'registerTokenUltra' | 'faq' | 'server-status' | 'content-admin';

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

interface ProfilePanelProps extends Pick<SettingsViewProps, 'currentUser' | 'onUserUpdate' | 'assignTokenProcess'> {
    language: Language;
    setLanguage: (lang: Language) => void;
}

const ProfilePanel: React.FC<ProfilePanelProps> = ({ currentUser, onUserUpdate, language, setLanguage, assignTokenProcess }) => {
    const T = getTranslations().settingsView;
    const T_Profile = T.profile;

    const [email, setEmail] = useState(currentUser.email);
    
    // Video Tutorial Modal State
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

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
                    {expiryInfo && (
                        <div className="pt-2 border-t border-blue-200 dark:border-blue-800">
                            <p className="text-xs text-blue-800 dark:text-blue-200">{expiryInfo}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Support & Downloads Section */}
            <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800">
                <h3 className="text-base sm:text-lg font-bold mb-4 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                    <InformationCircleIcon className="w-5 h-5 text-primary-500" />
                    Support & Downloads
                </h3>
                <div className="space-y-3">
                    <a
                        href="https://t.me/+rrbqeAkFJqFlY2E1"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 bg-blue-500 dark:bg-blue-600 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
                    >
                        <TelegramIcon className="w-5 h-5" />
                        Join Telegram Support Group
                    </a>
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
                            src="https://monoklix.com/wp-content/uploads/2026/01/Video-04-Desktop-PC-Mode.mp4"
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
              <button onClick={handleClearCache} disabled={isClearing || stats.count === 0} className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
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

const SettingsView: React.FC<SettingsViewProps> = ({ currentUser, tempApiKey, onUserUpdate, language, setLanguage, veoTokenRefreshedAt, assignTokenProcess, onOpenChangeServerModal }) => {
    // ============================================================================
    // STATE
    // ============================================================================
    const [activeTab, setActiveTab] = useState<SettingsTabId>('profile');
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
            
            // If user is on registerTokenUltra tab and Token Ultra becomes active, switch to profile tab
            // But only if status is 'active' (not expiring_soon or expired)
            if (result.isActive && result.registration?.status === 'active') {
                setActiveTab(prevTab => {
                    if (prevTab === 'registerTokenUltra') {
                        return 'profile';
                    }
                    return prevTab;
                });
            }
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
        { id: 'flowLogin', label: 'Token Setting' },
        { id: 'faq', label: 'FAQ' }
    );
    
    const shouldShowTokenUltraTab = !isTokenUltraActive || 
                                     tokenUltraStatus === 'expiring_soon' || 
                                     tokenUltraStatus === 'expired';
    // Token Ultra tab:
    // - ESAIE: hidden
    // - MONOKLIX: always visible for all users (regardless of Token Ultra status)
    // - Other brands (if any): follow shouldShowTokenUltraTab logic
    if (BRAND_CONFIG.name === 'MONOKLIX' || 
        (BRAND_CONFIG.name !== 'ESAIE' && shouldShowTokenUltraTab)) {
        tabs.push({ id: 'registerTokenUltra', label: 'Token Ultra' });
    }
    
    // Admin tabs - only add if user is admin
    if (isAdmin) {
        tabs.push(
            { id: 'server-status', label: 'Server Status', adminOnly: true },
            { id: 'content-admin', label: 'Content Admin', adminOnly: true }
        );
    }

    // Final filter - remove admin tabs if user is not admin (safety check)
    const finalTabs = tabs.filter(tab => {
        const isAdminTab = tab.id === 'server-status' || tab.id === 'content-admin';
        return !(isAdminTab && !isAdmin);
    });

    // ============================================================================
    // PROTECT ADMIN TABS FROM NON-ADMIN ACCESS
    // ============================================================================
    useEffect(() => {
        if (!isAdmin && (activeTab === 'server-status' || activeTab === 'content-admin')) {
            setActiveTab('profile');
        }
    }, [isAdmin, activeTab, setActiveTab]);

    // ============================================================================
    // RENDER CONTENT
    // ============================================================================
    const renderContent = () => {
        // Block admin routes for non-admin users
        if (!isAdmin && (activeTab === 'server-status' || activeTab === 'content-admin')) {
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
                        />
                        <div className="h-full">
                            <CacheManagerPanel currentUser={currentUser} />
                        </div>
                    </div>
                );
            case 'flowLogin':
                return (
                    <div className="w-full">
                        <FlowLogin 
                            currentUser={currentUser}
                            onUserUpdate={onUserUpdate}
                            onOpenChangeServerModal={onOpenChangeServerModal}
                        />
                    </div>
                );
            case 'registerTokenUltra':
                return (
                    <div className="w-full">
                        <RegisterTokenUltra 
                            currentUser={currentUser}
                            onUserUpdate={onUserUpdate}
                        />
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
            <div className="flex-shrink-0 mb-6 flex justify-center">
                <Tabs 
                    tabs={finalTabs}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    isAdmin={isAdmin}
                />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
                {renderContent()}
            </div>
        </div>
    );
};

export default SettingsView;
