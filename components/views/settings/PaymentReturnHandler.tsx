import React, { useEffect, useState, useRef } from 'react';
import { handlePaymentReturn, getOrderData, clearOrderData } from '../../../services/toyyibPayService';
import { registerTokenUltra, applyCreditPackage, getUserProfile } from '../../../services/userService';
import { supabase } from '../../../services/supabaseClient';
import { CheckCircleIcon, AlertTriangleIcon } from '../../Icons';
import Spinner from '../../common/Spinner';

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
  const flowTerminalRef = useRef(false);

  useEffect(() => {
    if (flowTerminalRef.current) {
      return;
    }

    const processPaymentReturn = async () => {
      console.log('[PaymentReturn] Processing payment return...');
      console.log('[PaymentReturn] URL:', window.location.href);
      console.log('[PaymentReturn] Query params:', window.location.search);
      
      const paymentData = handlePaymentReturn();
      console.log('[PaymentReturn] Payment data:', paymentData);
      
      if (!paymentData) {
        console.warn('[PaymentReturn] No payment data found - not a payment return page');
        window.location.href = window.location.origin;
        return;
      }

      const orderData = getOrderData();
      console.log('[PaymentReturn] Order data:', orderData);
      
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

      if (!orderData && paymentData.status === '1') {
        console.warn('[PaymentReturn] Order data not found but payment is success - might be return visit after successful registration');
        flowTerminalRef.current = true;
        setStatus('success');
        setMessage('Payment was successful and has been processed previously.');
        return;
      }

      if (!orderData) {
        console.error('[PaymentReturn] Order data not found in sessionStorage');
        flowTerminalRef.current = true;
        setStatus('failed');
        setMessage('Order data not found. Please contact support.');
        return;
      }

      if (paymentData.billcode && orderData.billCode && paymentData.billcode !== orderData.billCode) {
        console.error('[PaymentReturn] Bill code mismatch', { callback: paymentData.billcode, expected: orderData.billCode });
        flowTerminalRef.current = true;
        setStatus('failed');
        setMessage('Payment validation failed (bill code mismatch). Please contact support.');
        return;
      }

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

      console.log('[PaymentReturn] Payment status:', paymentData.status);
      
      if (paymentData.status === '1') {
        setStatus('checking');
        setMessage('Applying your payment...');

        // One cheap read — never call refreshSession() here (it can hang indefinitely on bad network).
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const sid = session?.user?.id;
        if (sid && sid !== userId) {
          flowTerminalRef.current = true;
          setStatus('failed');
          setMessage(
            'You are signed in as a different account than the one used for this payment. Log out, sign in with the correct account, then open the payment return link again.'
          );
          return;
        }

        console.log('[PaymentReturn] Validated return URL + order; proceeding (session:', sid ? 'payer' : 'none', ')');

        flowTerminalRef.current = true;

        setMessage('Payment successful! Updating your account...');

        setIsRegistering(true);
        try {
          console.log('[PaymentReturn] Calling registerTokenUltra for user:', userId);
          const result = await registerTokenUltra(userId);
          console.log('[PaymentReturn] Registration result:', result);

          if (result.success) {
            let creditApplyFailed = false;
            console.log('[PaymentReturn] Registration successful!');
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

            setStatus('success');
            setMessage('Payment successful! Your Token Ultra registration and credits are complete.');
            
            clearOrderData();
            localStorage.removeItem('toyyibpay_user_id');
            sessionStorage.removeItem('toyyibpay_user_id');
            
            if (onUserUpdate) {
              const freshUser = await getUserProfile(userId);
              if (freshUser) {
                onUserUpdate(freshUser);
              } else if (result.user) {
                onUserUpdate(result.user);
              }
            }
            
            sessionStorage.removeItem(`token_ultra_active_${userId}`);
            sessionStorage.removeItem(`token_ultra_active_timestamp_${userId}`);
            
            setTimeout(() => {
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
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-50 dark:bg-neutral-900">
      <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-lg p-8 max-w-md w-full">
        {status === 'checking' && (
          <div className="text-center">
            <Spinner />
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">
              {message || 'Processing payment...'}
            </p>
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
