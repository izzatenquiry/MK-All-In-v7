import React, { useState, useEffect, useMemo } from 'react';
import { getBackendCookies, type BackendCookie } from '../../../services/tokenBackendService';
import { getAllUsers } from '../../../services/userService';
import { getAllFlowAccounts } from '../../../services/flowAccountService';
import { getDashboardStats, type DashboardStats } from '../../../services/dashboardStatsService';
import { getApiRequests } from '../../../services/apiRequestService';
import { type Language, type User } from '../../../types';
import Spinner from '../../common/Spinner';
import { ActivityIcon, UsersIcon, CheckCircleIcon, AlertTriangleIcon, XIcon, KeyIcon } from '../../Icons';

interface TokenDashboardViewProps {
  language: Language;
}

interface EnhancedUser extends User {
  registered_at?: string;
  expires_at?: string;
  usage_count?: number;
  cookie_status?: 'good' | 'warning' | 'expired' | 'missing';
  flow_account_email?: string;
  total_cookie_count?: number;
  missing_email?: boolean;
  app_version?: string;
  appVersion?: string;
  last_device?: string;
  proxy_server?: string;
  proxyServer?: string;
  personal_auth_token?: string;
  last_seen_at?: string;
  lastSeenAt?: string;
  batch_02?: string;
}

/** Same window as before: "active" = last seen within this many ms (1 hour). */
const ACTIVE_USER_THRESHOLD_MS = 60 * 60 * 1000;

