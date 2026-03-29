import React, { useEffect, useState, useRef } from 'react';
import { handlePaymentReturn, getOrderData, clearOrderData } from '../../../services/toyyibPayService';
import { registerTokenUltra, applyCreditPackage, getUserProfile } from '../../../services/userService';
import { supabase } from '../../../services/supabaseClient';
import { CheckCircleIcon, AlertTriangleIcon } from '../../Icons';
import Spinner from '../../common/Spinner';

/**
 * After ToyyibPay redirect, Supabase often loads the JWT asynchronously (`INITIAL_SESSION`).
 * Polling `getSession()` alone can miss that; we combine `onAuthStateChange`, `getUser()`, and a long backup poll.
 * RPC `apply_credit_package` requires `auth.uid()` to match `p_user_id`.
 */
const SESSION_WAIT_MS = 60_000;
const SESSION_POLL_MS = 400;

type AuthWaitResult = { ok: true } | { ok: false; reason: 'no_session' | 'wrong_account' };
type AuthWaitOutcome = AuthWaitResult | { cancelled: true };

async function trySessionMatch(expectedUserId: string): Promise<'match' | 'wrong' | 'none'> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let uid = session?.user?.id ?? null;
  if (uid === expectedUserId) return 'match';
  if (uid !== null && uid !== expectedUserId) return 'wrong';

  const { data: userData, error } = await supabase.auth.getUser();
  if (error) {
    return 'none';
  }
  uid = userData.user?.id ?? null;
  if (uid === expectedUserId) return 'match';
  if (uid !== null && uid !== expectedUserId) return 'wrong';
  return 'none';
}

async function waitUntilSupabaseUserMatches(
  expectedUserId: string,
  getCurrentUserId?: () => string | null | undefined,
  isCancelled?: () => boolean
): Promise<AuthWaitOutcome> {
  const quickHint = getCurrentUserId?.() ?? null;
  if (quickHint && quickHint === expectedUserId) {
    const quick = await trySessionMatch(expectedUserId);
    if (isCancelled?.()) return { cancelled: true };
    if (quick === 'match') {
      await supabase.auth.getUser().catch(() => undefined);
      return { ok: true };
    }
    if (quick === 'wrong') return { ok: false, reason: 'wrong_account' };
  }

  return new Promise((resolve) => {
    let settled = false;
    let pollId: ReturnType<typeof setInterval> | undefined;
    let authSub: { unsubscribe: () => void } | null = null;

    const finish = (r: AuthWaitOutcome) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (pollId !== undefined) window.clearInterval(pollId);
      authSub?.unsubscribe();
      resolve(r);
    };

    const timeoutId = window.setTimeout(() => {
      if (isCancelled?.()) {
        finish({ cancelled: true });
        return;
      }
      finish({ ok: false, reason: 'no_session' });
    }, SESSION_WAIT_MS);

    const { data: subData } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (settled || isCancelled?.()) return;
        const uid = session?.user?.id ?? null;
        if (uid === expectedUserId) {
          await supabase.auth.getUser().catch(() => undefined);
          finish({ ok: true });
          return;
        }
        if (uid !== null && uid !== expectedUserId) {
          finish({ ok: false, reason: 'wrong_account' });
        }
      })();
    });
    authSub = subData.subscription;

    pollId = window.setInterval(() => {
      void (async () => {
        if (settled || isCancelled?.()) return;
        const hint = getCurrentUserId?.() ?? null;
        if (hint && hint === expectedUserId) {
          const m = await trySessionMatch(expectedUserId);
          if (isCancelled?.()) {
            finish({ cancelled: true });
            return;
          }
          if (m === 'match') {
            await supabase.auth.getUser().catch(() => undefined);
            finish({ ok: true });
            return;
          }
          if (m === 'wrong') {
            finish({ ok: false, reason: 'wrong_account' });
          }
        }
        const m = await trySessionMatch(expectedUserId);
        if (isCancelled?.()) {
          finish({ cancelled: true });
          return;
        }
        if (m === 'match') {
          await supabase.auth.getUser().catch(() => undefined);
          finish({ ok: true });
        } else if (m === 'wrong') {
          finish({ ok: false, reason: 'wrong_account' });
        }
      })();
    }, SESSION_POLL_MS);

    void (async () => {
      await supabase.auth.refreshSession().catch(() => undefined);
      if (settled || isCancelled?.()) return;
      const m = await trySessionMatch(expectedUserId);
      if (isCancelled?.()) {
        finish({ cancelled: true });
        return;
      }
      if (m === 'match') {
        await supabase.auth.getUser().catch(() => undefined);
        finish({ ok: true });
      } else if (m === 'wrong') {
        finish({ ok: false, reason: 'wrong_account' });
      }
    })();
  });
}

interface PaymentReturnHandlerProps {
  currentUser: any;
  onUserUpdate?: (user: any) => void;
  onNavigateToSettings?: () => void;
}

