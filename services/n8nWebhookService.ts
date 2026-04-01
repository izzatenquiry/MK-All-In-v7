/**
 * Fire-and-forget webhooks to N8n (or any automation URL).
 * Set in .env: VITE_N8N_SIGNUP_WEBHOOK_URL, VITE_N8N_PAYMENT_SUCCESS_WEBHOOK_URL
 */
import { APP_VERSION } from './appConfig';

const env = (import.meta as { env?: Record<string, string | undefined> }).env;

function getUrl(key: 'VITE_N8N_SIGNUP_WEBHOOK_URL' | 'VITE_N8N_PAYMENT_SUCCESS_WEBHOOK_URL'): string | undefined {
  const v = env?.[key];
  return v && v.trim() ? v.trim() : undefined;
}

/** New registration (before payment). No access code — user completes payment first. */
export async function notifyN8nSignup(payload: {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  packageId: string;
  packageLabel: string;
  credits: number;
  amountRm: number;
}): Promise<void> {
  const url = getUrl('VITE_N8N_SIGNUP_WEBHOOK_URL');
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'signup',
        source: 'veoly-ai',
        appVersion: APP_VERSION,
        ...payload,
      }),
    });
  } catch (e) {
    console.warn('[N8N] signup webhook failed:', e);
  }
}

/** After ToyyibPay success — includes access code for your N8n flow to email the user. */
export async function notifyN8nPaymentSuccessWithAccessCode(payload: {
  userId: string;
  email: string;
  fullName?: string | null;
  accessCode: string;
  creditsAdded: number;
  productName?: string;
}): Promise<void> {
  const url = getUrl('VITE_N8N_PAYMENT_SUCCESS_WEBHOOK_URL');
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'payment_success',
        source: 'veoly-ai',
        appVersion: APP_VERSION,
        ...payload,
      }),
    });
  } catch (e) {
    console.warn('[N8N] payment-success webhook failed:', e);
  }
}
