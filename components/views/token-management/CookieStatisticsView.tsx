import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getBackendCookies } from '../../../services/tokenBackendService';
import { getCookieUsageStatistics, mergeCookieStatsWithBackendData, type CookieStatistics } from '../../../services/cookieUsageService';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import { ActivityIcon, CheckCircleIcon, AlertTriangleIcon } from '../../Icons';
import { BRAND_CONFIG } from '../../../services/brandConfig';

interface CookieStatisticsViewProps {
  language: Language;
}

const CookieStatisticsView: React.FC<CookieStatisticsViewProps> = ({ language }) => {
  const [stats, setStats] = useState<CookieStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatistics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch both Supabase stats and backend cookie metadata
      const [supabaseStats, backendCookies] = await Promise.all([
        getCookieUsageStatistics(),
        getBackendCookies().catch(() => ({}))
      ]);
      
      // Merge Supabase usage data with backend cookie metadata
      const mergedStats = mergeCookieStatsWithBackendData(supabaseStats, backendCookies);
      
      console.log('[CookieStatisticsView] Data received:', mergedStats);
      setStats(mergedStats);
    } catch (err) {
      console.error('[CookieStatisticsView] Error fetching cookie statistics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  // IMPORTANT: All hooks must be called before any early returns (Rules of Hooks)
  // Filter cookies based on brand: ESAIE shows E folders, MONOKLIX shows G folders
  const filteredCookies = useMemo(() => {
    try {
      if (!stats || !stats.all_cookies || !Array.isArray(stats.all_cookies)) {
        return [];
      }
      const isEsaie = BRAND_CONFIG.name === 'ESAIE';
      const filtered = stats.all_cookies.filter(cookie => {
        if (!cookie) return false;
        // Keep cookies without flow_account (Root/Personal cookies) for both brands
        if (!cookie.flow_account || cookie.flow_account === 'Personal') {
          return true;
        }
        // Filter by flow_account prefix: E for ESAIE, G for MONOKLIX
        const flowAccount = String(cookie.flow_account).toUpperCase();
        return isEsaie 
          ? /^E\d+$/.test(flowAccount)
          : /^G\d+$/.test(flowAccount);
      });
      return filtered;
    } catch (err) {
      console.error('[CookieStatisticsView] Error filtering cookies:', err);
      return [];
    }
  }, [stats]);

  // Recalculate overall stats from filtered cookies
  const filteredStats = useMemo(() => {
    try {
      if (!Array.isArray(filteredCookies)) {
        return { total_cookies: 0, total_usage: 0, average_usage: 0 };
      }
      const total_cookies = filteredCookies.length;
      const total_usage = filteredCookies.reduce((sum, c) => sum + (c?.usage_count || 0), 0);
      const average_usage = total_cookies > 0 ? total_usage / total_cookies : 0;
      return { total_cookies, total_usage, average_usage };
    } catch (err) {
      console.error('[CookieStatisticsView] Error calculating filtered stats:', err);
      return { total_cookies: 0, total_usage: 0, average_usage: 0 };
    }
  }, [filteredCookies]);

  const sortedCookies = useMemo(() => {
    if (!Array.isArray(filteredCookies) || filteredCookies.length === 0) {
      return [];
    }
    return [...filteredCookies].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
  }, [filteredCookies]);
  
  const mostUsed = sortedCookies.length > 0 ? sortedCookies[0] : null;
  const leastUsed = sortedCookies.length > 0 ? sortedCookies[sortedCookies.length - 1] : null;

  // Now we can do early returns after all hooks are called
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm">
        <div className="text-center text-red-600 dark:text-red-400">
          <AlertTriangleIcon className="w-12 h-12 mx-auto mb-4" />
          <p>Error: {error}</p>
          <button 
            onClick={fetchStatistics}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm">
        <div className="text-center text-red-600 dark:text-red-400">
          <AlertTriangleIcon className="w-12 h-12 mx-auto mb-4" />
          <p>Failed to load cookie statistics</p>
          <button 
            onClick={fetchStatistics}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm h-full overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-white">Cookie Usage Statistics</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Track cookie usage and token generation statistics
        </p>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-100 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-2">
            <ActivityIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-blue-900 dark:text-blue-200">Total Cookies</h3>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {filteredStats.total_cookies}
          </p>
        </div>
        <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="font-semibold text-green-900 dark:text-green-200">Total Usage</h3>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {filteredStats.total_usage}
          </p>
        </div>
        <div className="bg-purple-100 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-2 mb-2">
            <ActivityIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className="font-semibold text-purple-900 dark:text-purple-200">Average Usage</h3>
          </div>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {filteredStats.average_usage.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Top Cookies */}
      {mostUsed && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-neutral-800 dark:text-neutral-200">Most Used Cookie</h3>
          <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold text-green-900 dark:text-green-200">{mostUsed.filename}</p>
                <p className="text-sm text-green-700 dark:text-green-300">{mostUsed.flow_account}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{mostUsed.usage_count}</p>
                <p className="text-xs text-green-700 dark:text-green-300">uses</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cookie List */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-neutral-800 dark:text-neutral-200">All Cookies</h3>
        {sortedCookies.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            <p>No cookies found for {BRAND_CONFIG.name === 'ESAIE' ? 'ESAIE (E folders)' : 'MONOKLIX (G folders)'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Filename</th>
                  <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Flow Account</th>
                  <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Usage Count</th>
                  <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Status</th>
                  <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Type</th>
                </tr>
              </thead>
              <tbody>
                {sortedCookies.map((cookie, index) => (
                  <tr
                    key={index}
                    className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <td className="p-3 text-neutral-900 dark:text-white">{cookie.filename}</td>
                    <td className="p-3 text-neutral-600 dark:text-neutral-400">{cookie.flow_account}</td>
                    <td className="p-3">
                      <span className="font-semibold">{cookie.usage_count}</span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          cookie.status === 'good'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                            : cookie.status === 'warning'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                        }`}
                      >
                        {cookie.status}
                      </span>
                    </td>
                    <td className="p-3 text-neutral-600 dark:text-neutral-400">
                      {cookie.is_pool_cookie ? 'Pool' : 'Personal'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CookieStatisticsView;
