import React, { useState, useEffect, useRef } from 'react';
import { saveUserRecaptchaToken, getMasterRecaptchaToken, hasActiveTokenUltraWithRegistration } from '../../../services/userService';
import { type User } from '../../../types';
import { KeyIcon, InformationCircleIcon, EyeIcon, EyeOffIcon, SparklesIcon, PlayIcon, XIcon } from '../../Icons';
import Spinner from '../../common/Spinner';
import { testAntiCaptchaKey } from '../../../services/antiCaptchaService';
import { testEzCaptchaKey } from '../../../services/ezCaptchaService';
import { testCapSolverKey } from '../../../services/capsolverService';
import { checkBridgeServer, getBridgeServerUrl } from '../../../services/bridgeServerService';
import { BRAND_CONFIG } from '../../../services/brandConfig';

interface RecaptchaSettingsPanelProps {
  currentUser: User;
  onUserUpdate?: (user: User) => void;
}

/**
 * reCAPTCHA / captcha provider settings (moved from FlowLogin Token Setting tab).
 */
const RecaptchaSettingsPanel: React.FC<RecaptchaSettingsPanelProps> = ({ currentUser, onUserUpdate }) => {
  const [antiCaptchaApiKey, setAntiCaptchaApiKey] = useState('');
  const [showAntiCaptchaKey, setShowAntiCaptchaKey] = useState(false);
  const [antiCaptchaTestStatus, setAntiCaptchaTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [antiCaptchaTestMessage, setAntiCaptchaTestMessage] = useState<string>('');
  const [recaptchaTokenSaved, setRecaptchaTokenSaved] = useState(false);
  const [isSavingRecaptcha, setIsSavingRecaptcha] = useState(false);
  const [isLoadingMasterToken, setIsLoadingMasterToken] = useState(false);

  const [captchaProvider, setCaptchaProvider] = useState<'anti-captcha' | 'ez-captcha' | 'capsolver' | 'bridge-server'>(() => {
    const isAdmin = currentUser?.role === 'admin';
    if (BRAND_CONFIG.name === 'VEOLY-AI') {
      if (!isAdmin) {
        localStorage.setItem('captchaProvider', 'bridge-server');
        return 'bridge-server';
      }
      return (
        (localStorage.getItem('captchaProvider') as 'anti-captcha' | 'ez-captcha' | 'capsolver' | 'bridge-server') ||
        'bridge-server'
      );
    }
    if (!isAdmin) {
      localStorage.setItem('captchaProvider', 'anti-captcha');
      return 'anti-captcha';
    }
    return (localStorage.getItem('captchaProvider') as 'anti-captcha' | 'ez-captcha' | 'capsolver' | 'bridge-server') || 'anti-captcha';
  });

  const [isAntiCaptchaVideoModalOpen, setIsAntiCaptchaVideoModalOpen] = useState(false);
  const antiCaptchaVideoRef = useRef<HTMLVideoElement>(null);
  const recaptchaSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const masterTokenResolvedRef = useRef(false);
  const panelInitialMountRef = useRef(true);
  const fetchingMasterRef = useRef(false);

  useEffect(() => {
    if (!currentUser) return;
    masterTokenResolvedRef.current = false;

    let cancelled = false;

    const run = async () => {
      let apiKey = currentUser.recaptchaToken || '';
      const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
      let tokenUltraReg: { status?: string; expires_at?: string; allow_master_token?: boolean } | null = null;

      if (cachedReg) {
        try {
          tokenUltraReg = JSON.parse(cachedReg);
        } catch {
          /* ignore */
        }
      }

      if (!tokenUltraReg) {
        const ultraResult = await hasActiveTokenUltraWithRegistration(currentUser.id);
        if (cancelled) return;
        if (ultraResult.isActive && ultraResult.registration) {
          tokenUltraReg = ultraResult.registration;
        }
      }

      if (tokenUltraReg) {
        const expiresAt = new Date(tokenUltraReg.expires_at || 0);
        const now = new Date();
        const isActive =
          (tokenUltraReg.status === 'active' || tokenUltraReg.status === 'expiring_soon') && expiresAt > now;

        if (isActive) {
          const isBlockedFromMaster = tokenUltraReg.allow_master_token === false;
          if (!isBlockedFromMaster) {
            const cachedMasterToken = sessionStorage.getItem('master_recaptcha_token');
            if (cachedMasterToken && cachedMasterToken.trim()) {
              apiKey = cachedMasterToken;
            } else {
              const masterTokenResult = await getMasterRecaptchaToken();
              if (cancelled) return;
              if (masterTokenResult.success && masterTokenResult.apiKey) {
                apiKey = masterTokenResult.apiKey;
              } else {
                apiKey = currentUser.recaptchaToken || '';
              }
            }
          } else {
            apiKey = currentUser.recaptchaToken || '';
          }
        } else {
          apiKey = currentUser.recaptchaToken || '';
        }
      } else {
        apiKey = currentUser.recaptchaToken || '';
      }

      if (!cancelled) setAntiCaptchaApiKey(apiKey);
    };

    void run();
    if (panelInitialMountRef.current) panelInitialMountRef.current = false;

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.recaptchaToken]);

  useEffect(() => {
    if (!currentUser) return;
    const isAdmin = currentUser.role === 'admin';
    if (BRAND_CONFIG.name === 'VEOLY-AI') {
      if (!isAdmin && captchaProvider !== 'bridge-server') {
        setCaptchaProvider('bridge-server');
        localStorage.setItem('captchaProvider', 'bridge-server');
      }
      return;
    }
    if (!isAdmin && captchaProvider !== 'anti-captcha') {
      setCaptchaProvider('anti-captcha');
      localStorage.setItem('captchaProvider', 'anti-captcha');
    }
  }, [currentUser, captchaProvider]);

  useEffect(() => {
    if (panelInitialMountRef.current || !currentUser || !antiCaptchaApiKey.trim()) return;

    const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
    let tokenUltraReg: { status?: string; expires_at?: string; allow_master_token?: boolean } | null = null;
    if (cachedReg) {
      try {
        tokenUltraReg = JSON.parse(cachedReg);
      } catch {
        /* ignore */
      }
    }

    if (tokenUltraReg) {
      const expiresAt = new Date(tokenUltraReg.expires_at || 0);
      const now = new Date();
      const isActive =
        (tokenUltraReg.status === 'active' || tokenUltraReg.status === 'expiring_soon') && expiresAt > now;
      const isBlockedFromMaster = tokenUltraReg.allow_master_token === false;
      if (isActive && !isBlockedFromMaster) return;
    }

    const unchanged = antiCaptchaApiKey.trim() === (currentUser.recaptchaToken || '');
    if (unchanged) return;

    if (recaptchaSaveTimeoutRef.current) clearTimeout(recaptchaSaveTimeoutRef.current);

    recaptchaSaveTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSavingRecaptcha(true);
        const result = await saveUserRecaptchaToken(currentUser.id, antiCaptchaApiKey.trim());
        if (result.success) {
          setRecaptchaTokenSaved(true);
          onUserUpdate?.(result.user);
          setTimeout(() => setRecaptchaTokenSaved(false), 3000);
        }
      } catch (err) {
        console.error('[RecaptchaSettingsPanel] Auto-save Anti-Captcha failed', err);
      } finally {
        setIsSavingRecaptcha(false);
      }
    }, 2000);

    return () => {
      if (recaptchaSaveTimeoutRef.current) clearTimeout(recaptchaSaveTimeoutRef.current);
    };
  }, [antiCaptchaApiKey, currentUser, onUserUpdate]);

  useEffect(() => {
    if (isAntiCaptchaVideoModalOpen && antiCaptchaVideoRef.current) {
      antiCaptchaVideoRef.current.play().catch(err => {
        console.error('Error auto-playing Anti-Captcha video:', err);
      });
    }
  }, [isAntiCaptchaVideoModalOpen]);

  const handleTestAntiCaptcha = async () => {
    if (captchaProvider === 'bridge-server') {
      setAntiCaptchaTestStatus('testing');
      setAntiCaptchaTestMessage('Testing bridge server connection...');
      try {
        const isAvailable = await checkBridgeServer();
        if (isAvailable) {
          setAntiCaptchaTestStatus('success');
          setAntiCaptchaTestMessage('✅ Bridge server is running and accessible!');
        } else {
          setAntiCaptchaTestStatus('error');
          setAntiCaptchaTestMessage(`❌ Bridge server is not accessible. Ensure ${getBridgeServerUrl()} is reachable.`);
        }
      } catch (error: unknown) {
        setAntiCaptchaTestStatus('error');
        setAntiCaptchaTestMessage(`❌ Bridge server error: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }

    if (!antiCaptchaApiKey.trim()) return;
    const providerName =
      captchaProvider === 'ez-captcha' ? 'EzCaptcha' : captchaProvider === 'capsolver' ? 'CapSolver' : 'Anti-Captcha';
    setAntiCaptchaTestStatus('testing');
    setAntiCaptchaTestMessage(`Testing ${providerName} API key...`);
    try {
      let result;
      if (captchaProvider === 'ez-captcha') {
        result = await testEzCaptchaKey(antiCaptchaApiKey.trim());
      } else if (captchaProvider === 'capsolver') {
        result = await testCapSolverKey(antiCaptchaApiKey.trim());
      } else {
        result = await testAntiCaptchaKey(antiCaptchaApiKey.trim());
      }
      if (result.valid) {
        setAntiCaptchaTestStatus('success');
        setAntiCaptchaTestMessage(`✅ ${providerName} API key is valid!`);
      } else {
        setAntiCaptchaTestStatus('error');
        setAntiCaptchaTestMessage(`❌ ${result.error || 'Invalid API key'}`);
      }
    } catch {
      setAntiCaptchaTestStatus('error');
      setAntiCaptchaTestMessage('❌ Test failed');
    }
    setTimeout(() => {
      setAntiCaptchaTestStatus('idle');
      setAntiCaptchaTestMessage('');
    }, 5000);
  };

  if (!currentUser) return null;

  return (
    <div className="w-full max-w-3xl mx-auto animate-zoomIn">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">reCAPTCHA &amp; captcha solving</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Provider and API key for fallback flows (NanoBanana, image tools, or Veo when bridge unified session is off).
        </p>
      </div>

      <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-800">
        <h3 className="text-base sm:text-lg font-bold mb-3 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
          <KeyIcon className="w-5 h-5 text-primary-500" />
          reCAPTCHA Configuration
        </h3>

        <div className="mb-4 p-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 leading-relaxed space-y-2">
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">Still used — but not for every path.</span>{' '}
            {BRAND_CONFIG.name === 'VEOLY-AI' ? (
              <>
                For <strong>Veo video</strong>, the app often uses an <strong>automatic Google Flow session</strong> via the{' '}
                <strong>bridge server</strong>. In that case this provider choice does <strong>not</strong> drive that request.
              </>
            ) : (
              <>Some flows use your provider below; others may use bridge or server automation.</>
            )}
          </p>
          <p>
            Keep this configured for fallback, image tools, and testing. Opt out of unified Veo with{' '}
            <code className="px-1 rounded bg-white/80 dark:bg-black/30 text-[10px]">localStorage bridgeUnifiedVideoSession = &apos;0&apos;</code>.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Captcha Provider</label>
          <select
            value={captchaProvider}
            onChange={e => {
              const provider = e.target.value as 'anti-captcha' | 'ez-captcha' | 'capsolver' | 'bridge-server';
              const isAdmin = currentUser?.role === 'admin';
              if (BRAND_CONFIG.name === 'VEOLY-AI') {
                if (!isAdmin && provider !== 'bridge-server') {
                  setCaptchaProvider('bridge-server');
                  localStorage.setItem('captchaProvider', 'bridge-server');
                  return;
                }
                localStorage.setItem('captchaProvider', provider);
                setCaptchaProvider(provider);
                return;
              }
              if (!isAdmin && provider !== 'anti-captcha') {
                setCaptchaProvider('anti-captcha');
                localStorage.setItem('captchaProvider', 'anti-captcha');
                return;
              }
              localStorage.setItem('captchaProvider', provider);
              setCaptchaProvider(provider);
            }}
            className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            disabled={currentUser.role !== 'admin'}
          >
            {BRAND_CONFIG.name === 'VEOLY-AI' && currentUser.role !== 'admin' ? (
              <option value="bridge-server">Bridge Server (default)</option>
            ) : (
              <>
                <option value="anti-captcha">Anti-Captcha.com (Standard)</option>
                {currentUser.role === 'admin' && (
                  <>
                    <option value="bridge-server">Bridge Server (Recommended)</option>
                    <option value="ez-captcha">EzCaptcha.com (High Score 0.9)</option>
                    <option value="capsolver">CapSolver.com (High Score 0.9)</option>
                  </>
                )}
              </>
            )}
          </select>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {captchaProvider === 'bridge-server'
              ? 'Using Bridge Server - Highest success rate, no API key needed'
              : captchaProvider === 'ez-captcha'
                ? 'Using EzCaptcha Enterprise High Score - Better quality tokens ($2.5/k)'
                : captchaProvider === 'capsolver'
                  ? 'Using CapSolver High Score - Fast & reliable tokens ($1/k)'
                  : 'Using Anti-Captcha Standard - Standard quality tokens'}
          </p>

          {captchaProvider === 'bridge-server' && currentUser.role === 'admin' && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">Bridge Server</p>
              <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <li>Highest success rate — tokens from real browser</li>
                <li>No API key needed</li>
              </ul>
            </div>
          )}

          {currentUser.role !== 'admin' && BRAND_CONFIG.name === 'VEOLY-AI' && (
            <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 rounded-lg">
              <p className="text-xs text-slate-700 dark:text-slate-300">
                VEOLY-AI uses <strong>Bridge Server</strong> by default for captcha solving on this path (no Anti-Captcha API key
                required). Admins can switch provider below.
              </p>
            </div>
          )}
          {currentUser.role !== 'admin' && BRAND_CONFIG.name !== 'VEOLY-AI' && (
            <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-xs text-yellow-800 dark:text-yellow-300">
                Only Anti-Captcha is available for your account. Admin accounts have access to additional providers.
              </p>
            </div>
          )}
        </div>

        {captchaProvider !== 'bridge-server' && (
          <div className="p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800 mb-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <InformationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] sm:text-xs text-yellow-800 dark:text-yellow-200">
                <p className="font-semibold mb-1">Required for generation (when this path is used)</p>
                <p>
                  Google requires reCAPTCHA solving. This key allows auto-solve via{' '}
                  {captchaProvider === 'ez-captcha' ? (
                    <a href="https://ez-captcha.com" target="_blank" rel="noreferrer" className="underline">
                      ez-captcha.com
                    </a>
                  ) : captchaProvider === 'capsolver' ? (
                    <a href="https://capsolver.com" target="_blank" rel="noreferrer" className="underline">
                      capsolver.com
                    </a>
                  ) : (
                    <a href="https://anti-captcha.com" target="_blank" rel="noreferrer" className="underline">
                      anti-captcha.com
                    </a>
                  )}
                  .
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {captchaProvider !== 'bridge-server' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                {captchaProvider === 'ez-captcha' ? 'EzCaptcha' : captchaProvider === 'capsolver' ? 'CapSolver' : 'Anti-Captcha'} API Key
              </label>
              <div className="relative">
                {(() => {
                  const cachedReg = sessionStorage.getItem(`token_ultra_registration_${currentUser.id}`);
                  let tokenUltraReg: { status?: string; expires_at?: string; allow_master_token?: boolean } | null = null;
                  if (cachedReg) {
                    try {
                      tokenUltraReg = JSON.parse(cachedReg);
                    } catch {
                      /* ignore */
                    }
                  }
                  const isUsingMasterToken =
                    tokenUltraReg &&
                    (tokenUltraReg.status === 'active' || tokenUltraReg.status === 'expiring_soon') &&
                    new Date(tokenUltraReg.expires_at || 0) > new Date() &&
                    tokenUltraReg.allow_master_token !== false;

                  if (isUsingMasterToken) {
                    const displayToken = antiCaptchaApiKey
                      ? showAntiCaptchaKey
                        ? antiCaptchaApiKey
                        : '•'.repeat(Math.max(0, antiCaptchaApiKey.length - 10)) + antiCaptchaApiKey.slice(-10)
                      : 'Loading...';
                    return (
                      <>
                        <div className="w-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 pr-10 text-blue-800 dark:text-blue-200 cursor-not-allowed">
                          <div className="flex items-center gap-2 mb-1">
                            <InformationCircleIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                            <span className="text-xs font-semibold">Master Token (Read-only)</span>
                          </div>
                          <div className="text-xs font-mono truncate">{displayToken}</div>
                        </div>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <button
                            type="button"
                            onClick={() => setShowAntiCaptchaKey(!showAntiCaptchaKey)}
                            className="text-blue-600 dark:text-blue-400 p-1"
                            title="Toggle visibility"
                          >
                            {showAntiCaptchaKey ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                          </button>
                        </div>
                      </>
                    );
                  }

                  return (
                    <>
                      <input
                        type={showAntiCaptchaKey ? 'text' : 'password'}
                        value={antiCaptchaApiKey}
                        onChange={e => setAntiCaptchaApiKey(e.target.value)}
                        placeholder="Enter your anti-captcha.com API key"
                        className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2.5 pr-10 focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-2">
                        {recaptchaTokenSaved && antiCaptchaApiKey.trim() && (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Saved</span>
                        )}
                        {isSavingRecaptcha && <Spinner />}
                        <button
                          type="button"
                          onClick={() => setShowAntiCaptchaKey(!showAntiCaptchaKey)}
                          className="px-3 flex items-center text-neutral-500 hover:text-neutral-700"
                        >
                          {showAntiCaptchaKey ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
              <p className="text-xs text-neutral-500 mt-1">Token is auto-saved upon change.</p>
            </div>
          )}

          <div className="w-full space-y-2">
            <button
              type="button"
              onClick={handleTestAntiCaptcha}
              disabled={(captchaProvider !== 'bridge-server' && !antiCaptchaApiKey) || antiCaptchaTestStatus === 'testing'}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {antiCaptchaTestStatus === 'testing' ? <Spinner /> : <SparklesIcon className="w-4 h-4" />}
              {captchaProvider === 'bridge-server' ? 'Test Bridge Server' : 'Test API Key'}
            </button>
            {antiCaptchaTestMessage && (
              <span
                className={`text-sm font-medium block ${antiCaptchaTestStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}
              >
                {antiCaptchaTestMessage}
              </span>
            )}
            {captchaProvider !== 'bridge-server' && (
              <button
                type="button"
                onClick={() => setIsAntiCaptchaVideoModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              >
                <PlayIcon className="w-4 h-4" />
                Video Tutorial Anti-Captcha
              </button>
            )}
          </div>
        </div>
      </div>

      {isAntiCaptchaVideoModalOpen && (
        <div
          className="fixed inset-0 bg-black z-[9999] flex items-center justify-center animate-zoomIn"
          onClick={() => setIsAntiCaptchaVideoModalOpen(false)}
          role="presentation"
        >
          <button
            type="button"
            onClick={() => setIsAntiCaptchaVideoModalOpen(false)}
            className="absolute top-6 right-6 z-10 p-3 bg-black/70 hover:bg-black/90 rounded-full text-white transition-colors shadow-lg"
            aria-label="Close video"
          >
            <XIcon className="w-6 h-6" />
          </button>
          <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <video
              ref={antiCaptchaVideoRef}
              src="https://veoly-ai.com/wp-content/uploads/2026/01/Video-02-Anti-Captcha-API-Key.mp4"
              controls
              autoPlay
              className="w-full h-full object-contain"
              playsInline
              onLoadedMetadata={() => {
                antiCaptchaVideoRef.current?.requestFullscreen?.().catch(() => {});
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

export default RecaptchaSettingsPanel;
