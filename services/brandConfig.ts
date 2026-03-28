/**
 * Brand Configuration
 * Centralized brand theming system for ESAIE.TECH and MONOKLIX.COM
 * Version is read from metadata.json (single source of truth - update version there only).
 */

import appMetadata from '../metadata.json';

export type BrandName = 'esai' | 'monoklix';

// Derive version from metadata.json (e.g. "MK_All_In_v4_PC" -> electron: "All_In_v4_PC", web: "All_In_v4_WEB")
const metadataName = (appMetadata as { name: string }).name || 'All_In_v4_PC';
const baseElectron = metadataName.replace(/^MK_/, '').replace(/^ESAIE\./, '') || 'All_In_v4_PC';
const baseWeb = baseElectron.replace(/_PC$/, '_WEB');

/**
 * SHARED APP VERSION - Sourced from metadata.json (do not edit here)
 */
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
    svgComponent?: boolean; // true if using SVG inline component
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
  /** Set to true to show maintenance page for this brand. Manual toggle here. */
  maintenanceMode?: boolean;
}

const BRAND_CONFIGS: Record<BrandName, BrandConfig> = {
  esai: {
    name: 'ESAIE',
    shortName: 'ESAIE',
    domain: 'esaie.tech',
    colors: {
      brandStart: '#F97316', // Bright Orange
      brandEnd: '#EAB308',   // Vibrant Yellow
      themeColor: '#F97316',
      backgroundColor: '#fff7ed',
      selectionColor: '#F97316',
    },
    primaryPalette: {
      50: '#fff7ed',
      100: '#ffedd5',
      200: '#fed7aa',
      300: '#fdba74',
      400: '#F97316', // Brand Orange
      500: '#ea580c',
      600: '#EAB308', // Brand Yellow (mapped as 600)
      700: '#c2410c',
      800: '#9a3412',
      900: '#7c2d12',
    },
    logo: {
      imageUrl: 'https://monoklix.com/wp-content/uploads/2025/11/ESAIE-Logo-latest.png',
      svgComponent: false,
      letter: 'E',
    },
    meta: {
      title: 'ESAIE - All-in-One AI Platform',
      description: 'Platform AI semua-dalam-satu.',
      favicon: 'https://monoklix.com/wp-content/uploads/2025/11/ESAIE-Logo-latest.png',
    },
    effects: {
      glow: {
        default: 'rgba(249,115,22,0.4)',
        hover: 'rgba(234,179,8,0.6)',
        text: 'rgba(249, 115, 22, 0.5)',
        box: 'rgba(249,115,22,0.25)',
      },
      gradients: {
        light: {
          orange: 'rgba(249, 115, 22, 0.03)',
          yellow: 'rgba(234, 179, 8, 0.03)',
        },
        dark: {
          orange: 'rgba(249, 115, 22, 0.08)',
          yellow: 'rgba(234, 179, 8, 0.08)',
        },
      },
    },
    appVersion: {
      electron: `ESAIE.${SHARED_APP_VERSION.electron}`,
      web: `ESAIE.${SHARED_APP_VERSION.web}`,
    },
    sessionKey: 'esaie_session_api_key',
    featureFlags: {
      showVeoBlockingModal: false, // Default: hidden (admin can enable by setting to true)
      showNanobananaBlockingModal: false, // Default: hidden (admin can enable by setting to true)
      showFlowAccountDetails: false, // Default: hidden (admin can enable by setting to true)
    },
    maintenanceMode: false, // Set true to enable maintenance page for ESAIE
  },
  monoklix: {
    name: 'MONOKLIX',
    shortName: 'MONOklix',
    domain: 'monoklix.com',
    colors: {
      brandStart: '#4A6CF7', // Bright Creative Blue
      brandEnd: '#A05BFF',   // Violet Purple Studio Tone
      themeColor: '#4A6CF7',
      backgroundColor: '#f8fafc',
      selectionColor: '#4A6CF7',
    },
    primaryPalette: {
      50: '#eff4ff',
      100: '#dce6ff',
      200: '#b8cfff',
      300: '#84adff',
      400: '#4A6CF7', // Brand Blue
      500: '#3b5bdb',
      600: '#A05BFF', // Brand Purple (mapped as 600)
      700: '#252f9c',
      800: '#22297d',
      900: '#111111',
    },
    logo: {
      svgComponent: true, // Uses SVG inline component
      letter: 'M',
    },
    meta: {
      title: 'MONOklix.com - All-in-One AI Platform',
      description: 'Platform AI semua-dalam-satu.',
      favicon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%234A6CF7"/><path d="M6 24V8h5l3 7 3-7h5v16h-4V12l-4 8-4-8v12H6z" fill="white"/></svg>',
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
      electron: `MK_${SHARED_APP_VERSION.electron}`,
      web: `MK_${SHARED_APP_VERSION.web}`,
    },
    sessionKey: 'monoklix_session_api_key',
    featureFlags: {
      showVeoBlockingModal: false, // Default: hidden (admin can enable by setting to true)
      showNanobananaBlockingModal: false, // Default: hidden (admin can enable by setting to true)
      showFlowAccountDetails: false, // Default: hidden (admin can enable by setting to true)
    },
    maintenanceMode: false, // Set true to enable maintenance page for MONOKLIX
  },
};

