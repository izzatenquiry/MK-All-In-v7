
import React, { useState, useEffect } from 'react';
import { LogoIcon, SparklesIcon, XIcon } from './components/Icons';
import PreLoginLanding from './components/PreLoginLanding';
import RegisterModal from './components/RegisterModal';
import { loginUser } from './services/userService';
import Spinner from './components/common/Spinner';
import { type User } from './types';
import { APP_VERSION } from './services/appConfig';
import { getTranslations } from './services/translations';
import { loadData } from './services/indexedDBService';
import { BRAND_CONFIG } from './services/brandConfig';

interface LoginPageProps {
    onLoginSuccess: (user: User) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [accessCode, setAccessCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [theme, setTheme] = useState('light'); // Default to light
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const T = getTranslations().loginPage;
    const commonT = getTranslations().common;
    const isMonoklix = BRAND_CONFIG.name === 'VEOLY-AI';

    // Load theme from localStorage
    useEffect(() => {
        const loadTheme = async () => {
            const savedTheme = await loadData<string>('theme');
            if (savedTheme) {
                setTheme(savedTheme);
            } else {
                setTheme('light'); // Default to light
            }
        };
        loadTheme();
    }, []);

    // Apply theme to document
    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [theme]);

    useEffect(() => {
        if (!isLoginModalOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsLoginModalOpen(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isLoginModalOpen]);
    
    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        // Read from form so browser autofill / password managers still submit real values (React state can stay empty).
        const form = e.currentTarget;
        const fd = new FormData(form);
        const emailRaw = String(fd.get('email') ?? '').trim();
        const accessCodeRaw = String(fd.get('accessCode') ?? '').trim();
        setEmail(emailRaw);
        setAccessCode(accessCodeRaw);

        const result = await loginUser(emailRaw, accessCodeRaw);

        if (result.success === true) {
            onLoginSuccess(result.user);
        } else {
            const errorKey = result.message as keyof typeof commonT.errors;
            setError(commonT.errors[errorKey] || result.message);
        }
        setIsLoading(false);
    };

    const backgroundGlows = (
        <>
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand-start/20 dark:bg-brand-start/20 rounded-full blur-[120px] pointer-events-none animate-pulse-slow" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-brand-end/10 dark:bg-brand-end/10 rounded-full blur-[120px] pointer-events-none animate-float" />
        </>
    );

    const loginCard = (
        <div className="w-full max-w-md relative z-10 animate-zoomIn">
            <div className="bg-white dark:bg-[#0b0b0b] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-md dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)] p-7 sm:p-8">
                <div className="text-center mb-8">
                    {!isMonoklix && (
                        <div className="inline-flex justify-center mb-6 filter drop-shadow-[0_0_15px_rgba(74,108,247,0.3)]">
                            <LogoIcon className="w-48 sm:w-56 md:w-60 max-w-full mx-auto text-neutral-900 dark:text-white" />
                        </div>
                    )}
                    {isMonoklix && (
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-2">
                            Account Access
                        </p>
                    )}
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">
                        {T.title}
                    </h1>
                     <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                        {T.subtitle}
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-3 bg-red-50/90 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-center">
                        <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
                    </div>
                )}
                
                <form className="space-y-6" onSubmit={handleLogin}>
                     <div className="space-y-2">
                        <label htmlFor="email-input" className="ml-1 text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-500">Email Address</label>
                        <input
                            id="email-input"
                            name="email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3.5 text-base font-medium text-neutral-900 placeholder-neutral-500 transition-all focus:border-brand-start/50 focus:outline-none focus:ring-2 focus:ring-brand-start/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-600"
                            placeholder={T.emailPlaceholder}
                            disabled={isLoading}
                            autoComplete="email"
                         />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="access-code-input" className="ml-1 text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-500">
                            {T.accessCodeLabel}
                        </label>
                        <input
                            id="access-code-input"
                            name="accessCode"
                            type="text"
                            required
                            value={accessCode}
                            onChange={(e) => setAccessCode(e.target.value)}
                            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3.5 text-base font-medium text-neutral-900 placeholder-neutral-500 transition-all focus:border-brand-start/50 focus:outline-none focus:ring-2 focus:ring-brand-start/40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-600"
                            placeholder={T.accessCodePlaceholder}
                            disabled={isLoading}
                            autoComplete="one-time-code"
                            spellCheck={false}
                        />
                        <p className="ml-1 text-[11px] leading-snug text-neutral-500 dark:text-neutral-500">{T.accessCodeHint}</p>
                    </div>
                   
                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center items-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-start to-brand-end text-white font-bold shadow-sm hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
                        >
                            {isLoading ? <Spinner /> : (
                                <>
                                    {T.loginButton}
                                    <SparklesIcon className="w-4 h-4 text-white/70" />
                                </>
                            )}
                        </button>
                    </div>
                </form>

                <div className="mt-8 pt-6 border-t border-neutral-200/90 dark:border-white/10 text-center">
                    <p className="text-xs text-neutral-600 dark:text-neutral-500 mb-4">{T.noAccount}</p>
                    <button
                        type="button"
                        onClick={() => setIsRegisterModalOpen(true)}
                        className="w-full py-3 px-4 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl text-sm font-semibold text-neutral-700 dark:text-neutral-200 transition-all min-h-[48px]"
                    >
                        {T.registerButton}
                    </button>
                </div>
            </div>
            
             <p className="text-center text-[10px] text-neutral-500 dark:text-neutral-600 font-mono mt-6 uppercase tracking-widest">
                System Secured • {APP_VERSION}
            </p>
        </div>
    );

    if (isMonoklix) {
        return (
            <div className="relative min-h-screen bg-neutral-50 dark:bg-[#050505] overflow-x-hidden">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {backgroundGlows}
                </div>
                <div className="relative z-10 flex flex-col min-h-screen">
                    <PreLoginLanding
                        onOpenLogin={() => setIsLoginModalOpen(true)}
                        onOpenRegister={() => setIsRegisterModalOpen(true)}
                    />
                </div>

                <RegisterModal
                    isOpen={isRegisterModalOpen}
                    onClose={() => setIsRegisterModalOpen(false)}
                    onSuccess={(user) => {
                        setIsRegisterModalOpen(false);
                        onLoginSuccess(user);
                    }}
                />

                {isLoginModalOpen && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Login modal"
                    >
                        <button
                            type="button"
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setIsLoginModalOpen(false)}
                            aria-label="Close login popup"
                        />
                        <div className="relative z-10 w-full max-w-md">
                            <button
                                type="button"
                                onClick={() => setIsLoginModalOpen(false)}
                                className="absolute -top-2 -right-2 z-20 p-2 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-200 shadow-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                                aria-label="Close login modal"
                            >
                                <XIcon className="w-4 h-4" />
                            </button>
                            {loginCard}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative flex items-center justify-center min-h-screen bg-neutral-50 dark:bg-[#050505] overflow-hidden p-4">
            {backgroundGlows}
            {loginCard}
        </div>
    );
};

export default LoginPage;
