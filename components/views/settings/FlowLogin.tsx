
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { saveUserPersonalAuthToken, getTokenUltraRegistration, getEmailFromPoolByCode } from '../../../services/userService';
import { type User, type TokenUltraRegistration } from '../../../types';
import { KeyIcon, CheckCircleIcon, XIcon, AlertTriangleIcon, InformationCircleIcon, EyeIcon, EyeOffIcon, SparklesIcon, ClipboardIcon, UserIcon, ClockIcon, VideoIcon, PlayIcon } from '../../Icons';
import Spinner from '../../common/Spinner';
import { getTranslations } from '../../../services/translations';
import { runComprehensiveTokenTest, type TokenTestResult, generateImageWithNanoBanana } from '../../../services/imagenV3Service';
import { BOT_ADMIN_API_URL, getBotAdminApiUrlWithFallback } from '../../../services/appConfig';
import { BRAND_CONFIG } from '../../../services/brandConfig';
import { autoGenerateCookie } from '../../../services/tokenBackendService';
import { isLocalhost, isElectron } from '../../../services/environment';

interface FlowLoginProps {
    currentUser?: User | null;
    onUserUpdate?: (user: User) => void;
    /** When Token Ultra sits beside Flow Login in Settings, stack Flow content in one column (2-panel layout). */
    pairWithTokenUltraPanel?: boolean;
}

