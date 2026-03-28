import { supabase } from './supabaseClient';

export interface CookieUsageStat {
  filename: string;
  path: string;
  status: 'good' | 'warning' | 'expired' | 'missing';
  age_days: number | string;
  cookies_count: number;
  valid: boolean;
  is_pool_cookie: boolean;
  usage_count: number;
  last_used: string | null;
  first_used: string | null;
  flow_account: string | null;
  total_tokens_generated: number;
}

export interface CookieStatistics {
  all_cookies: CookieUsageStat[];
  overall_stats: {
    total_cookies: number;
    total_usage: number;
    average_usage: number;
  };
}

/**
 * Get cookie usage statistics from Supabase
 * Note: This aggregates data from cookie_usage_stats table
 * Cookie file metadata (status, age, etc.) still needs to come from backend /api/cookies
 */
export const getCookieUsageStatistics = async (): Promise<CookieStatistics | null> => {
  try {
    // Query cookie_usage_stats table
    const { data, error } = await supabase
      .from('cookie_usage_stats')
      .select('*')
      .order('usage_count', { ascending: false });

    if (error) {
      console.error('Error fetching cookie usage statistics from Supabase:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return {
        all_cookies: [],
        overall_stats: {
          total_cookies: 0,
          total_usage: 0,
          average_usage: 0,
        },
      };
    }

    // Transform Supabase data to match expected format
    // Note: Some fields like status, age_days, cookies_count, valid, path, is_pool_cookie need to come from backend
    // For now, we'll set defaults and these should be merged with backend cookie data
    const all_cookies: CookieUsageStat[] = data.map((stat) => ({
      filename: stat.cookie_filename || '',
      path: '', // Will be merged from backend cookie data
      status: 'good' as const, // Default, should be merged with backend data
      age_days: 0, // Default, should be merged with backend data
      cookies_count: 0, // Default, should be merged with backend data
      valid: true, // Default, should be merged with backend data
      is_pool_cookie: false, // Default, should be merged with backend data (pool cookies are in G/E folders)
      usage_count: stat.usage_count || 0,
      last_used: stat.last_used || null,
      first_used: stat.first_used || null,
      flow_account: stat.flow_account_code || null,
      total_tokens_generated: stat.total_tokens_generated || stat.usage_count || 0,
    }));

    // Calculate overall stats
    const total_cookies = all_cookies.length;
    const total_usage = all_cookies.reduce((sum, cookie) => sum + cookie.usage_count, 0);
    const average_usage = total_cookies > 0 ? total_usage / total_cookies : 0;

    return {
      all_cookies,
      overall_stats: {
        total_cookies,
        total_usage,
        average_usage,
      },
    };
  } catch (error) {
    console.error('Error in getCookieUsageStatistics:', error);
    return null;
  }
};

/**
 * Merge cookie usage stats from Supabase with cookie file metadata from backend
 * This combines Supabase usage data with backend file system data
 */
export const mergeCookieStatsWithBackendData = (
  supabaseStats: CookieStatistics | null,
  backendCookies: Record<string, any[]>
): CookieStatistics | null => {
  if (!supabaseStats) {
    return null;
  }

  // Flatten backend cookies by folder
  const backendCookiesMap = new Map<string, any>();
  Object.values(backendCookies).flat().forEach((cookie) => {
    if (cookie.filename) {
      backendCookiesMap.set(cookie.filename, cookie);
    }
  });

  // Merge Supabase stats with backend metadata
  const mergedCookies: CookieUsageStat[] = supabaseStats.all_cookies.map((supabaseCookie) => {
    const backendCookie = backendCookiesMap.get(supabaseCookie.filename);
    
    if (backendCookie) {
      // Merge backend metadata with Supabase usage data
      return {
        ...supabaseCookie,
        status: backendCookie.status || supabaseCookie.status,
        age_days: backendCookie.age_days ?? supabaseCookie.age_days,
        cookies_count: backendCookie.cookies_count ?? supabaseCookie.cookies_count,
        valid: backendCookie.valid ?? supabaseCookie.valid,
        path: backendCookie.path || supabaseCookie.path,
      };
    }
    
    // If no backend data, return Supabase data as-is
    return supabaseCookie;
  });

  // Recalculate stats with merged data
  const total_cookies = mergedCookies.length;
  const total_usage = mergedCookies.reduce((sum, cookie) => sum + cookie.usage_count, 0);
  const average_usage = total_cookies > 0 ? total_usage / total_cookies : 0;

  return {
    all_cookies: mergedCookies,
    overall_stats: {
      total_cookies,
      total_usage,
      average_usage,
    },
  };
};