const TokenDashboardView: React.FC<TokenDashboardViewProps> = ({ language }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<EnhancedUser[]>([]);
  const [cookiesByFolder, setCookiesByFolder] = useState<Record<string, BackendCookie[]>>({});
  const [flowAccounts, setFlowAccounts] = useState<any[]>([]);
  const [apiRequestsData, setApiRequestsData] = useState<{ users: any[]; total_requests: number }>({ users: [], total_requests: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const DASHBOARD_LOAD_TIMEOUT_MS = 45000;

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await Promise.race([
          (async () => {
            // Fetch cookies first (needed for stats calculation)
            const cookiesData = await getBackendCookies().catch(() => ({}));
            if (cancelled) return;
            setCookiesByFolder(cookiesData || {});

            // Fetch other data in parallel
            const [usersData, flowAccountsData, apiRequests] = await Promise.all([
              getAllUsers(),
              getAllFlowAccounts().catch(() => []),
              getApiRequests().catch(() => ({ users: [], total_requests: 0 })),
            ]);

            if (cancelled) return;

            if (usersData) {
              setUsers(usersData as EnhancedUser[]);
            }

            setFlowAccounts(flowAccountsData || []);
            setApiRequestsData(apiRequests);

            // Calculate dashboard stats from Supabase (with cookies data for cookie stats)
            const statsData = await getDashboardStats(cookiesData || {});
            if (cancelled) return;
            if (statsData) {
              setStats(statsData);
            } else {
              console.error('Failed to load dashboard statistics: getDashboardStats returned null');
            }
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('DASHBOARD_LOAD_TIMEOUT')), DASHBOARD_LOAD_TIMEOUT_MS)
          ),
        ]);
      } catch (error) {
        if (cancelled) return;
        const msg =
          error instanceof Error && error.message === 'DASHBOARD_LOAD_TIMEOUT'
            ? 'Dashboard load timed out. Check network, Supabase, and that the Bot Admin API is reachable (e.g. http://localhost:1247 if using local backend).'
            : 'Failed to load dashboard data.';
        setLoadError(msg);
        console.error('Error fetching dashboard data:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCookiesByFolder = useMemo(() => {
    const filtered: Record<string, BackendCookie[]> = {};
    
    Object.entries(cookiesByFolder).forEach(([folderName, cookies]) => {
      const shouldInclude = folderName === 'Root' || /^G\d+$/i.test(folderName);
      
      if (shouldInclude) {
        filtered[folderName] = cookies;
      }
    });
    
    return filtered;
  }, [cookiesByFolder]);

  // Calculate brand-specific cookie stats
  const brandCookieStats = useMemo(() => {
    const allCookies = Object.values(filteredCookiesByFolder).flat();
    return {
      good: allCookies.filter(c => c.status === 'good').length,
      warning: allCookies.filter(c => c.status === 'warning').length,
      expired: allCookies.filter(c => c.status === 'expired').length,
    };
  }, [filteredCookiesByFolder]);

  // Calculate brand-specific user stats (ALL users including admin)
  const brandUserStats = useMemo(() => {
    // Include ALL users from Supabase (including admin)
    const totalAllUsers = users.length;
    const nonAdminUsers = users.filter(u => u.role !== 'admin');
    const usersWithEmail = nonAdminUsers.filter(u => u.email);
    const usersWithoutEmail = nonAdminUsers.filter(u => !u.email);
    
    // Count active users (within last hour) - only non-admin
    const now = new Date().getTime();
    const activeUsers = nonAdminUsers.filter(user => 
      (user.last_seen_at || (user as any).lastSeenAt) && 
      (now - new Date(user.last_seen_at || (user as any).lastSeenAt || '').getTime()) < ACTIVE_USER_THRESHOLD_MS
    );
    
    return {
      total: totalAllUsers, // Include admin users in total count
      active: activeUsers.length,
      withoutEmail: usersWithoutEmail.length,
    };
  }, [users]);

  const brandFlowAccountStats = useMemo(() => {
    let assignedSlots = 0;
    let totalSlots = 0;
    
    const brandFlowAccounts = flowAccounts.filter(acc => {
      const code = acc.code?.toUpperCase() || '';
      return /^G\d+$/.test(code);
    });
    
    // Calculate slots from brand flow accounts only
    brandFlowAccounts.forEach(account => {
      const currentUsers = account.current_users_count || 0;
      const maxUsers = 10; // Default max users per flow account
      assignedSlots += currentUsers;
      totalSlots += maxUsers;
    });
    
    return {
      assigned: assignedSlots,
      total: totalSlots,
    };
  }, [flowAccounts]);

  // Calculate brand-specific API requests (filtered by brand users)
  const brandTotalRequests = useMemo(() => {
    if (!apiRequestsData.users || apiRequestsData.users.length === 0) {
      return 0;
    }
    
    // Get brand user emails
    const brandEmails = new Set(users.map(u => u.email?.toLowerCase()).filter(Boolean));
    
    // Filter API requests by brand users and sum total requests
    const brandRequests = apiRequestsData.users
      .filter(apiUser => {
        const userEmail = apiUser.email?.toLowerCase();
        return userEmail && brandEmails.has(userEmail);
      })
      .reduce((sum, apiUser) => sum + (apiUser.total_requests || 0), 0);
    
    return brandRequests;
  }, [apiRequestsData, users]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[240px]">
        <Spinner />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm">
        <div className="text-center text-red-600 dark:text-red-400 max-w-lg mx-auto">
          <AlertTriangleIcon className="w-12 h-12 mx-auto mb-4" />
          <p className="mb-2">{loadError}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Status &quot;OPERATIONAL&quot; only reflects some services — this tab needs Supabase and the cookie backend API.
          </p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm">
        <div className="text-center text-red-600 dark:text-red-400">
          <AlertTriangleIcon className="w-12 h-12 mx-auto mb-4" />
          <p>Failed to load dashboard statistics</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Users',
      value: brandUserStats.total,
      icon: <UsersIcon className="w-6 h-6" />,
      color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20',
    },
    {
      title: 'Active Users',
      value: brandUserStats.active,
      icon: <ActivityIcon className="w-6 h-6" />,
      color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20',
    },
    {
      title: 'Valid Cookies',
      value: brandCookieStats.good,
      icon: <CheckCircleIcon className="w-6 h-6" />,
      color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20',
    },
    {
      title: 'Total Requests',
      value: brandTotalRequests,
      icon: <KeyIcon className="w-6 h-6" />,
      color: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/20',
    },
    {
      title: 'Flow Account Slots',
      value: `${brandFlowAccountStats.assigned} / ${brandFlowAccountStats.total}`,
      icon: <UsersIcon className="w-6 h-6" />,
      color: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/20',
    },
    {
      title: 'Warning Cookies',
      value: brandCookieStats.warning,
      icon: <AlertTriangleIcon className="w-6 h-6" />,
      color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20',
    },
  ];

  return (
    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm h-full overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-white">Token Management Dashboard</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Overview of token generation system and cookie pool status
        </p>
      </div>

      {brandUserStats.withoutEmail > 0 && (
        <div className="bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>{brandUserStats.withoutEmail}</strong> users without email address
            </p>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {statCards.map((card, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border ${card.color} border-current/20`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{card.title}</h3>
              {card.icon}
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-neutral-50 dark:bg-neutral-800/30 rounded-lg p-4">
          <h3 className="font-semibold mb-2 text-neutral-800 dark:text-neutral-200">
            Cookie Status (G folders)
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Good:</span>
              <span className="font-semibold text-green-600 dark:text-green-400">{brandCookieStats.good}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Warning:</span>
              <span className="font-semibold text-yellow-600 dark:text-yellow-400">{brandCookieStats.warning}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Expired:</span>
              <span className="font-semibold text-red-600 dark:text-red-400">{brandCookieStats.expired}</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-50 dark:bg-neutral-800/30 rounded-lg p-4">
          <h3 className="font-semibold mb-2 text-neutral-800 dark:text-neutral-200">Flow Account Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Assigned Slots:</span>
              <span className="font-semibold">{brandFlowAccountStats.assigned}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Total Slots:</span>
              <span className="font-semibold">{brandFlowAccountStats.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Available:</span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                {brandFlowAccountStats.total - brandFlowAccountStats.assigned}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenDashboardView;