const FlowLogin: React.FC<FlowLoginProps> = ({
    currentUser,
    onUserUpdate,
    pairWithTokenUltraPanel = false,
}) => {
    const [flowToken, setFlowToken] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing'>('idle');
    const [testResults, setTestResults] = useState<TokenTestResult[] | null>(null);
    const [tokenSaved, setTokenSaved] = useState(false);
    
    const saveTimeoutRef = useRef<any>(null);
    const isInitialMount = useRef(true);
    const T = getTranslations().settingsView;
    const T_Api = T.api;

    // Shared API Key State
    const [activeApiKey, setActiveApiKey] = useState<string | null>(null);
    
    // Token Ultra Credentials State
    const [tokenUltraRegistration, setTokenUltraRegistration] = useState<TokenUltraRegistration | null>(null);
    const [emailDetails, setEmailDetails] = useState<{ email: string; password: string } | null>(null);
    const [showUltraPassword, setShowUltraPassword] = useState(false);
    const [copiedUltraEmail, setCopiedUltraEmail] = useState(false);
    const [copiedUltraPassword, setCopiedUltraPassword] = useState(false);
    
    // Token Ultra Status State
    const [ultraRegistration, setUltraRegistration] = useState<TokenUltraRegistration | null>(null);
    const [isLoadingUltra, setIsLoadingUltra] = useState(false);

    // Helper function to check if Token Ultra is active
    const isTokenUltraActive = useCallback((): boolean => {
        if (!ultraRegistration) return false;
        const expiresAt = new Date(ultraRegistration.expires_at);
        const now = new Date();
        return (ultraRegistration.status === 'active' || ultraRegistration.status === 'expiring_soon') && expiresAt > now;
    }, [ultraRegistration]);
    
    // Helper function to calculate hours and minutes since last save
    const getTimeSinceLastSave = useCallback((lastSave: string): { hours: number; minutes: number } => {
        const lastSaveDate = new Date(lastSave);
        const now = new Date();
        const diffMs = now.getTime() - lastSaveDate.getTime();
        const totalMinutes = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return { hours, minutes };
    }, []);
    
    // Video Tutorial Modal State
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    
    
    // Generated Token from API State
    const [generatedToken, setGeneratedToken] = useState('');
    const [isLoadingToken, setIsLoadingToken] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [generateCookieLoading, setGenerateCookieLoading] = useState(false);
    const [generateCookieMessage, setGenerateCookieMessage] = useState<string | null>(null);
    const [tokenCredits, setTokenCredits] = useState<number | null>(null);
    const [tokenCopied, setTokenCopied] = useState(false);
    const [generatedTokenSaved, setGeneratedTokenSaved] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const countdownIntervalRef = useRef<number | null>(null);

    useEffect(() => {
        setActiveApiKey(sessionStorage.getItem(BRAND_CONFIG.sessionKey));
    }, []);
    
    // Synchronize states with currentUser
    useEffect(() => {
        if (!currentUser) return;
        
        if (currentUser.personalAuthToken) {
            setFlowToken(currentUser.personalAuthToken);
        }
        
        const loadTokenUltraDetails = async () => {
            setIsLoadingUltra(true);
            try {
                const regResult = await getTokenUltraRegistration(currentUser.id);
                if (regResult.success && regResult.registration) {
                    setTokenUltraRegistration(regResult.registration);
                    setUltraRegistration(regResult.registration);
                    if (regResult.registration.email_code) {
                        const emailResult = await getEmailFromPoolByCode(regResult.registration.email_code);
                        if (emailResult.success) {
                            setEmailDetails({ email: emailResult.email, password: emailResult.password });
                        }
                    }
                } else {
                    // ✅ FIX: Clear registration state if user doesn't have Token Ultra
                    setTokenUltraRegistration(null);
                    setUltraRegistration(null);
                    setEmailDetails(null);
                }
            } catch (e) {
                console.error("Failed to load ultra status", e);
                // ✅ FIX: Clear state on error
                setTokenUltraRegistration(null);
                setUltraRegistration(null);
                setEmailDetails(null);
            } finally {
                setIsLoadingUltra(false);
            }
        };
        loadTokenUltraDetails();
        
        if (isInitialMount.current) isInitialMount.current = false;
    }, [currentUser?.id, currentUser?.personalAuthToken]);

    // Auto-save Flow Token
    useEffect(() => {
        // Skip on initial mount (when component first loads)
        if (isInitialMount.current) {
            console.log('[FlowLogin] Auto-save: Skipping initial mount');
            return;
        }
        
        // Must have user and token
        if (!currentUser || !flowToken.trim()) {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            return;
        }

        // Skip if token is exactly the same as what's in currentUser (already saved)
        // This prevents unnecessary saves when token hasn't changed
        const currentToken = currentUser.personalAuthToken || '';
        const newToken = flowToken.trim();
        
        if (currentToken && newToken === currentToken.trim()) {
            // Token unchanged, skip save (no logging to reduce console spam)
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            return;
        }

        // Clear existing timeout
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        // Save after 2 seconds delay (allows user to finish typing)
        saveTimeoutRef.current = setTimeout(async () => {
            try {
                setIsSaving(true);
                const result = await saveUserPersonalAuthToken(currentUser.id, flowToken.trim());
                if (result.success) {
                    setTokenSaved(true);
                    if (onUserUpdate) onUserUpdate(result.user);
                    setTimeout(() => setTokenSaved(false), 3000);
                } else {
                    console.error('[FlowLogin] Auto-save failed:', result.message);
                }
            } catch (err) {
                console.error("Auto-save Flow Token failed", err);
            } finally {
                setIsSaving(false);
            }
        }, 2000);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [flowToken, currentUser, onUserUpdate]);

    // Auto-play video when modal opens
    useEffect(() => {
        if (isVideoModalOpen && videoRef.current) {
            videoRef.current.play().catch(err => {
                console.error('Error auto-playing video:', err);
            });
        }
    }, [isVideoModalOpen]);

    // Cleanup countdown interval on unmount
    useEffect(() => {
        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, []);

    const handleCopyUltraEmail = () => {
        if (emailDetails?.email) {
            navigator.clipboard.writeText(emailDetails.email);
            setCopiedUltraEmail(true);
            setTimeout(() => setCopiedUltraEmail(false), 2000);
        }
    };

    const handleCopyUltraPassword = () => {
        if (emailDetails?.password) {
            navigator.clipboard.writeText(emailDetails.password);
            setCopiedUltraPassword(true);
            setTimeout(() => setCopiedUltraPassword(false), 2000);
        }
    };

    const handleOpenFlow = () => window.open('https://labs.google/fx/tools/flow', '_blank');
    const handleGetToken = () => window.open('https://labs.google/fx/api/auth/session', '_blank');

    const handleTestToken = useCallback(async () => {
        const tokenToTest = flowToken.trim() || generatedToken?.trim() || currentUser?.personalAuthToken;
        if (!tokenToTest) return;
        setTestStatus('testing');
        setTestResults(null);
        try {
            // Test NanoBanana dulu sahaja
            let nanoBananaSuccess = false;
            let errorMessage = '';
            
            try {
                await generateImageWithNanoBanana({
                    prompt: 'test',
                    config: {
                        authToken: tokenToTest,
                        sampleCount: 1,
                        aspectRatio: '1:1',
                    }
                }, undefined, true);
                nanoBananaSuccess = true;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                errorMessage = message;
                
                // Check for 401 or unauthorized errors
                const isUnauthorized = message.includes('401') || 
                                     message.toLowerCase().includes('unauthorized') ||
                                     message.toLowerCase().includes('permission denied');
                
                if (isUnauthorized || !nanoBananaSuccess) {
                    // Stop terus, tunjukkan error yang sama untuk kedua-dua service
                    setTestResults([
                        { service: 'NanoBanana', success: false, message: errorMessage },
                        { service: 'Veo', success: false, message: errorMessage },
                    ]);
                    setTestStatus('idle');
                    return;
                }
            }
            
            // If NanoBanana succeeds, mark both services as operational
            if (nanoBananaSuccess) {
                setTestResults([
                    { service: 'NanoBanana', success: true, message: 'Operational' },
                    { service: 'Veo', success: true, message: 'Operational' },
                ]);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Test failed';
            setTestResults([
                { service: 'NanoBanana', success: false, message: errorMsg },
                { service: 'Veo', success: false, message: errorMsg },
            ]);
        } finally {
            setTestStatus('idle');
        }
    }, [flowToken, generatedToken, currentUser?.personalAuthToken]);

    const handleGetNewToken = async () => {
        if (!currentUser) return;
        
        setIsLoadingToken(true);
        setTokenError(null);
        setGeneratedToken('');
        setTokenCredits(null);
        
        // Start countdown from 120 seconds
        setCountdown(120);
        
        // Clear any existing interval
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
        }
        
        // Start countdown timer
        countdownIntervalRef.current = window.setInterval(() => {
            setCountdown(prev => {
                if (prev === null) return null;
                return prev - 1;
            });
        }, 1000);
        
        const startTime = Date.now();
        
        try {
            // Use centralized API for all environments
            const apiUrl = await getBotAdminApiUrlWithFallback();
            
            // Use email, telegram_id, or username to find user
            const requestBody: { email?: string; telegram_id?: number; username?: string } = {};
            
            if (currentUser.email) {
                requestBody.email = currentUser.email;
            } else if (currentUser.id) {
                // Assuming id is telegram_id
                requestBody.telegram_id = currentUser.id;
            } else if (currentUser.username) {
                requestBody.username = currentUser.username;
            } else {
                setTokenError('User email, ID, or username is required');
                setIsLoadingToken(false);
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                }
                setCountdown(null);
                return;
            }
            
            const response = await fetch(`${apiUrl}/api/generate-token-for-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            
            const data = await response.json();
            
            const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
            const remainingTime = 120 - elapsedTime;
            
            if (data.success) {
                setGeneratedToken(data.token);
                setTokenCredits(data.credits);
                setTokenError(null);
                
                // Extract cookie_file name for saving to Supabase
                let cookieFileName: string | null = null;
                if (data.cookie_file) {
                    // Extract filename from path (e.g., "G11/flow_g11_c1.json" -> "flow_g11_c1.json")
                    cookieFileName = data.cookie_file.includes('/') 
                        ? data.cookie_file.split('/').pop() || null
                        : data.cookie_file;
                    console.log(`[FlowLogin] 🍪 Cookie file name for saving: ${cookieFileName}`);
                }
                
                // Auto-fill the flow token field and save immediately (no delay for both brands)
                // Follow same flow as MONOKLIX - save using currentUser.id
                // Supabase client already configured for correct brand project
                if (data.token && currentUser) {
                    setFlowToken(data.token);
                    
                    // Save token immediately to Supabase (no delay)
                    // Important: Token saved to respective brand's Supabase table (configured in supabaseClient.ts)
                    try {
                        setIsSaving(true);
                        const saveResult = await saveUserPersonalAuthToken(currentUser.id, data.token.trim(), cookieFileName);
                        
                        if (saveResult.success) {
                            setTokenSaved(true);
                            if (onUserUpdate) onUserUpdate(saveResult.user);
                            setTimeout(() => setTokenSaved(false), 3000);
                            setSuccessMessage('Token generated successfully and saved to Supabase!');
                        } else {
                            setSuccessMessage(`Token generated but failed to save: ${saveResult.message || 'Unknown error'}`);
                        }
                    } catch (saveError) {
                        console.error('[FlowLogin] Exception saving token:', saveError);
                        setSuccessMessage('Token generated but failed to save. Please check console for details.');
                    } finally {
                        setIsSaving(false);
                    }
                    setTimeout(() => setSuccessMessage(null), 5000);
                }
                
                // Stop countdown if completed early
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                }
                // If completed early, set to 0, otherwise show negative
                setCountdown(remainingTime > 0 ? 0 : remainingTime);
            } else {
                setTokenError(data.error || 'Failed to generate token');
                setGeneratedToken('');
                setTokenCredits(null);
                
                // Stop countdown on error
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                }
                setCountdown(null);
            }
        } catch (err: any) {
            setTokenError(`Error: ${err.message || 'Failed to connect to API'}`);
            setGeneratedToken('');
            setTokenCredits(null);
            
            // Stop countdown on error
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
            }
            setCountdown(null);
        } finally {
            setIsLoadingToken(false);
        }
    };

    const handleCopyGeneratedToken = () => {
        if (generatedToken) {
            navigator.clipboard.writeText(generatedToken).then(() => {
                setTokenCopied(true);
                setTimeout(() => setTokenCopied(false), 2000);
            }).catch(err => {
                console.error('Failed to copy token:', err);
            });
        }
    };

    const handleGenerateCookiesForFolder = async (flowCode: string) => {
        setGenerateCookieMessage(null);
        setGenerateCookieLoading(true);
        try {
            const result = await autoGenerateCookie(flowCode);
            if (result.success) {
                setGenerateCookieMessage('Generating token...');
                await handleGetNewToken();
                setGenerateCookieMessage(null);
            } else {
                setGenerateCookieMessage(result.error || 'Failed to generate cookies.');
            }
        } catch (e) {
            setGenerateCookieMessage(e instanceof Error ? e.message : 'Failed to generate cookies.');
        } finally {
            setGenerateCookieLoading(false);
        }
    };

    const handleSaveGeneratedToken = () => {
        if (generatedToken && currentUser) {
            // Set flowToken which will trigger auto-save after 2 seconds
            setFlowToken(generatedToken);
            setGeneratedTokenSaved(true);
            setTimeout(() => setGeneratedTokenSaved(false), 3000);
        }
    };

    if (!currentUser) return null;

    const flowMainGridClass = pairWithTokenUltraPanel
        ? 'grid min-h-0 flex-1 grid-cols-1 gap-8'
        : 'grid min-h-0 flex-1 grid-cols-1 gap-8 xl:grid-cols-2';

    const veolyApiKeysCard = (
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800">
            <h3 className="text-base sm:text-lg font-bold mb-4 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-primary-500" />
                {T_Api.title}
            </h3>

            <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-[0.5px] border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-2 sm:gap-3">
                    <InformationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] sm:text-xs text-blue-800 dark:text-blue-200">
                        {T_Api.description}
                    </p>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm font-medium">
                    <span className="text-neutral-600 dark:text-neutral-400">{T_Api.sharedStatus}</span>
                    {activeApiKey ? (
                        <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                            <CheckCircleIcon className="w-4 h-4" />
                            {T_Api.connected}
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 text-red-500">
                            <XIcon className="w-4 h-4" />
                            {T_Api.notLoaded}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );

    /** API keys card only — Generation Server moved to Profile tab (SettingsView ProfilePanel). */
    const apiKeysAndServerPanels = (
        <div className="flex flex-col gap-6">
            {veolyApiKeysCard}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <div className={flowMainGridClass}>
                {/* Left Panel: Flow Login */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                            <KeyIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Flow Login</h2>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage your manual authentication tokens</p>
                        </div>
                    </div>

                    {/* How to Get Token Instructions (MOVED TO TOP) */}
                    <div className="mb-6">
                            <>
                                {/* Instructions for Token Ultra Active Users */}
                                {isTokenUltraActive() && (
                                    <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-[0.5px] border-blue-200 dark:border-blue-800">
                                        <InformationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                                        <div className="text-[11px] sm:text-xs text-blue-800 dark:text-blue-200">
                                            <p className="text-[11px] sm:text-xs font-bold mb-2 uppercase tracking-wide">How to get your Flow Token:</p>
                                            <ol className="text-[11px] sm:text-xs space-y-1.5 list-decimal list-inside font-medium">
                                                <li>Click the "Generate NEW Token (Auto)" button below</li>
                                                <li>Your token will be automatically generated and saved</li>
                                                <li>You can use it immediately for your session</li>
                                            </ol>
                                        </div>
                                    </div>
                                )}

                                {/* Instructions for Regular Users */}
                                {!isTokenUltraActive() && (
                                    <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-[0.5px] border-blue-200 dark:border-blue-800">
                                        <InformationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                                        <div className="text-[11px] sm:text-xs text-blue-800 dark:text-blue-200">
                                            <p className="text-[11px] sm:text-xs font-bold mb-2 uppercase tracking-wide">How to get your Flow Token:</p>
                                            <ol className="text-[11px] sm:text-xs space-y-1.5 list-decimal list-inside font-medium">
                                                <li>Click the "Login Google Flow" button to open the Google Flow login page</li>
                                                <li>After logging in, click the "Copy Token (Manual)" button to retrieve your token</li>
                                                <li>Copy the token and paste it into the input field above</li>
                                                <li>Your token will be automatically saved</li>
                                            </ol>
                                        </div>
                                    </div>
                                )}
                            </>
                    </div>

                    {pairWithTokenUltraPanel && !isLoadingUltra && !ultraRegistration && (
                        <div className="mb-6">
                            {apiKeysAndServerPanels}
                        </div>
                    )}

                    {/* Token Ultra Status Section */}
                    {!isLoadingUltra && ultraRegistration && (
                        <div className="mb-6 space-y-4 animate-zoomIn">
                            <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                                <ClockIcon className="w-5 h-5 text-primary-500" />
                                Token Ultra Status
                            </h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                    <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Status:</span>
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                                        ultraRegistration.status === 'active' 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400'
                                        : ultraRegistration.status === 'expired'
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400'
                                    }`}>
                                        {ultraRegistration.status === 'active' 
                                            ? `ACTIVE${ultraRegistration.email_code ? ` - ${ultraRegistration.email_code}` : ''}` 
                                            : ultraRegistration.status === 'expired' 
                                            ? `EXPIRED${ultraRegistration.email_code ? ` - ${ultraRegistration.email_code}` : ''}`
                                            : `EXPIRING SOON${ultraRegistration.email_code ? ` - ${ultraRegistration.email_code}` : ''}`}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                    <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Active Until:</span>
                                    <span className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
                                        {new Date(ultraRegistration.expires_at).toLocaleDateString('en-GB', { 
                                            year: 'numeric', 
                                            month: 'long', 
                                            day: 'numeric' 
                                        }).toUpperCase()}
                                    </span>
                                </div>

                                {/* Package Credit Balance (Token Ultra Credit) */}
                                <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                    <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Package Credits:</span>
                                    <span className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
                                        {currentUser?.creditBalance != null && currentUser.creditBalance !== 0
                                            ? currentUser.creditBalance.toLocaleString()
                                            : '0'}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                    <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">GEMINI API Keys:</span>
                                    <span
                                        className={`text-xs font-bold uppercase ${
                                            activeApiKey
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-red-500 dark:text-red-400'
                                        }`}
                                    >
                                        {activeApiKey ? T_Api.connected : T_Api.notLoaded}
                                    </span>
                                </div>

                                
                                {/* Flow Account Email & Password (Controlled by feature flag) */}
                                {emailDetails && (BRAND_CONFIG.featureFlags?.showFlowAccountDetails ?? false) && (
                                    <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <div className="flex items-center gap-2 mb-3">
                                            <UserIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                            <h4 className="text-xs font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wider">
                                                Flow Account Details
                                            </h4>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {/* Email */}
                                            <div>
                                                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                    Email:
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        readOnly
                                                        value={emailDetails.email}
                                                        className="flex-1 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-800 dark:text-neutral-200"
                                                    />
                                                    <button
                                                        onClick={handleCopyUltraEmail}
                                                        className="p-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors flex items-center justify-center"
                                                        title="Copy email"
                                                    >
                                                        {copiedUltraEmail ? (
                                                            <CheckCircleIcon className="w-4 h-4" />
                                                        ) : (
                                                            <ClipboardIcon className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Password */}
                                            <div>
                                                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                    Password:
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type={showUltraPassword ? 'text' : 'password'}
                                                        readOnly
                                                        value={emailDetails.password}
                                                        className="flex-1 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-800 dark:text-neutral-200"
                                                    />
                                                    <button
                                                        onClick={() => setShowUltraPassword(!showUltraPassword)}
                                                        className="px-3 py-2 bg-neutral-600 dark:bg-neutral-700 text-white text-xs font-semibold rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-colors flex items-center gap-1.5"
                                                        title="Toggle password visibility"
                                                    >
                                                        {showUltraPassword ? (
                                                            <EyeOffIcon className="w-3.5 h-3.5" />
                                                        ) : (
                                                            <EyeIcon className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={handleCopyUltraPassword}
                                                        className="p-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors flex items-center justify-center"
                                                        title="Copy password"
                                                    >
                                                        {copiedUltraPassword ? (
                                                            <CheckCircleIcon className="w-4 h-4" />
                                                        ) : (
                                                            <ClipboardIcon className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {ultraRegistration.status === 'expired' && (
                                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                                        <AlertTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-bold text-red-800 dark:text-red-200 mb-1">YOUR TOKEN ULTRA HAS EXPIRED</p>
                                            <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed">Please renew your token using the Token Ultra Credit panel on the right to continue using premium features.</p>
                                        </div>
                                    </div>
                                )}
                                {ultraRegistration.status === 'expiring_soon' && (
                                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
                                        <InformationCircleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-bold text-yellow-800 dark:text-yellow-200 mb-1">TOKEN ULTRA EXPIRING SOON</p>
                                            <p className="text-[11px] text-yellow-700 dark:text-yellow-300 leading-relaxed">Your token will expire soon. Please renew early using the Token Ultra Credit panel on the right to avoid any service interruption.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}


                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between gap-2 sm:gap-3 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider shrink-0">
                                    Flow Token:
                                </span>
                                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                                    <input
                                        id="flow-token"
                                        type={showToken ? 'text' : 'password'}
                                        value={flowToken}
                                        onChange={e => setFlowToken(e.target.value)}
                                        placeholder="Paste token…"
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="min-w-0 flex-1 border-0 bg-transparent py-0.5 pl-1 text-right font-mono text-xs font-bold text-neutral-700 placeholder:font-normal placeholder:text-neutral-400 dark:text-neutral-200 focus:outline-none focus:ring-0"
                                    />
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {tokenSaved && flowToken.trim() && (
                                            <span className="text-xs font-medium text-green-600 dark:text-green-400">Saved</span>
                                        )}
                                    {isSaving && <Spinner />}
                                        <button
                                            type="button"
                                            onClick={() => setShowToken(!showToken)}
                                            className="flex items-center rounded-md p-1.5 text-neutral-500 hover:bg-neutral-200/80 hover:text-neutral-800 dark:hover:bg-neutral-700/80 dark:hover:text-neutral-200"
                                            aria-label={showToken ? 'Hide token' : 'Show token'}
                                        >
                                            {showToken ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            </div>
                            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                                Token used for image/video generation requests
                            </p>
                        </div>

                        {/* Last Token Save Information */}
                        {currentUser?.personalAuthTokenUpdatedAt && (
                            <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                                <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Token Last Updated:</span>
                                <div className="flex flex-col items-end gap-1">
                                    <span className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
                                        {new Date(currentUser.personalAuthTokenUpdatedAt).toLocaleDateString('en-GB', { 
                                            year: 'numeric', 
                                            month: '2-digit', 
                                            day: '2-digit' 
                                        })} {new Date(currentUser.personalAuthTokenUpdatedAt).toLocaleTimeString('en-GB', { 
                                            hour: '2-digit', 
                                            minute: '2-digit',
                                            hour12: false
                                        })}
                                    </span>
                                    <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                                        {(() => {
                                            const { hours, minutes } = getTimeSinceLastSave(currentUser.personalAuthTokenUpdatedAt);
                                            if (hours === 0 && minutes === 0) {
                                                return '(Just now)';
                                            } else if (hours === 0) {
                                                return `(${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago)`;
                                            } else if (minutes === 0) {
                                                return `(${hours} ${hours === 1 ? 'hour' : 'hours'} ago)`;
                                            } else {
                                                return `(${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago)`;
                                            }
                                        })()}
                                    </span>
                                </div>
                            </div>
                        )}

                        {testStatus === 'testing' && <div className="flex items-center gap-2 text-sm text-neutral-500"><Spinner /> {T_Api.testing}</div>}
                        {testResults && (
                            <div className="space-y-2">
                                {testResults.map(result => (
                                    <div key={result.service} className={`flex items-start gap-2 text-sm p-2 rounded-md ${result.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                                        {result.success ? <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"/> : <XIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"/>}
                                        <div>
                                            <span className={`font-semibold ${result.success ? 'text-green-800 dark:text-green-200' : 'text-red-700 dark:text-red-300'}`}>{result.service} Service</span>
                                            <p className={`text-xs ${result.success ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>{result.message}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-3">
                                <>
                                    <button onClick={handleOpenFlow} className="w-full flex items-center justify-center gap-2 bg-green-600 dark:bg-green-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors">
                                        <KeyIcon className="w-4 h-4" />
                                        Login Google Flow
                                    </button>
                                    <button onClick={handleGetToken} className="w-full flex items-center justify-center gap-2 bg-blue-600 dark:bg-blue-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                                        <KeyIcon className="w-4 h-4" />
                                        Copy Token (Manual)
                                    </button>
                                    {isTokenUltraActive() && (
                                        <button onClick={handleGetNewToken} disabled={isLoadingToken || !currentUser} className="w-full flex items-center justify-center gap-2 bg-purple-600 dark:bg-purple-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors disabled:opacity-50">
                                            {isLoadingToken ? (
                                                <>
                                                    <Spinner />
                                                    {countdown !== null ? (
                                                        <span>Generating Token... ({countdown > 0 ? `${countdown}s` : `-${Math.abs(countdown)}s`})</span>
                                                    ) : (
                                                        <span>Generating Token...</span>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <KeyIcon className="w-4 h-4" />
                                                    Generate NEW Token (Auto)
                                                </>
                                            )}
                                        </button>
                                    )}
                                </>
                            
                            <button onClick={handleTestToken} disabled={(!flowToken.trim() && !currentUser?.personalAuthToken) || testStatus === 'testing'} className="w-full flex items-center justify-center gap-2 bg-blue-600 dark:bg-blue-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">{testStatus === 'testing' ? <Spinner /> : <SparklesIcon className="w-4 h-4" />}Health Test</button>
                            <button
                                onClick={() => setIsVideoModalOpen(true)}
                                className="w-full flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            >
                                <PlayIcon className="w-4 h-4" />
                                Video Tutorial Login Google Flow
                            </button>
                        </div>

                        {/* Generated Token Output */}
                        {tokenError && (
                            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                                <p className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">Error:</p>
                                <p className="text-sm text-red-700 dark:text-red-300">{tokenError}</p>
                                {/No available cookies found in folder\s+/i.test(tokenError) && (isLocalhost() || isElectron()) && (() => {
                                    const match = tokenError.match(/folder\s+([A-Za-z0-9]+)/i);
                                    const flowCode = match ? match[1].toUpperCase() : null;
                                    if (!flowCode) return null;
                                    return (
                                        <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800 flex flex-col items-center justify-center text-center">
                                            <button
                                                type="button"
                                                onClick={() => handleGenerateCookiesForFolder(flowCode)}
                                                disabled={generateCookieLoading}
                                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {generateCookieLoading ? <Spinner /> : null}
                                                {generateCookieLoading ? 'Generating...' : `Generate new cookies (${flowCode})`}
                                            </button>
                                            {generateCookieMessage && (
                                                <p className={`mt-2 text-xs w-full ${generateCookieMessage.startsWith('Generating token') ? 'text-blue-700 dark:text-blue-300' : generateCookieMessage.startsWith('Cookies generated') || generateCookieMessage.includes('success') ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                                                    {generateCookieMessage}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {generatedToken && (
                            <div className="mt-4 space-y-3">
                                {/* Success Notification */}
                                {successMessage && (
                                    <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                            <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                                                {successMessage}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="p-4 bg-gray-50 dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Generated Token:
                                        </label>
                                        <button
                                            onClick={handleTestToken}
                                            disabled={testStatus === 'testing' || !generatedToken.trim()}
                                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {testStatus === 'testing' ? (
                                                <>
                                                    <Spinner />
                                                    Testing...
                                                </>
                                            ) : (
                                                <>
                                                    <PlayIcon className="w-3 h-3" />
                                                    Health Test Now
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <textarea
                                        readOnly
                                        value={generatedToken}
                                        className="w-full p-3 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-600 rounded text-sm font-mono text-gray-800 dark:text-gray-200 resize-none"
                                        rows={6}
                                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                                    />
                                </div>

                                {/* Token Info */}
                                {generatedToken && (
                                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                        <div className="space-y-1 text-sm">
                                            {tokenCredits !== null && tokenCredits !== undefined && tokenCredits !== 0 ? (
                                                <>
                                                    <p className="text-gray-700 dark:text-gray-300">
                                                        <span className="font-semibold">Credits:</span> {tokenCredits.toLocaleString()}
                                                    </p>
                                                    <p className="text-gray-500 dark:text-gray-400 text-xs">
                                                        Token generated from API and auto-saved
                                                    </p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-gray-700 dark:text-gray-300">
                                                        <span className="font-semibold">Credits:</span> <span className="text-orange-600 dark:text-orange-400">N/A</span>
                                                    </p>
                                                    <p className="text-red-600 dark:text-red-400 text-xs font-medium">
                                                        ⚠️ Please contact admin on Telegram to update cookie files
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {!pairWithTokenUltraPanel && (
                    <div className="flex min-h-0 min-w-0 flex-col xl:min-h-full">{apiKeysAndServerPanels}</div>
                )}
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
                            src="https://veoly-ai.com/wp-content/uploads/2026/01/Video-01-Personal-Auth-Token.mp4"
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

export default FlowLogin;
