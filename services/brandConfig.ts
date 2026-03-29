/**
 * Brand configuration — single product: VEOLY-AI only.
 * Version comes from metadata.json.
 */

import appMetadata from '../metadata.json';

export type BrandName = 'veoly';

const metadataName = (appMetadata as { name: string }).name || 'VEOLY_All_In_v4_PC';
const baseElectron = metadataName.replace(/^VEOLY_/, '').replace(/^MK_/, '').replace(/^ESAIE\./, '') || 'All_In_v4_PC';
const baseWeb = baseElectron.replace(/_PC$/, '_WEB');

export const SHARED_APP_VERSION = {
  electron: baseElectron,
  web: baseWeb,
};

export interface BrandConfig {
  name: string;
  shortName: string;
  domain: string;
  colors: {
    brandStart: string;
    brandEnd: string;
    themeColor: string;
    backgroundColor: string;
    selectionColor: string;
  };
  primaryPalette: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
  logo: {
    imageUrl?: string;
    svgComponent?: boolean;
    letter: string;
  };
  meta: {
    title: string;
    description: string;
    favicon: string;
  };
  effects: {
    glow: {
      default: string;
      hover: string;
      text: string;
      box: string;
    };
    gradients: {
      light: { orange: string; yellow: string };
      dark: { orange: string; yellow: string };
    };
  };
  appVersion: {
    electron: string;
    web: string;
  };
  sessionKey: string;
  featureFlags?: {
    showVeoBlockingModal?: boolean;
    showNanobananaBlockingModal?: boolean;
    showFlowAccountDetails?: boolean;
  };
  maintenanceMode?: boolean;
}

const BRAND_CONFIGS: Record<BrandName, BrandConfig> = {
  veoly: {
    name: 'VEOLY-AI',
    shortName: 'VEOLY',
    domain: 'veoly-ai.com',
    colors: {
      brandStart: '#4A6CF7',
      brandEnd: '#A05BFF',
      themeColor: '#4A6CF7',
      backgroundColor: '#f8fafc',
      selectionColor: '#4A6CF7',
    },
    primaryPalette: {
      50: '#eff4ff',
      100: '#dce6ff',
      200: '#b8cfff',
      300: '#84adff',
      400: '#4A6CF7',
      500: '#3b5bdb',
      600: '#A05BFF',
      700: '#252f9c',
      800: '#22297d',
      900: '#111111',
    },
    logo: {
      svgComponent: true,
      letter: 'V',
    },
    meta: {
      title: 'VEOLY-AI — All-in-One AI Platform',
      description: 'Platform AI semua-dalam-satu.',
      favicon:
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%234A6CF7"/><path d="M6 24V8h5l3 7 3-7h5v16h-4V12l-4 8-4-8v12H6z" fill="white"/></svg>',
    },
    effects: {
      glow: {
        default: 'rgba(74,108,247,0.4)',
        hover: 'rgba(160,91,255,0.6)',
        text: 'rgba(74, 108, 247, 0.5)',
        box: 'rgba(160, 91, 255, 0.25)',
      },
      gradients: {
        light: {
          orange: 'rgba(74, 108, 247, 0.03)',
          yellow: 'rgba(160, 91, 255, 0.03)',
        },
        dark: {
          orange: 'rgba(74, 108, 247, 0.08)',
          yellow: 'rgba(160, 91, 255, 0.08)',
        },
      },
    },
    appVersion: {
      electron: `VEOLY.${SHARED_APP_VERSION.electron}`,
      web: `VEOLY.${SHARED_APP_VERSION.web}`,
    },
    sessionKey: 'veoly_session_api_key',
    featureFlags: {
      showVeoBlockingModal: false,
      showNanobananaBlockingModal: false,
      showFlowAccountDetails: false,
    },
    maintenanceMode: false,
  },
};

export const isMaintenanceMode = (): boolean => getBrandConfig().maintenanceMode === true;

const isElectronEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'file:' ||
    !!(window as any).electron ||
    !!(window as any).veolyElectron?.isDesktopShell ||
    !!(window as any).monoklixElectron?.isDesktopShell ||
    window.navigator.userAgent.includes('Electron')
  );
};

export const detectBrand = (): BrandName => 'veoly';

export const getBrandConfig = (): BrandConfig => BRAND_CONFIGS[detectBrand()];

export const applyBrandTheme = (config: BrandConfig) => {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  root.style.setProperty('--brand-start', config.colors.brandStart);
  root.style.setProperty('--brand-end', config.colors.brandEnd);
  root.style.setProperty('--theme-color', config.colors.themeColor);
  root.style.setProperty('--selection-color', config.colors.selectionColor);
  root.style.setProperty('--primary-600', config.primaryPalette[600]);
  root.style.setProperty('--primary-700', config.primaryPalette[700]);
  root.style.setProperty('--gradient-orange-light', config.effects.gradients.light.orange);
  root.style.setProperty('--gradient-yellow-light', config.effects.gradients.light.yellow);
  root.style.setProperty('--gradient-orange-dark', config.effects.gradients.dark.orange);
  root.style.setProperty('--gradient-yellow-dark', config.effects.gradients.dark.yellow);

  document.title = config.meta.title;

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', config.colors.themeColor);
  }

  const faviconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
  if (faviconLink) {
    faviconLink.href = config.meta.favicon;
  }
};

export const BRAND_CONFIG = getBrandConfig();

export const setElectronBrand = (brand: BrandName): void => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    console.warn('[BrandConfig] Cannot set Electron brand: window or localStorage not available');
    return;
  }
  if (brand !== 'veoly') {
    console.error(`[BrandConfig] Invalid brand: ${brand}. This build only supports 'veoly'.`);
    return;
  }
  localStorage.setItem('electron_brand', brand);
  if (isElectronEnvironment()) {
    window.location.reload();
  }
};

export const getElectronBrand = (): BrandName | null => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  const brand = localStorage.getItem('electron_brand') as BrandName | null;
  return brand === 'veoly' ? brand : null;
};
