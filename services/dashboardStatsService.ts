import { supabase } from './supabaseClient';
import { getAllUsers } from './userService';
import { getAllFlowAccounts } from './flowAccountService';
import { getApiRequests } from './apiRequestService';
import { getCookieUsageStatistics } from './cookieUsageService';

export interface DashboardStats {
  total_users: number;
  active_users: number;
  good_cookies: number;
  warning_cookies: number;
  expired_cookies: number;
  total_requests: number;
  users_without_email: number;
  assigned_flow_slots: number;
  total_flow_slots: number;
}

const ACTIVE_USER_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get dashboard statistics from Supabase
 * Aggregates data from multiple tables: users, api_requests, cookie_usage_stats, ultra_ai_email_pool
 */
export const getDashboardStats = async (cookiesByFolder?: Record<string, any[]>): Promise<DashboardStats | null> => {
  try {
    // Get all data in parallel
    const [usersData, flowAccountsData, apiRequestsData, cookieStatsData] = await Promise.all([
      getAllUsers(),
      getAllFlowAccounts().catch(() => []),
      getApiRequests().catch(() => ({ users: [], total_requests: 0 })),
      getCookieUsageStatistics().catch(() => null),
    ]);

    // Calculate user stats
    const allUsers = usersData || [];
    const nonAdminUsers = allUsers.filter(u => u.role !== 'admin');
    const total_users = allUsers.length; // Include admin in total
    const users_without_email = nonAdminUsers.filter(u => !u.email).length;

    // Calculate active users (within last hour)
    const now = new Date().getTime();
    const active_users = nonAdminUsers.filter(user => {
      const lastSeen = (user as any).last_seen_at || (user as any).lastSeenAt;
      if (!lastSeen) return false;
      const lastSeenTime = new Date(lastSeen).getTime();
      return (now - lastSeenTime) < ACTIVE_USER_THRESHOLD_MS;
    }).length;

    // Calculate cookie stats
    let good_cookies = 0;
    let warning_cookies = 0;
    let expired_cookies = 0;

    if (cookiesByFolder) {
      // Count cookies from backend cookie data
      const allCookies = Object.values(cookiesByFolder).flat();
      good_cookies = allCookies.filter((c: any) => c.status === 'good').length;
      warning_cookies = allCookies.filter((c: any) => c.status === 'warning').length;
      expired_cookies = allCookies.filter((c: any) => c.status === 'expired').length;
    } else if (cookieStatsData) {
      // Fallback: count from cookie usage stats (less accurate, no status info)
      good_cookies = cookieStatsData.all_cookies.length; // Approximate
    }

    // Calculate API requests
    const total_requests = apiRequestsData.total_requests || 0;

    // Calculate flow account slots
    const brandFlowAccounts = flowAccountsData.filter((acc: any) => {
      const code = acc.code?.toUpperCase() || '';
      return /^G\d+$/.test(code);
    });

    let assigned_flow_slots = 0;
    let total_flow_slots = 0;

    brandFlowAccounts.forEach((account: any) => {
      const currentUsers = account.current_users_count || 0;
      const maxUsers = account.max_users || 10; // Default max users per flow account
      assigned_flow_slots += currentUsers;
      total_flow_slots += maxUsers;
    });

    return {
      total_users,
      active_users,
      good_cookies,
      warning_cookies,
      expired_cookies,
      total_requests,
      users_without_email,
      assigned_flow_slots,
      total_flow_slots,
    };
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    return null;
  }
};