/**
 * Check if maintenance mode is enabled for current brand.
 * Toggle via maintenanceMode in the brand config above (esai or monoklix).
 */
export const isMaintenanceMode = (): boolean => getBrandConfig().maintenanceMode === true;

/**
 * Helper to check if running in Electron
 */
const isElectronEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'file:' ||
    !!(window as any).electron ||
    window.navigator.userAgent.includes('Electron')
  );
};

/**
 * Detect brand from environment variable or domain
 * For Electron: Also checks localStorage for brand config
 * Default: MONOKLIX (this is the main MONOKLIX project)
 */
export const detectBrand = (): BrandName => {
  // Priority 1: Environment variable (works in dev & build)
  // Using 'as any' because TypeScript doesn't have vite/client types in strict mode
  const envBrand = ((import.meta as any).env?.VITE_BRAND || undefined) as BrandName | undefined;

  if (envBrand && (envBrand === 'esai' || envBrand === 'monoklix')) {
    // Save to localStorage for Electron persistence
    if (isElectronEnvironment() && typeof localStorage !== 'undefined') {
      localStorage.setItem('electron_brand', envBrand);
    }
    return envBrand;
  }

  // Priority 2: Electron - Check localStorage for brand config (allows runtime switching)
  if (isElectronEnvironment() && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const electronBrand = localStorage.getItem('electron_brand') as BrandName | null;
    if (electronBrand && (electronBrand === 'esai' || electronBrand === 'monoklix')) {
      return electronBrand;
    }
  }

  // Priority 3: Auto-detect from domain (only for web, not Electron)
  if (typeof window !== 'undefined' && !isElectronEnvironment()) {
    const hostname = window.location.hostname.toLowerCase();
    
    // Check for ESAIE domains (esaie.tech, esaie.tech, or any subdomain with 'esai')
    if (hostname.includes('esai') || hostname.includes('esaie.tech') || hostname.includes('esaie')) {
      return 'esai';
    }
    
    // Check for MONOKLIX domains (monoklix.com or any subdomain like app.monoklix.com, app2.monoklix.com, dev.monoklix.com)
    if (hostname.includes('monoklix') || hostname.endsWith('.monoklix.com') || hostname === 'monoklix.com') {
      return 'monoklix';
    }
  }

  // Default fallback: MONOKLIX (this is the main MONOKLIX project folder)
  const defaultBrand: BrandName = 'monoklix';

  // Save default to localStorage for Electron if not set
  if (isElectronEnvironment() && typeof localStorage !== 'undefined' && !localStorage.getItem('electron_brand')) {
    localStorage.setItem('electron_brand', defaultBrand);
  }
  
  return defaultBrand;
};

/**
 * Get current brand configuration
 */
export const getBrandConfig = (): BrandConfig => {
  const brand = detectBrand();
  return BRAND_CONFIGS[brand];
};

/**
 * Apply brand theme to document dynamically
 */
export const applyBrandTheme = (config: BrandConfig) => {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  
  // Set CSS custom properties for colors
  root.style.setProperty('--brand-start', config.colors.brandStart);
  root.style.setProperty('--brand-end', config.colors.brandEnd);
  root.style.setProperty('--theme-color', config.colors.themeColor);
  root.style.setProperty('--selection-color', config.colors.selectionColor);
  
  // Set CSS custom properties for primary colors (for buttons)
  root.style.setProperty('--primary-600', config.primaryPalette[600]);
  root.style.setProperty('--primary-700', config.primaryPalette[700]);
  
  // Set CSS custom properties for gradients
  root.style.setProperty('--gradient-orange-light', config.effects.gradients.light.orange);
  root.style.setProperty('--gradient-yellow-light', config.effects.gradients.light.yellow);
  root.style.setProperty('--gradient-orange-dark', config.effects.gradients.dark.orange);
  root.style.setProperty('--gradient-yellow-dark', config.effects.gradients.dark.yellow);
  
  // Update meta tags
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

// Export current brand config
export const BRAND_CONFIG = getBrandConfig();

/**
 * Set brand for Electron (updates localStorage)
 * This allows runtime brand switching in Electron apps
 */
export const setElectronBrand = (brand: BrandName): void => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    console.warn('[BrandConfig] Cannot set Electron brand: window or localStorage not available');
    return;
  }
  
  if (brand !== 'esai' && brand !== 'monoklix') {
    console.error(`[BrandConfig] Invalid brand: ${brand}. Must be 'esai' or 'monoklix'`);
    return;
  }
  
  localStorage.setItem('electron_brand', brand);

  // Reload page to apply new brand (brand is detected at startup)
  if (isElectronEnvironment()) {
    window.location.reload();
  }
};

/**
 * Get current Electron brand from localStorage (without triggering detection)
 */
export const getElectronBrand = (): BrandName | null => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  
  const brand = localStorage.getItem('electron_brand') as BrandName | null;
  if (brand === 'esai' || brand === 'monoklix') {
    return brand;
  }
  
  return null;
};

