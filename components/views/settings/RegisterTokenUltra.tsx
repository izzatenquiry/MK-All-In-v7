
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { type User, type TokenUltraRegistration } from '../../../types';
import { registerTokenUltra, saveUserRecaptchaToken, getTokenUltraRegistration, hasActiveTokenUltra } from '../../../services/userService';
import { createToyyibPayOrder, type OrderData } from '../../../services/toyyibPayService';
import {
  TOKEN_ULTRA_PACKAGES,
  TOYYIBPAY_FEE,
  type TokenUltraPackageId,
} from '../../../services/creditPackages';
import { CheckCircleIcon, AlertTriangleIcon, TelegramIcon, XIcon, ClockIcon, KeyIcon, SparklesIcon, InformationCircleIcon } from '../../Icons';
import Spinner from '../../common/Spinner';

interface RegisterTokenUltraProps {
  currentUser: User;
  onUserUpdate?: (user: User) => void;
}

const RegisterTokenUltra: React.FC<RegisterTokenUltraProps> = ({ currentUser, onUserUpdate }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<TokenUltraPackageId>('CREATOR');
  
  // Order form state - Get phone from currentUser
  const [orderFormData, setOrderFormData] = useState<OrderData>(() => {
    const pkg1 = TOKEN_ULTRA_PACKAGES[0];
    return {
      name: currentUser.fullName || currentUser.username || '',
      email: currentUser.email || '',
      phone: currentUser.phone || '',
      amount: pkg1.price + TOYYIBPAY_FEE,
      productName: `Token Ultra ${pkg1.label}`,
      productDescription: `Token Ultra ${pkg1.label} — RM${pkg1.price.toFixed(2)} + RM${TOYYIBPAY_FEE.toFixed(2)} fee (${pkg1.credits.toLocaleString('en-US')} credits)`,
    };
  });
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage(null);

    try {
      // Call registerTokenUltra (no telegramId needed)
      const result = await registerTokenUltra(currentUser.id);

      if (result.success) {
        setSubmitStatus('success');
        if (onUserUpdate) {
          onUserUpdate(result.user);
        }
        // Invalidate cache
        sessionStorage.removeItem(`token_ultra_active_${currentUser.id}`);
        sessionStorage.removeItem(`token_ultra_active_timestamp_${currentUser.id}`);
        
        // Force refresh token ultra status cache
        await hasActiveTokenUltra(currentUser.id, true);
        // Show Telegram share modal
        setShowTelegramModal(true);
      } else {
        setSubmitStatus('error');
        // FIX: Cast to any to access 'message' property on union type where narrowing might fail.
        setErrorMessage((result as any).message || 'Failed to register. Please try again.');
      }
    } catch (error) {
      setSubmitStatus('error');
      setErrorMessage('An unexpected error occurred. Please try again.');
      console.error('Registration error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler for order form
  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingOrder(true);
    setOrderError(null);

    try {
      const result = await createToyyibPayOrder(orderFormData);

      if (result.success && result.paymentUrl) {
        // Save user ID to both localStorage and sessionStorage for payment return handler
        // localStorage persists across tabs/windows, sessionStorage is tab-specific
        localStorage.setItem('toyyibpay_user_id', currentUser.id);
        sessionStorage.setItem('toyyibpay_user_id', currentUser.id);
        // Also update saved order data with userId
        // Check both sessionStorage and localStorage
        const savedData = sessionStorage.getItem('toyyibpay_order_data') || localStorage.getItem('toyyibpay_order_data');
        if (savedData) {
          try {
            const orderData = JSON.parse(savedData);
            orderData.userId = currentUser.id;
            // Save to both sessionStorage and localStorage
            sessionStorage.setItem('toyyibpay_order_data', JSON.stringify(orderData));
            localStorage.setItem('toyyibpay_order_data', JSON.stringify(orderData));
            console.log('[RegisterTokenUltra] Saved order data with userId:', currentUser.id);
          } catch (e) {
            console.error('Failed to update order data with userId:', e);
          }
        }
        console.log('[RegisterTokenUltra] Redirecting to payment URL:', result.paymentUrl);
        // Redirect to payment page
        window.location.href = result.paymentUrl;
      } else {
        setOrderError(result.message || 'Failed to create order. Please try again.');
      }
    } catch (err) {
      setOrderError('Network error. Please check your connection and try again.');
      console.error('Order creation error:', err);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Update orderFormData when currentUser changes (especially phone)
  useEffect(() => {
    setOrderFormData(prev => ({
      ...prev,
      name: currentUser.fullName || currentUser.username || '',
      email: currentUser.email || '',
      phone: currentUser.phone || '',
      // Keep existing amount value, don't reset it
    }));
  }, [currentUser]);

  // Helper: select a predefined package
  const handleSelectPackage = (pkgId: TokenUltraPackageId) => {
    const pkg = TOKEN_ULTRA_PACKAGES.find(p => p.id === pkgId);
    if (!pkg) return;
    setSelectedPackage(pkgId);
    const totalWithFee = pkg.price + TOYYIBPAY_FEE;
    setOrderFormData(prev => ({
      ...prev,
      amount: totalWithFee,
      productName: `Token Ultra ${pkg.label}`,
      productDescription: `Token Ultra ${pkg.label} — RM${pkg.price.toFixed(2)} + RM${TOYYIBPAY_FEE.toFixed(2)} fee (${pkg.credits.toLocaleString('en-US')} credits)`,
    }));
  };

  useEffect(() => {
    if (!showPaymentModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPaymentModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPaymentModal]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-primary-100 p-2 dark:bg-primary-900/30">
              <KeyIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Token Ultra Credit</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Choose a package, review the payment amount, then open the payment form to continue to ToyyibPay.
              </p>
            </div>
          </div>

          {/* Notice: FLOW accounts (limited availability) — inside card, above package selection */}
          <div
            role="alert"
            className="mb-6 flex gap-3 sm:gap-4 rounded-xl border border-amber-300/90 dark:border-amber-600/50 bg-gradient-to-r from-amber-50 to-amber-100/80 dark:from-amber-950/50 dark:to-amber-900/30 px-4 py-3.5 sm:px-5 sm:py-4 shadow-sm"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
              <AlertTriangleIcon className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
                NOTICE — TOKEN ULTRA CREDIT
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 sm:pl-5 text-[11px] sm:text-xs leading-relaxed text-amber-950/90 dark:text-amber-100/90 marker:text-amber-700 dark:marker:text-amber-300">
                <li>Due to high demand, we provide FLOW accounts to make access easier for you.</li>
                <li>
                  FLOW accounts are <span className="font-semibold">limited in availability</span>.
                </li>
                <li>
                  <span className="font-semibold">ZERO PROFIT</span> — offered only to help users who need access.
                </li>
              </ul>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/40">
            <h3 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Choose a credit package
            </h3>
            <p className="mb-3 text-[11px] text-neutral-600 sm:text-xs dark:text-neutral-400">
              Each video generation uses <span className="font-semibold text-primary-600 dark:text-primary-300">20 credits</span>.
              Packages are valid for <span className="font-semibold">26 days</span> from the purchase date.
            </p>
            <div className="grid grid-cols-1 gap-4">
              {TOKEN_ULTRA_PACKAGES.map(pkg => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => handleSelectPackage(pkg.id)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-all ${
                    selectedPackage === pkg.id
                      ? 'border-primary-500 bg-primary-50 shadow-sm dark:bg-primary-900/30'
                      : 'border-neutral-200 hover:border-primary-400 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900/40'
                  }`}
                >
                  <div className="mb-2">
                    <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-200">
                      {pkg.label}
                    </span>
                    <span className="block text-lg font-bold text-primary-600 dark:text-primary-300">
                      RM{pkg.price.toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
                      {pkg.credits.toLocaleString('en-US')} credits
                    </p>
                    <p className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
                      Valid 26 days
                    </p>
                    <p className="text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
                      {pkg.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/40">
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-neutral-800 sm:text-lg dark:text-neutral-200">
              <SparklesIcon className="h-5 w-5 text-primary-500" />
              Payment Information
            </h3>

            <div className="rounded-lg border-[0.5px] border-blue-200 bg-blue-50 p-3 sm:p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <div className="flex items-start gap-2 sm:gap-3">
                <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 sm:h-5 sm:w-5 dark:text-blue-400" />
                <div className="text-[11px] text-blue-800 sm:text-xs dark:text-blue-200">
                  <p className="mb-1 text-[11px] font-semibold sm:text-xs">
                    Payment Amount: RM{orderFormData.amount.toFixed(2)}
                  </p>
                  <p className="text-[11px] sm:text-xs">
                    Click the button below to open the payment form and continue to ToyyibPay.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setOrderError(null);
                setShowPaymentModal(true);
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600"
            >
              Proceed to Payment
            </button>
          </div>
        </div>
      </div>

      {showPaymentModal &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-zoomIn"
            aria-modal="true"
            role="dialog"
            aria-labelledby="token-ultra-payment-title"
            onClick={() => setShowPaymentModal(false)}
          >
            <div
              className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 w-full max-w-md max-h-[min(90vh,720px)] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start gap-3 mb-4">
                <h3 id="token-ultra-payment-title" className="text-lg font-bold text-neutral-800 dark:text-neutral-200">
                  Payment details
                </h3>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
                  aria-label="Close"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleOrderSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={orderFormData.name}
                    disabled
                    readOnly
                    className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={orderFormData.email}
                    disabled
                    readOnly
                    className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={orderFormData.phone}
                    disabled
                    readOnly
                    className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Amount (RM)
                  </label>
                  <input
                    type="number"
                    name="amount"
                    value={orderFormData.amount}
                    disabled
                    readOnly
                    className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                  />
                  <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 italic">
                    Auto-set by selected package. Includes RM1.50 ToyyibPay processing fee.
                  </p>
                </div>
                {orderError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800 dark:text-red-200">{orderError}</p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isCreatingOrder}
                  className="w-full flex items-center justify-center gap-2 bg-purple-600 dark:bg-purple-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingOrder ? (
                    <>
                      <Spinner />
                      <span>Creating Order...</span>
                    </>
                  ) : (
                    <span>Proceed to Payment</span>
                  )}
                </button>
                <div className="p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border-[0.5px] border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <InformationCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] sm:text-xs text-yellow-800 dark:text-yellow-200">
                      <p className="text-[11px] sm:text-xs font-semibold mb-1">Secure Payment via ToyyibPay</p>
                      <p className="text-[11px] sm:text-xs">
                        After clicking &quot;Proceed to Payment&quot;, you will be redirected to ToyyibPay to complete your payment.
                        Once payment is successful, your Token Ultra registration will be activated automatically.
                      </p>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Telegram Share Modal */}
      {showTelegramModal && (
        <TelegramShareModal
          userName={currentUser.fullName || currentUser.username}
          userEmail={currentUser.email}
          userId={currentUser.id}
          onClose={() => setShowTelegramModal(false)}
          onUserUpdate={onUserUpdate}
        />
      )}
    </div>
  );
};

// Telegram Share Modal Component
interface TelegramShareModalProps {
  userName: string;
  userEmail: string;
  userId: string;
  onClose: () => void;
  onUserUpdate?: (user: User) => void;
}

const TelegramShareModal: React.FC<TelegramShareModalProps> = ({
  userName,
  userEmail,
  userId,
  onClose,
  onUserUpdate,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);

  const message = `Token Ultra Registration

Name: ${userName}
Email: ${userEmail}

Please find payment proof attached.`;

  const telegramUrl = `https://t.me/veoly_support?text=${encodeURIComponent(message)}`;

  const handleClose = () => {
    // Set message in sessionStorage before reload
    sessionStorage.setItem(
      'token_ultra_ready_message',
      'Your TOKEN ULTRA AI account is ready. Log in to generate your token.'
    );
    // Reload page
    window.location.reload();
  };

  const handleOpenTelegram = async () => {
    // Update reCAPTCHA token with default API key
    setIsUpdating(true);
    try {
      const defaultApiKey = '414f452fca8c16dedc687934823c7e97';
      const result = await saveUserRecaptchaToken(userId, defaultApiKey);
      
      if (result.success && onUserUpdate) {
        onUserUpdate(result.user);
      }
    } catch (error) {
      console.error('Failed to update recaptcha token:', error);
      // Continue anyway, don't block user from opening Telegram
    } finally {
      setIsUpdating(false);
    }

    // Open Telegram
    window.open(telegramUrl, '_blank', 'noopener,noreferrer');
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-zoomIn"
      aria-modal="true"
      role="dialog"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border-[0.5px] border-neutral-200/80 dark:border-neutral-800/80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <TelegramIcon className="w-6 h-6 text-blue-500" />
            Share to Telegram
          </h3>
          <button
            onClick={handleClose}
            className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Share your registration details to <strong>@veoly_support</strong> via Telegram. The message is pre-filled with your information.
          </p>

          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4 border-[0.5px] border-neutral-200/80 dark:border-neutral-700/80">
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
              Message Preview:
            </p>
            <div className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap font-mono bg-white dark:bg-neutral-900 p-3 rounded border-[0.5px] border-neutral-200/80 dark:border-neutral-700/80">
              {message}
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border-[0.5px] border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>Important:</strong> Please attach your payment proof image (barcode/receipt screenshot) when sending the message in Telegram.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleClose}
              className="flex-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-2.5 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleOpenTelegram}
              disabled={isUpdating}
              className="flex-1 bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdating ? (
                <>
                  <Spinner />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <TelegramIcon className="w-4 h-4" />
                  Open Telegram
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RegisterTokenUltra;