const PaymentReturnHandler: React.FC<PaymentReturnHandlerProps> = ({ 
  currentUser, 
  onUserUpdate,
  onNavigateToSettings 
}) => {
  const [status, setStatus] = useState<'checking' | 'success' | 'failed' | 'pending'>('checking');
  const [message, setMessage] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState(false);
  /** Set when flow ends successfully or with a non-retryable error (session wait uses cancel + re-run instead). */
  const flowTerminalRef = useRef(false);
  /** Fresh id on every render so session wait sees App user as soon as it loads. */
  const currentUserIdRef = useRef<string | undefined>(undefined);
  currentUserIdRef.current = currentUser?.id;

  useEffect(() => {
    if (flowTerminalRef.current) {
      return;
    }

    const cancelledRef = { current: false };

    const processPaymentReturn = async () => {
      console.log('[PaymentReturn] Processing payment return...');
      console.log('[PaymentReturn] URL:', window.location.href);
      console.log('[PaymentReturn] Query params:', window.location.search);
      
      // Get payment return data from URL
      const paymentData = handlePaymentReturn();
      console.log('[PaymentReturn] Payment data:', paymentData);
      
      if (!paymentData) {
        console.warn('[PaymentReturn] No payment data found - not a payment return page');
        // Not a payment return page, redirect to base URL
        window.location.href = window.location.origin;
        return;
      }

      // Get saved order data
      const orderData = getOrderData();
      console.log('[PaymentReturn] Order data:', orderData);
      
      // Get user ID from order data, localStorage, sessionStorage, or currentUser
      // ✅ Don't fail if orderData is null - we can still get userId from other sources
      const userId = orderData?.userId 
        || localStorage.getItem('toyyibpay_user_id') 
        || sessionStorage.getItem('toyyibpay_user_id') 
        || currentUser?.id;
      
      console.log('[PaymentReturn] User ID:', userId);
      
      if (!userId) {
        console.error('[PaymentReturn] User ID not found');
        flowTerminalRef.current = true;
        setStatus('failed');
        setMessage('User information not found. Please contact support.');
        return;
      }

      // ✅ If orderData is null but we have userId and payment is success, 
      // it might be a return visit after successful registration
      if (!orderData && paymentData.status === '1') {
        console.warn('[PaymentReturn] Order data not found but payment is success - might be return visit after successful registration');
        flowTerminalRef.current = true;
        setStatus('success');
        setMessage('Payment was successful and has been processed previously.');
        return;
      }

      // If orderData is null and payment is not success, fail
      if (!orderData) {
        console.error('[PaymentReturn] Order data not found in sessionStorage');
        flowTerminalRef.current = true;
        setStatus('failed');
        setMessage('Order data not found. Please contact support.');
        return;
      }

      // Critical validation to prevent URL tampering or stale callbacks
      if (paymentData.billcode && orderData.billCode && paymentData.billcode !== orderData.billCode) {
        console.error('[PaymentReturn] Bill code mismatch', { callback: paymentData.billcode, expected: orderData.billCode });
        flowTerminalRef.current = true;
        setStatus('failed');
        setMessage('Payment validation failed (bill code mismatch). Please contact support.');
        return;
      }

      // Match saved billExternalReferenceNo to ToyyibPay return `order_id` (not transaction_id).
      if (
        paymentData.order_id &&
        orderData.referenceNo &&
        paymentData.order_id !== orderData.referenceNo
      ) {
        console.error('[PaymentReturn] Order reference mismatch', {
          callback: paymentData.order_id,
          expected: orderData.referenceNo,
        });
        flowTerminalRef.current = true;
        setStatus('failed');
        setMessage('Payment validation failed (order reference mismatch). Please contact support.');
        return;
      }
      if (paymentData.refno && orderData.referenceNo && paymentData.refno !== orderData.referenceNo) {
        console.error('[PaymentReturn] Refno mismatch', { callback: paymentData.refno, expected: orderData.referenceNo });
        flowTerminalRef.current = true;
        setStatus('failed');
        setMessage('Payment validation failed (reference mismatch). Please contact support.');
        return;
      }

      // Check payment status
      // status: '1' = success, '2' = failed, '3' = pending
      console.log('[PaymentReturn] Payment status:', paymentData.status);
      
      if (paymentData.status === '1') {
        // ✅ Payment successful - DON'T set success yet, wait for registration
        setStatus('checking'); // Keep as checking until registration complete
        setMessage('Confirming your login session...');

        const authWait = await waitUntilSupabaseUserMatches(
          userId,
          () => currentUserIdRef.current ?? undefined,
          () => cancelledRef.current
        );
        if ('cancelled' in authWait && authWait.cancelled) {
          return;
        }
        if (!authWait.ok) {
          flowTerminalRef.current = true;
          setStatus('failed');
          setMessage(
            authWait.reason === 'wrong_account'
              ? 'You are signed in as a different account than the one used for this payment. Log out, sign in with the correct account, then open the payment return link again.'
              : 'Your session was not ready after returning from payment. Please log in with the account you used to pay, then reload this page (or open the return link from your email again).'
          );
          return;
        }

        // Prevent a second effect (e.g. when currentUser hydrates) from running registration twice.
        flowTerminalRef.current = true;

        setMessage('Payment successful! Registering your account...');

        setIsRegistering(true);
        try {
          console.log('[PaymentReturn] Calling registerTokenUltra for user:', userId);
          // Call registerTokenUltra (no telegramId needed)
          const result = await registerTokenUltra(userId);
          console.log('[PaymentReturn] Registration result:', result);

          if (result.success) {
            let creditApplyFailed = false;
            console.log('[PaymentReturn] Registration successful!');
            // Final credit package safety check: registration success alone is not enough
            const productName: string | undefined = orderData?.productName;
            const isPackage1 =
              productName?.includes('Pakej 1') ||
              productName?.includes('Package 1');
            const isPackage2 =
              productName?.includes('Pakej 2') ||
              productName?.includes('Package 2');
            if (isPackage1 || isPackage2) {
              const expectedCredits = isPackage1 ? 3000 : 15000;
              const creditResult = await applyCreditPackage(userId, expectedCredits);
              if (!creditResult.success) {
                creditApplyFailed = true;
                flowTerminalRef.current = true;
                setStatus('failed');
                const detail =
                  creditResult.message && creditResult.message.trim().length > 0
                    ? ` ${creditResult.message}`
                    : '';
                setMessage(
                  `Payment successful but failed to apply ${expectedCredits.toLocaleString()} credits.${detail} Please contact support if this persists.`
                );
              }
            }

            if (creditApplyFailed) {
              return;
            }

            // ✅ NOW set success after registration + credit assignment complete
            setStatus('success');
            setMessage('Payment successful! Your Token Ultra registration and credits are complete.');
            
            // ✅ Clear order data AFTER successful registration
            clearOrderData();
            localStorage.removeItem('toyyibpay_user_id');
            sessionStorage.removeItem('toyyibpay_user_id');
            
            // Update user profile with fresh credit balance if callback provided
            if (onUserUpdate) {
              const freshUser = await getUserProfile(userId);
              if (freshUser) {
                onUserUpdate(freshUser);
              } else if (result.user) {
                onUserUpdate(result.user);
              }
            }
            
            // Invalidate cache
            sessionStorage.removeItem(`token_ultra_active_${userId}`);
            sessionStorage.removeItem(`token_ultra_active_timestamp_${userId}`);
            
            // Redirect to base URL (root domain) after 3 seconds
            setTimeout(() => {
              // Reload to base URL without query parameters
              window.location.href = window.location.origin;
            }, 3000);
          } else {
            console.error('[PaymentReturn] Registration failed:', result.message);
            flowTerminalRef.current = true;
            setStatus('failed');
            setMessage(`Payment successful but registration failed: ${result.message}. Please contact support.`);
          }
        } catch (error) {
          console.error('[PaymentReturn] Registration error:', error);
          flowTerminalRef.current = true;
          setStatus('failed');
          setMessage(`Payment successful but registration failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please contact support.`);
        } finally {
          setIsRegistering(false);
        }
      } else if (paymentData.status === '2') {
        flowTerminalRef.current = true;
        setStatus('failed');
        setMessage('Payment failed. Please try again.');
      } else if (paymentData.status === '3') {
        flowTerminalRef.current = true;
        setStatus('pending');
        setMessage('Payment is pending. Please wait for confirmation.');
      }
    };

    void processPaymentReturn();

    return () => {
      cancelledRef.current = true;
    };
  }, [currentUser?.id]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-50 dark:bg-neutral-900">
      <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-lg p-8 max-w-md w-full">
        {status === 'checking' && (
          <div className="text-center">
            <Spinner />
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">Processing payment...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
              Payment Successful!
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">{message}</p>
            {isRegistering && (
              <div className="flex items-center justify-center gap-2">
                <Spinner />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Registering...</span>
              </div>
            )}
            {!isRegistering && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-4">
                Redirecting...
              </p>
            )}
          </div>
        )}

        {status === 'failed' && (
          <div className="text-center">
            <AlertTriangleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
              Payment Failed
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">{message}</p>
            <button
              onClick={() => {
                // Reload to base URL without query parameters
                window.location.href = window.location.origin;
              }}
              className="w-full bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Back to Home
            </button>
          </div>
        )}

        {status === 'pending' && (
          <div className="text-center">
            <Spinner />
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2 mt-4">
              Payment Pending
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">{message}</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Please wait for payment confirmation. You will be notified once payment is confirmed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentReturnHandler;
