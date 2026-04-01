import React, { useState, useEffect } from 'react';
import { XIcon, SparklesIcon } from './Icons';
import Spinner from './common/Spinner';
import { registerNewUser } from '../services/userService';
import { createToyyibPayOrder } from '../services/toyyibPayService';
import {
  TOKEN_ULTRA_PACKAGES,
  TOYYIBPAY_FEE,
  buildToyyibOrderForPackage,
  DEFAULT_TOKEN_ULTRA_PACKAGE_ID,
  getPackageById,
  type TokenUltraPackageId,
} from '../services/creditPackages';
import { notifyN8nSignup } from '../services/n8nWebhookService';
import { type User } from '../types';
import { getTranslations } from '../services/translations';

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

const RegisterModal: React.FC<RegisterModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<TokenUltraPackageId>(DEFAULT_TOKEN_ULTRA_PACKAGE_ID);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const T = getTranslations().loginPage;
  const commonT = getTranslations().common;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setFullName('');
      setEmail('');
      setPhone('');
      setSelectedPackage(DEFAULT_TOKEN_ULTRA_PACKAGE_ID);
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  const selectedPkg = TOKEN_ULTRA_PACKAGES.find((p) => p.id === selectedPackage)!;
  const totalRm = selectedPkg.price + TOYYIBPAY_FEE;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const reg = await registerNewUser({
      email,
      fullName,
      phone,
    });

    if (!reg.success) {
      setLoading(false);
      const key = reg.message as keyof typeof commonT.errors;
      setError(commonT.errors[key] || reg.message);
      return;
    }

    localStorage.setItem('toyyibpay_user_id', reg.user.id);
    sessionStorage.setItem('toyyibpay_user_id', reg.user.id);

    const pkg = getPackageById(selectedPackage);
    if (pkg) {
      void notifyN8nSignup({
        userId: reg.user.id,
        email: reg.user.email,
        fullName: fullName.trim(),
        phone: phone.trim(),
        packageId: pkg.id,
        packageLabel: pkg.label,
        credits: pkg.credits,
        amountRm: pkg.price + TOYYIBPAY_FEE,
      });
    }

    try {
      const orderData = buildToyyibOrderForPackage(selectedPackage, fullName, email, phone);
      const pay = await createToyyibPayOrder(orderData);
      if (pay.success && pay.paymentUrl) {
        const savedData =
          sessionStorage.getItem('toyyibpay_order_data') || localStorage.getItem('toyyibpay_order_data');
        if (savedData) {
          try {
            const parsed = JSON.parse(savedData) as Record<string, unknown>;
            parsed.userId = reg.user.id;
            sessionStorage.setItem('toyyibpay_order_data', JSON.stringify(parsed));
            localStorage.setItem('toyyibpay_order_data', JSON.stringify(parsed));
          } catch {
            /* ignore */
          }
        }
        window.location.href = pay.paymentUrl;
        return;
      }
      setError(pay.message || T.registerPaymentStartError);
    } catch {
      setError(T.registerPaymentStartError);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close register modal"
      />
      <div className="relative z-10 w-full max-w-4xl max-h-[min(92vh,780px)] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0b0b0b] shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-200/90 dark:border-white/10">
          <h2 id="register-modal-title" className="text-lg font-bold text-neutral-900 dark:text-white">
            Register Now
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row md:items-stretch">
          <div className="md:w-[min(44%,280px)] md:shrink-0 border-b md:border-b-0 md:border-r border-neutral-200/90 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] p-5 sm:p-6 md:py-6">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-500 mb-3">
              {T.registerChoosePackage}
            </p>
            <div className="flex flex-col gap-2">
              {TOKEN_ULTRA_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedPackage(pkg.id)}
                  disabled={loading}
                  className={`text-left rounded-xl border px-3.5 py-2.5 sm:px-4 sm:py-3 transition-all disabled:opacity-50 ${
                    selectedPackage === pkg.id
                      ? 'border-brand-start bg-brand-start/10 dark:bg-brand-start/20 ring-2 ring-brand-start/40'
                      : 'border-neutral-200 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 bg-white/80 dark:bg-neutral-900/40'
                  }`}
                >
                  <div className="flex justify-between gap-2 items-start">
                    <span className="font-semibold text-sm text-neutral-900 dark:text-white">{pkg.label}</span>
                    <span className="text-xs sm:text-sm font-bold text-brand-start whitespace-nowrap">
                      RM {pkg.price.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">
                    {pkg.description}
                  </p>
                  <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                    {T.registerPackageCredits.replace('{credits}', pkg.credits.toLocaleString())}
                  </p>
                </button>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-200/80 dark:border-white/10">
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                + RM {TOYYIBPAY_FEE.toFixed(2)} processing
              </p>
              <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mt-3">
                {T.registerPayTotal}
              </p>
              <p className="text-2xl sm:text-[1.65rem] font-bold text-neutral-900 dark:text-white tabular-nums tracking-tight mt-1">
                RM {totalRm.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col p-5 sm:p-6 md:py-6 space-y-4 min-w-0">
            {error && (
              <div className="p-3 bg-red-50/90 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
                <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-500">
                Full name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                placeholder="Your name"
                disabled={loading}
                autoComplete="name"
              />
            </div>

            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-500">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                placeholder={T.emailPlaceholder}
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-500">
                Phone
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                placeholder="+60..."
                disabled={loading}
                autoComplete="tel"
              />
            </div>

            <div className="mt-auto w-full space-y-2.5">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-brand-start to-brand-end text-white font-bold min-h-[48px] disabled:opacity-50"
              >
                {loading ? <Spinner /> : (
                  <>
                    {T.registerCreateAndContinue}
                    <SparklesIcon className="w-4 h-4 text-white/70" />
                  </>
                )}
              </button>
              <p className="text-[11px] sm:text-xs text-center text-neutral-500 dark:text-neutral-400 leading-relaxed px-0.5">
                {T.registerPaymentNote}
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterModal;
