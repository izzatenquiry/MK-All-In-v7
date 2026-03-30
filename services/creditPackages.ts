import type { OrderData } from './toyyibPayService';

export const TOYYIBPAY_FEE = 1.5;

export type TokenUltraFeature = { text: string; isNew?: boolean };

/** Creator & Business — aligned with Token Ultra settings & ToyyibPay bills (`Token Ultra {label}`). */
export const TOKEN_ULTRA_PACKAGES = [
  {
    id: 'CREATOR',
    label: 'Creator',
    price: 1.5,
    credits: 3000,
    billingPeriod: '/month',
    description: 'For solo creators, personal brands & newcomers getting started.',
    popular: true,
    features: [
      { text: '3,000 credits/month' },
      { text: 'Generate all content types' },
      { text: 'Private content' },
      { text: 'Access to Gallery (no auto-delete)' },
      { text: 'Supports up to 3 image uploads' },
      { text: 'Motion (scene-to-video)', isNew: true },
      { text: 'Voice AI support' },
      { text: 'Full access to premium features' },
    ] satisfies TokenUltraFeature[],
  },
  {
    id: 'BUSINESS',
    label: 'Business',
    price: 1.5,
    credits: 15000,
    billingPeriod: '/month',
    description: 'For SMEs, marketing teams & agencies that need higher content volume.',
    popular: false,
    features: [
      { text: '15,000 credits/month' },
      { text: 'Generate all content types' },
      { text: 'Private content' },
      { text: 'Access to Gallery (no auto-delete)' },
      { text: 'Supports up to 3 image uploads' },
      { text: 'Motion (scene-to-video)', isNew: true },
      { text: 'Priority queue for video motion' },
      { text: 'Voice AI support' },
      { text: 'Full access to premium features' },
    ] satisfies TokenUltraFeature[],
  },
] as const;

export type TokenUltraPackageId = (typeof TOKEN_ULTRA_PACKAGES)[number]['id'];

export const DEFAULT_TOKEN_ULTRA_PACKAGE_ID: TokenUltraPackageId = 'CREATOR';

export function getPackageById(id: TokenUltraPackageId) {
  return TOKEN_ULTRA_PACKAGES.find((p) => p.id === id);
}

/**
 * Credits to apply after ToyyibPay success. Prefer Creator/Business; legacy Package 1/2 still supported.
 */
export function getExpectedCreditsForProductName(productName: string | undefined): number | null {
  if (!productName) return null;
  const p = productName;
  if (p.includes('Creator')) return 3000;
  if (p.includes('Business')) return 15000;
  if (p.includes('Pakej 1') || p.includes('Package 1')) return 3000;
  if (p.includes('Pakej 2') || p.includes('Package 2')) return 15000;
  return null;
}

export function buildToyyibOrderForPackage(
  pkgId: TokenUltraPackageId,
  name: string,
  email: string,
  phone: string
): OrderData {
  const pkg = getPackageById(pkgId);
  if (!pkg) throw new Error('Invalid package');
  const totalWithFee = pkg.price + TOYYIBPAY_FEE;
  return {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    amount: totalWithFee,
    productName: `Token Ultra ${pkg.label}`,
    productDescription: `Token Ultra ${pkg.label} — RM${pkg.price.toFixed(2)} + RM${TOYYIBPAY_FEE.toFixed(2)} fee (${pkg.credits.toLocaleString('en-US')} credits)`,
  };
}
