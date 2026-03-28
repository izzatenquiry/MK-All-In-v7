import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  getAllUsers, 
  removeUser, 
  updateUserStatus, 
  forceUserLogout, 
  updateUserSubscription, 
  saveUserPersonalAuthToken, 
  updateUserBatch02,
  addNewUser
} from '../../../services/userService';
import { BRAND_CONFIG } from '../../../services/brandConfig';
import { supabase } from '../../../services/supabaseClient';
import { type User } from '../../../types';
import { 
  getAllFlowAccounts, 
  assignEmailCodeToUser, 
  resetEmailCodeFromUser,
  assignFlowCodeToUserByEmail,
  type FlowAccount 
} from '../../../services/flowAccountService';
import { 
  getAllTokenUltraRegistrations, 
  type TokenUltraRegistrationWithUser 
} from '../../../services/tokenUltraService';
import { 
  getBackendCookies, 
  grabCookie 
} from '../../../services/tokenBackendService';
import { getApiRequests } from '../../../services/apiRequestService';
import { type Language, type UserStatus } from '../../../types';
import Spinner from '../../common/Spinner';
import ConfirmationModal from '../../common/ConfirmationModal';
import { 
  UsersIcon, 
  TrashIcon, 
  PencilIcon, 
  CheckCircleIcon, 
  XIcon, 
  AlertTriangleIcon, 
  KeyIcon, 
  PlusIcon,
  DatabaseIcon
} from '../../Icons';

interface UserManagementViewProps {
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
  // From AdminDashboardView
  registration?: TokenUltraRegistrationWithUser;
  app_version?: string;
  last_device?: string;
  proxy_server?: string;
  personal_auth_token?: string;
  last_seen_at?: string;
  batch_02?: string;
  token_ultra_status?: 'active' | 'expiring_soon' | 'expired' | null;
}

// Status formatting from AdminDashboardView
const formatStatus = (user: User): { text: string; color: 'green' | 'yellow' | 'red' | 'blue' } => {
  switch(user.status) {
    case 'admin':
      return { text: 'Admin', color: 'blue' };
    case 'lifetime':
      return { text: 'Lifetime', color: 'green' };
    case 'subscription':
      return { text: 'Subscription', color: 'green' };
    case 'trial':
      return { text: 'Trial', color: 'yellow' };
    case 'inactive':
      return { text: 'Inactive', color: 'red' };
    default:
      return { text: 'Unknown', color: 'red' };
  }
};

const statusColors: Record<'green' | 'yellow' | 'red' | 'blue', string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  blue: 'bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-300',
};

// Constants
const STATUS_MESSAGE_TIMEOUT = 5000;
const ACTIVE_USER_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// Custom Hooks
const useActiveUsers = (users: EnhancedUser[]) => {
  return useMemo(() => {
    const now = new Date().getTime();
    return users.filter(user => 
      user.role !== 'admin' && 
      user.last_seen_at && 
      (now - new Date(user.last_seen_at).getTime()) < ACTIVE_USER_THRESHOLD_MS
    );
  }, [users]);
};

const useFlowAccounts = () => {
  const [flowAccounts, setFlowAccounts] = useState<FlowAccount[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFlowAccounts = useCallback(async (filterActive = false) => {
    setLoading(true);
    try {
      const accounts = await getAllFlowAccounts();
      let filtered = accounts;
      
      if (filterActive) {
        filtered = accounts
          .filter(acc => acc.status === 'active' && acc.current_users_count < 10)
          .sort((a, b) => {
            if (a.current_users_count !== b.current_users_count) {
              return a.current_users_count - b.current_users_count;
            }
            return a.code.localeCompare(b.code);
          });
      }
      
      setFlowAccounts(filtered);
      return filtered;
    } catch (error) {
      console.error('Error fetching flow accounts:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { flowAccounts, loading, fetchFlowAccounts };
};


// Reusable Flow Account Selector Component
interface FlowAccountSelectorProps {
  flowAccounts: FlowAccount[];
  selectedCode: string;
  assignMode: 'auto' | 'manual';
  onCodeChange: (code: string) => void;
  onModeChange: (mode: 'auto' | 'manual') => void;
  disabled?: boolean;
  label?: string;
  showReassign?: boolean;
}

const FlowAccountSelector: React.FC<FlowAccountSelectorProps> = ({
  flowAccounts,
  selectedCode,
  assignMode,
  onCodeChange,
  onModeChange,
  disabled = false,
  label = 'Flow Account',
  showReassign = false
}) => {
  const sortedAccounts = useMemo(() => {
    return [...flowAccounts].sort((a, b) => {
      if (a.current_users_count !== b.current_users_count) {
        return a.current_users_count - b.current_users_count;
      }
      return a.code.localeCompare(b.code);
    });
  }, [flowAccounts]);

  const autoSelectedCode = sortedAccounts[0]?.code || '';

  useEffect(() => {
    if (assignMode === 'auto' && autoSelectedCode && !selectedCode) {
      onCodeChange(autoSelectedCode);
    }
  }, [assignMode, autoSelectedCode, selectedCode, onCodeChange]);

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
        {label}
      </label>
      
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => {
            onModeChange('auto');
            if (autoSelectedCode) onCodeChange(autoSelectedCode);
          }}
          disabled={disabled}
          className={`flex-1 py-2 px-4 text-sm font-semibold rounded-lg transition-all ${
            assignMode === 'auto'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Auto
        </button>
        <button
          type="button"
          onClick={() => onModeChange('manual')}
          disabled={disabled}
          className={`flex-1 py-2 px-4 text-sm font-semibold rounded-lg transition-all ${
            assignMode === 'manual'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Manual
        </button>
      </div>

      {assignMode === 'manual' && (
        <div className="mb-3">
          <select
            value={selectedCode}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onCodeChange(e.target.value)}
            disabled={disabled}
            className="w-full bg-neutral-50 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select Flow Account</option>
            {flowAccounts.map((account: FlowAccount) => (
              <option key={account.id} value={account.code}>
                {account.code} - {account.email} ({account.current_users_count}/10)
              </option>
            ))}
          </select>
        </div>
      )}

      {assignMode === 'auto' && sortedAccounts.length > 0 && (
        <div className="mb-3 p-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded text-xs text-primary-800 dark:text-primary-200">
          Will {showReassign ? 'reassign' : 'assign'} to: <strong>{sortedAccounts[0].code}</strong> ({sortedAccounts[0].current_users_count}/10 users)
        </div>
      )}
    </div>
  );
};

const UserManagementView: React.FC<UserManagementViewProps> = ({ language }) => {
  const [users, setUsers] = useState<EnhancedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'good' | 'needs_attention' | 'none'>('all');
  const [flowCodeFilter, setFlowCodeFilter] = useState<string>('active');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'all' | 'active' | 'expiring_soon' | 'expired' | 'none'>('all');
  
  // Modals
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [grabCookieModalOpen, setGrabCookieModalOpen] = useState(false);
  const [grabCookieLoading, setGrabCookieLoading] = useState(false);
  const [isConfirmLogoutOpen, setIsConfirmLogoutOpen] = useState(false);
  const [isConfirmRemoveOpen, setIsConfirmRemoveOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState<EnhancedUser | null>(null);
  const [selectedFlowAccountCode, setSelectedFlowAccountCode] = useState<string>('');
  
  // Add User form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserNotes, setNewUserNotes] = useState('');
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserAssignMode, setAddUserAssignMode] = useState<'auto' | 'manual'>('auto');
  const [subscriptionExpiryMode, setSubscriptionExpiryMode] = useState<'duration' | 'manual'>('duration');
  const [addUserSubscriptionDuration, setAddUserSubscriptionDuration] = useState<1 | 6 | 12>(6);
  const [addUserManualExpiryDate, setAddUserManualExpiryDate] = useState<string>('');
  
  // Edit modal state from AdminDashboardView
  const [newStatus, setNewStatus] = useState<UserStatus>('trial');
  const [subscriptionDuration, setSubscriptionDuration] = useState<1 | 6 | 12>(6);
  const [editSubscriptionExpiryMode, setEditSubscriptionExpiryMode] = useState<'duration' | 'manual'>('duration');
  const [editManualExpiryDate, setEditManualExpiryDate] = useState<string>('');
  const [personalToken, setPersonalToken] = useState<string>('');
  const [batch02, setBatch02] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'loading'; message: string } | null>(null);
  const [isAssigningEmailCode, setIsAssigningEmailCode] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<'auto' | 'manual'>('auto');

  // Use custom hooks
  const activeUsers = useActiveUsers(users);
  const activeUsersCount = activeUsers.length;
  const { flowAccounts, fetchFlowAccounts } = useFlowAccounts();

  // Helper function for status messages
  const showStatusMessage = useCallback((
    type: 'success' | 'error' | 'loading', 
    message: string,
    timeout: number = STATUS_MESSAGE_TIMEOUT
  ) => {
    setStatusMessage({ type, message });
    setTimeout(() => setStatusMessage(null), timeout);
  }, []);

  useEffect(() => {
    fetchData();
    fetchFlowAccounts();
  }, [fetchFlowAccounts]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get users from Supabase with token_ultra_status
      let { data: supabaseUsersData, error: usersError } = await supabase
        .from('users')
        .select('*');
      
      if (usersError) {
        console.error('Error fetching users:', usersError);
        setLoading(false);
        return;
      }

      // Helper function to calculate token_ultra_status based on expires_at
      const calculateTokenUltraStatus = (expiresAt: string | null | undefined, currentStatus: string | null | undefined): 'active' | 'expiring_soon' | 'expired' | null => {
        if (!expiresAt) {
          return currentStatus as 'active' | 'expiring_soon' | 'expired' | null;
        }

        const expiryDate = new Date(expiresAt);
        const now = new Date();
        
        // Validate date
        if (isNaN(expiryDate.getTime()) || expiryDate.getTime() === 0) {
          return currentStatus as 'active' | 'expiring_soon' | 'expired' | null;
        }
        
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Calculate correct status based on expiry date
        if (expiryDate < now) {
          // Already expired
          return 'expired';
        } else if (daysUntilExpiry <= 7) {
          // Expiring within 7 days
          return 'expiring_soon';
        } else {
          // Still active (more than 7 days remaining)
          return 'active';
        }
      };

      // Recalculate and update token_ultra_status for all users
      const usersToUpdate: Array<{ id: string; calculatedStatus: 'active' | 'expiring_soon' | 'expired' }> = [];
      
      supabaseUsersData?.forEach((profile: any) => {
        if (profile.token_ultra_status && profile.expires_at) {
          const calculatedStatus = calculateTokenUltraStatus(profile.expires_at, profile.token_ultra_status);
          
          // Only update if status has changed
          if (calculatedStatus && calculatedStatus !== profile.token_ultra_status) {
            usersToUpdate.push({
              id: profile.id,
              calculatedStatus: calculatedStatus
            });
          }
        }
      });

      // Bulk update statuses if there are changes
      if (usersToUpdate.length > 0) {
        console.log(`[UserManagementView] Updating ${usersToUpdate.length} user statuses...`);
        
        // Update each user's status
        const updatePromises = usersToUpdate.map(({ id, calculatedStatus }) =>
          supabase
            .from('users')
            .update({ token_ultra_status: calculatedStatus })
            .eq('id', id)
        );
        
        await Promise.all(updatePromises);
      }

      // Auto unassign flow code for ALL expired users (including those already expired in DB)
      // This handles both newly expired users and users who were already expired but still have email_code
      const { data: allExpiredUsers } = await supabase
        .from('users')
        .select('id, email_code')
        .eq('token_ultra_status', 'expired')
        .not('email_code', 'is', null);
      
      if (allExpiredUsers && allExpiredUsers.length > 0) {
        console.log(`[UserManagementView] Auto unassigning flow code for ${allExpiredUsers.length} expired users...`);
        
        // Group by email_code for batch decrement
        const codeToUserIds = new Map<string, string[]>();
        allExpiredUsers.forEach((user: any) => {
          if (user.email_code) {
            if (!codeToUserIds.has(user.email_code)) {
              codeToUserIds.set(user.email_code, []);
            }
            codeToUserIds.get(user.email_code)!.push(user.id);
          }
        });
        
        // Unassign email_code for all expired users (set to NULL)
        const expiredUserIds = allExpiredUsers.map((u: any) => u.id);
        const unassignPromises = expiredUserIds.map(userId =>
          supabase
            .from('users')
            .update({ email_code: null })
            .eq('id', userId)
        );
        
        await Promise.all(unassignPromises);
        
        // Decrement flow account counts
        for (const [code, userIds] of codeToUserIds.entries()) {
          const { data: flowAccount } = await supabase
            .from('ultra_ai_email_pool')
            .select('id, current_users_count')
            .eq('code', code)
            .eq('status', 'active')
            .maybeSingle();
          
          if (flowAccount && flowAccount.current_users_count > 0) {
            const newCount = Math.max(0, flowAccount.current_users_count - userIds.length);
            await supabase
              .from('ultra_ai_email_pool')
              .update({ current_users_count: newCount })
              .eq('id', flowAccount.id);
          }
        }
        
        console.log(`[UserManagementView] Successfully unassigned flow code (set to NULL) for ${allExpiredUsers.length} expired users`);
      }
        
      // Refresh the data after update
      const { data: updatedUsersData } = await supabase
        .from('users')
        .select('*');
      
      if (updatedUsersData) {
        supabaseUsersData = updatedUsersData;
      }

      // Map to User type (similar to getAllUsers logic)
      const supabaseUsers = (supabaseUsersData || []).map((profile: any) => {
        let expiresAt: string | undefined = undefined;
        if (profile.expires_at) {
          expiresAt = profile.expires_at;
        } else if (profile.subscription_expiry) {
          expiresAt = profile.subscription_expiry;
        }

        return {
          id: profile.id,
          email: profile.email,
          createdAt: profile.created_at,
          username: (profile.email || '').split('@')[0],
          fullName: profile.full_name || undefined,
          phone: profile.phone,
          role: profile.role,
          status: profile.status,
          apiKey: profile.api_key,
          avatarUrl: profile.avatar_url || undefined,
          subscriptionExpiry: profile.subscription_expiry ? new Date(profile.subscription_expiry).getTime() : undefined,
          totalImage: profile.total_image ?? undefined,
          totalVideo: profile.total_video ?? undefined,
          lastSeenAt: profile.last_seen_at || undefined,
          forceLogoutAt: profile.force_logout_at || undefined,
          appVersion: profile.app_version || undefined,
          personalAuthToken: profile.personal_auth_token || undefined,
          personalAuthTokenUpdatedAt: profile.personal_auth_token_updated_at || undefined,
          recaptchaToken: profile.recaptcha_token || undefined,
          proxyServer: profile.proxy_server || undefined,
          batch_02: profile.batch_02 || undefined,
          lastDevice: profile.last_device || undefined,
          telegramId: profile.telegram_id || undefined,
          email_code: profile.email_code || undefined,
          expires_at: expiresAt || undefined,
          registered_at: profile.registered_at || undefined,
          lastCookiesFile: profile.last_cookies_file || undefined,
        } as User;
      });
      
      // Get token ultra registrations for registered_at, expires_at, and user details
      const registrations = await getAllTokenUltraRegistrations();
      const registrationMap = new Map<string, TokenUltraRegistrationWithUser>();
      if (registrations) {
        registrations.forEach(reg => {
          if (reg.user_id && !registrationMap.has(reg.user_id)) {
            registrationMap.set(reg.user_id, reg);
          }
        });
      }

      // Get API requests for usage_count from Supabase
      const apiRequests = await getApiRequests();
      const usageMap = new Map<string, number>();
      if (apiRequests.users) {
        apiRequests.users.forEach(req => {
          if (req.email) {
            usageMap.set(req.email.toLowerCase(), req.total_requests);
          }
        });
      }

      // Get flow accounts for flow_account_email
      const accounts = await getAllFlowAccounts();
      const flowAccountMap = new Map<string, FlowAccount>();
      accounts.forEach(acc => {
        flowAccountMap.set(acc.code, acc);
      });

      // Get cookie pool info from backend (local filesystem)
      const cookiesByFolder = await getBackendCookies();
      
      // Helper to calculate cookie pool info (filtered by brand)
      const getCookiePoolInfo = (code: string): { cookie_count: number; cookie_pool_status: 'good' | 'needs_more' | 'none' } => {
        // Only check cookies from folders that match the brand
        const isEsaie = BRAND_CONFIG.name === 'ESAIE';
        const folderMatchBrand = code === 'Root' || 
          (isEsaie && /^E\d+$/i.test(code)) || 
          (!isEsaie && /^G\d+$/i.test(code));
        
        if (!folderMatchBrand) {
          // Folder doesn't match brand, return empty
          return { cookie_count: 0, cookie_pool_status: 'none' };
        }
        
        const cookies = cookiesByFolder[code] || [];
        const validCookies = cookies.filter(c => c.status === 'good' && c.valid);
        const cookieCount = validCookies.length;
        
        let status: 'good' | 'needs_more' | 'none' = 'none';
        if (cookieCount >= 3) {
          status = 'good';
        } else if (cookieCount >= 1) {
          status = 'needs_more';
        }
        
        return { cookie_count: cookieCount, cookie_pool_status: status };
      };
      
      const backendAccountMap = new Map<string, { cookie_count?: number; cookie_pool_status?: string }>();
      accounts.forEach(acc => {
        const poolInfo = getCookiePoolInfo(acc.code);
        backendAccountMap.set(acc.code, poolInfo);
      });

      // Enhance users with additional data
      const enhancedUsers: EnhancedUser[] = supabaseUsers.map((user, idx) => {
        const rawProfile = supabaseUsersData[idx];
        const reg = registrationMap.get(user.id);
        const usageCount = user.email ? usageMap.get(user.email.toLowerCase()) : 0;
        const flowAccount = user.email_code ? flowAccountMap.get(user.email_code) : null;
        const backendAccount = user.email_code ? backendAccountMap.get(user.email_code) : null;

        // Determine cookie status from flow account pool
        let cookieStatus: 'good' | 'warning' | 'expired' | 'missing' = 'missing';
        if (user.email_code && backendAccount) {
          const poolStatus = backendAccount.cookie_pool_status;
          if (poolStatus === 'good') {
            cookieStatus = 'good';
          } else if (poolStatus === 'needs_more') {
            cookieStatus = 'warning';
          } else {
            cookieStatus = 'missing';
          }
        }

        // Recalculate status for display (in case update didn't happen yet or for real-time accuracy)
        const calculatedStatus = calculateTokenUltraStatus(rawProfile?.expires_at, rawProfile?.token_ultra_status);

        return {
          ...user,
          registered_at: user.registered_at || user.createdAt,
          expires_at: user.expires_at,
          usage_count: usageCount,
          cookie_status: cookieStatus,
          flow_account_email: flowAccount?.email,
          total_cookie_count: backendAccount?.cookie_count || 0,
          missing_email: !user.email,
          registration: reg || undefined,
          app_version: user.appVersion,
          last_device: user.lastDevice || undefined,
          proxy_server: user.proxyServer || undefined,
          personal_auth_token: user.personalAuthToken || undefined,
          last_seen_at: user.lastSeenAt,
          batch_02: user.batch_02 || undefined,
          token_ultra_status: calculatedStatus || rawProfile?.token_ultra_status || null,
        };
      });

      // Show ALL users for both brands (standardized)
      setUsers(enhancedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    const result = await removeUser(selectedUser.id);
    if (result.success) {
      fetchData();
      setDeleteModalOpen(false);
      setSelectedUser(null);
    } else {
      alert(result.message || 'Failed to delete user');
    }
  };

  const handleAddUser = async (e?: React.MouseEvent) => {
    // Prevent form submission if triggered from form
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Validation
    if (!newUserEmail.trim()) {
      showStatusMessage('error', 'Email is required');
      return;
    }
    
    if (!newUserFullName.trim()) {
      showStatusMessage('error', 'Full Name is required');
      return;
    }
    
    if (!newUserPhone.trim()) {
      showStatusMessage('error', 'Phone Number is required');
      return;
    }

    setAddUserLoading(true);
    showStatusMessage('loading', 'Adding user...');
    
    try {
      const cleanedEmail = newUserEmail.trim().toLowerCase();
      
      // Step 1: Check if user exists in Supabase
      const { data: existingUser, error: userCheckError } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('email', cleanedEmail)
        .maybeSingle();
      
      if (userCheckError && userCheckError.code !== 'PGRST116') {
        // PGRST116 = "not found" (expected if user doesn't exist)
        showStatusMessage('error', `Error checking user: ${userCheckError.message}`);
        setAddUserLoading(false);
        return;
      }
      
      let userId: string;
      
      // Step 2: If user doesn't exist, create user first
      if (!existingUser) {
        showStatusMessage('loading', 'User not found. Creating new user...');
        
        const createResult = await addNewUser({
          email: cleanedEmail,
          phone: newUserPhone.trim(),
          status: 'subscription',
          fullName: newUserFullName.trim(),
          role: 'user',
          batch_02: null
        });
        
        if (!createResult.success || !createResult.user) {
          showStatusMessage('error', createResult.message || 'Failed to create user');
          setAddUserLoading(false);
          return;
        }
        
        userId = createResult.user.id;
        showStatusMessage('loading', 'User created. Assigning flow account...');
      } else {
        userId = existingUser.id;
        // Update full name and phone if user exists but info is different
        if (existingUser.full_name !== newUserFullName.trim()) {
          await supabase
            .from('users')
            .update({ full_name: newUserFullName.trim(), phone: newUserPhone.trim() })
            .eq('id', userId);
        }
      }
      
      // Step 3: Assign flow account
      let flowCodeToUse: string;
      
      if (addUserAssignMode === 'manual' && selectedFlowAccountCode) {
        flowCodeToUse = selectedFlowAccountCode;
      } else {
        // Auto mode - pilih account dengan current_users_count paling rendah
        const sortedAccounts = [...flowAccounts]
          .filter(acc => acc.status === 'active')
          .sort((a, b) => (a.current_users_count || 0) - (b.current_users_count || 0));
        
        if (sortedAccounts.length === 0) {
          showStatusMessage('error', 'No available flow accounts. Please add flow accounts first.');
          setAddUserLoading(false);
          return;
        }
        
        flowCodeToUse = sortedAccounts[0].code;
      }
      
      console.log('[UserManagementView] Calling assignFlowCodeToUserByEmail:', {
        email: cleanedEmail,
        flowCode: flowCodeToUse,
        mode: addUserAssignMode
      });
      
      const result = await assignFlowCodeToUserByEmail(cleanedEmail, flowCodeToUse);
      
      console.log('[UserManagementView] Result received:', result);
      
      if (result.success) {
        // Step 4: Update subscription expiry
        let expiryDate: Date | null = null;
        if (subscriptionExpiryMode === 'duration') {
          expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + addUserSubscriptionDuration);
        } else if (subscriptionExpiryMode === 'manual' && addUserManualExpiryDate) {
          expiryDate = new Date(addUserManualExpiryDate);
          expiryDate.setHours(23, 59, 59, 999);
        }

        if (expiryDate) {
          try {
            await supabase
              .from('users')
              .update({
                status: 'subscription',
                subscription_expiry: expiryDate.toISOString(), // Untuk ESAIE backward compatibility
                expires_at: expiryDate.toISOString(), // Standardized untuk kedua-dua brand
              })
              .eq('id', userId);
          } catch (expiryError) {
            console.warn('[UserManagementView] Error updating subscription expiry:', expiryError);
          }
        }

        const successMsg = existingUser 
          ? `User updated successfully! Flow code ${flowCodeToUse} assigned.`
          : `User created and added successfully! Flow code ${flowCodeToUse} assigned.`;
        
        showStatusMessage('success', successMsg);
        
        setTimeout(() => {
          setIsAddUserModalOpen(false);
          setNewUserEmail('');
          setNewUserFullName('');
          setNewUserPhone('');
          setNewUserNotes('');
          setSelectedFlowAccountCode('');
          setAddUserAssignMode('auto');
          setSubscriptionExpiryMode('duration');
          setAddUserSubscriptionDuration(6);
          setAddUserManualExpiryDate('');
          setStatusMessage(null);
        }, 2000);
        
        fetchData();
        fetchFlowAccounts();
      } else {
        const errorMsg = result.message || 'Failed to assign flow account.';
        console.error('[UserManagementView] Assign flow account failed:', errorMsg);
        showStatusMessage('error', errorMsg);
        setTimeout(() => setStatusMessage(null), 10000);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to add user';
      console.error('[UserManagementView] Exception in handleAddUser:', error);
      showStatusMessage('error', `Error: ${errorMsg}`);
      setTimeout(() => setStatusMessage(null), 8000);
    } finally {
      setAddUserLoading(false);
    }
  };

  const handleAssignFlowAccount = async (user: EnhancedUser, flowAccountCode: string) => {
    if (!user.email) return;
    const result = await assignEmailCodeToUser(user.id, flowAccountCode);
    if (result.success) {
      fetchData();
      setAssignModalOpen(false);
      setSelectedUser(null);
      setSelectedFlowAccountCode('');
    } else {
      alert(result.message || 'Failed to assign flow account');
    }
  };

  const handleUnassignFlowAccount = async (user: EnhancedUser) => {
    if (!user.email || !user.email_code) return;
    const result = await resetEmailCodeFromUser(user.id);
    if (result.success) {
      fetchData();
    } else {
      alert(result.message || 'Failed to unassign flow account');
    }
  };

  const handleGrabCookie = async () => {
    if (!selectedUser?.email) return;
    setGrabCookieLoading(true);
    const emailPart = selectedUser.email.split('@')[0];
    const cookieName = `user_${emailPart}`;
    const result = await grabCookie(cookieName, selectedUser.email);
    setGrabCookieLoading(false);
    if (result.success) {
      fetchData();
      setGrabCookieModalOpen(false);
      setSelectedUser(null);
    } else {
      alert(result.error || 'Failed to grab cookie');
    }
  };

  const openEditModal = (user: EnhancedUser) => {
    setSelectedUser(user);
    setNewStatus((user.status as UserStatus) || 'trial');
    setSubscriptionDuration(6);
    setEditSubscriptionExpiryMode('duration');
    setEditManualExpiryDate('');
    setPersonalToken(user.personal_auth_token || '');
    setBatch02(user.batch_02 || '');
    setAssignMode('auto');
    setSelectedFlowAccountCode('');
    setEditModalOpen(true);
  };

  // Fetch filtered flow accounts when edit modal opens
  useEffect(() => {
    if (editModalOpen && selectedUser) {
      fetchFlowAccounts(true); // Filter active accounts
    }
  }, [editModalOpen, selectedUser, fetchFlowAccounts]);

  const handleSaveChanges = async () => {
    if (!selectedUser) return;
    showStatusMessage('loading', 'Saving changes...');

    // Status update logic
    const statusPromise = new Promise<{ success: boolean, message?: string }>(async (resolve) => {
      const targetStatus = newStatus;
      const currentStatus = selectedUser.status as UserStatus;
      
      // Removed: Veo 3.0 authorization limit check (no longer needed)
      
      // Only skip update if status is not subscription and hasn't changed
      if (targetStatus === currentStatus && targetStatus !== 'subscription') {
        return resolve({ success: true });
      }
      
      let success = false;
      if (targetStatus === 'subscription') {
        // Always calculate expiry date when status is subscription
        let expiryDate: Date | null = null;
        
        if (editSubscriptionExpiryMode === 'duration') {
          // Calculate from current date + duration
          expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + subscriptionDuration);
        } else if (editSubscriptionExpiryMode === 'manual' && editManualExpiryDate) {
          // Use manual date
          expiryDate = new Date(editManualExpiryDate);
          // Set time to end of day (23:59:59)
          expiryDate.setHours(23, 59, 59, 999);
        } else {
          // Fallback: if no date set and mode is manual but no date, use duration
          expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + subscriptionDuration);
        }

        // Always update subscription_expiry when status is subscription
        if (expiryDate) {
          const expiryDateISO = expiryDate.toISOString();
          const { error } = await supabase
            .from('users')
            .update({
              status: 'subscription',
              subscription_expiry: expiryDateISO, // Untuk ESAIE backward compatibility
              expires_at: expiryDateISO, // Standardized untuk kedua-dua brand
            })
            .eq('id', selectedUser.id);

          success = !error;
          if (error) {
            resolve({ success: false, message: `Failed to update subscription: ${error.message}` });
            return;
          }
        } else {
          // Fallback to duration-based update
          success = await updateUserSubscription(selectedUser.id, subscriptionDuration);
        }
      } else {
        success = await updateUserStatus(selectedUser.id, targetStatus);
      }
      resolve({ success });
    });

    // Token update logic
    const tokenPromise = new Promise<{ success: boolean; message?: string }>(async (resolve) => {
      const currentToken = selectedUser.personal_auth_token || '';
      const newToken = personalToken.trim();
      if (newToken === currentToken) return resolve({ success: true });

      const result = await saveUserPersonalAuthToken(selectedUser.id, newToken || null);
      if (result.success === false) {
        resolve({ success: false, message: result.message });
      } else {
        resolve({ success: true });
      }
    });
    
    const batchPromise = updateUserBatch02(selectedUser.id, batch02.trim() || null);

    const [statusResult, tokenResult, batchResult] = await Promise.all([statusPromise, tokenPromise, batchPromise]);

    const errorMessages = [];
    if (!statusResult.success) {
      errorMessages.push(statusResult.message || 'Failed to update status.');
    }
    if (tokenResult.success === false) {
      errorMessages.push(tokenResult.message || 'Failed to update token.');
    }
    if (!batchResult) {
      errorMessages.push('Failed to update batch.');
    }

    if (errorMessages.length > 0) {
      showStatusMessage('error', errorMessages.join(' '));
    } else {
      showStatusMessage('success', `User ${selectedUser.email} updated successfully.`);
      fetchData();
    }

    setEditModalOpen(false);
    setSelectedUser(null);
  };

  const handleForceLogout = () => {
    if (!selectedUser) return;
    setIsConfirmLogoutOpen(true);
  };

  const executeForceLogout = async () => {
    if (!selectedUser) return;
    
    if (await forceUserLogout(selectedUser.id)) {
      await fetchData();
      showStatusMessage('success', `Session for ${selectedUser.email} has been terminated.`);
    } else {
      showStatusMessage('error', 'Failed to terminate session.');
    }
    setEditModalOpen(false);
    setIsConfirmLogoutOpen(false);
    setSelectedUser(null);
  };

  const handleRemoveUser = () => {
    if (!selectedUser) return;
    setIsConfirmRemoveOpen(true);
  };
  
  const executeRemoveUser = async () => {
    if (!selectedUser) return;
    
    const result = await removeUser(selectedUser.id);
    if (result.success) {
      showStatusMessage('success', `User ${selectedUser.email} has been removed.`);
      fetchData();
    } else {
      showStatusMessage('error', `Failed to remove user: ${result.message}`);
    }
    setEditModalOpen(false);
    setIsConfirmRemoveOpen(false);
    setSelectedUser(null);
  };

  const filteredUsers = useMemo(() => {
    const filtered = users.filter((user: EnhancedUser) => {
      const search = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        user.email?.toLowerCase().includes(search) ||
        user.username?.toLowerCase().includes(search) ||
        user.email_code?.toLowerCase().includes(search) ||
        user.flow_account_email?.toLowerCase().includes(search);

      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'good' && user.cookie_status === 'good') ||
        (statusFilter === 'needs_attention' && (user.cookie_status === 'warning' || user.cookie_status === 'expired')) ||
        (statusFilter === 'none' && (user.cookie_status === 'missing' || !user.cookie_status));

      const matchesFlowCode = flowCodeFilter === 'all' ||
        (flowCodeFilter === 'active' && user.email_code && user.email_code.trim() !== '') ||
        (flowCodeFilter === 'none' && (!user.email_code || user.email_code.trim() === '')) ||
        (flowCodeFilter !== 'all' && flowCodeFilter !== 'active' && flowCodeFilter !== 'none' && user.email_code === flowCodeFilter);

      const matchesAccountStatus = accountStatusFilter === 'all' ||
        (accountStatusFilter === 'active' && user.token_ultra_status === 'active') ||
        (accountStatusFilter === 'expiring_soon' && user.token_ultra_status === 'expiring_soon') ||
        (accountStatusFilter === 'expired' && user.token_ultra_status === 'expired') ||
        (accountStatusFilter === 'none' && (!user.token_ultra_status || user.token_ultra_status === null));

      return matchesSearch && matchesStatus && matchesFlowCode && matchesAccountStatus;
    });

    // Sort by last login (most recent first) when showing active users
    if (flowCodeFilter === 'active') {
      return filtered.sort((a, b) => {
        const aLastSeen = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
        const bLastSeen = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
        return bLastSeen - aLastSeen; // Descending order (most recent first)
      });
    }

    return filtered;
  }, [users, searchTerm, statusFilter, flowCodeFilter, accountStatusFilter]);

  const usersWithoutEmail = users.filter((u: EnhancedUser) => u.missing_email);

  // Get unique flow codes for filter dropdown
  const uniqueFlowCodes = useMemo(() => {
    const codes = new Set<string>();
    users.forEach((user: EnhancedUser) => {
      if (user.email_code && user.email_code.trim()) {
        codes.add(user.email_code);
      }
    });
    return Array.from(codes).sort();
  }, [users]);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'good':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Good</span>;
      case 'warning':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300">Needs Attention</span>;
      case 'expired':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">Expired</span>;
      case 'missing':
      default:
        return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300">None</span>;
    }
  };

  const getTokenUltraStatusBadge = (status?: 'active' | 'expiring_soon' | 'expired' | null) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Active</span>;
      case 'expiring_soon':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300">Expiring Soon</span>;
      case 'expired':
        return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">Expired</span>;
      case null:
      default:
        return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300">-</span>;
    }
  };

  const getUserStatusBadge = (user: EnhancedUser) => {
    const statusInfo = formatStatus(user);
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColors[statusInfo.color]}`}>
        {statusInfo.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm h-full overflow-y-auto">

      {/* Warning Alert for Users Without Email */}
      {usersWithoutEmail.length > 0 && (
        <div className="mb-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h5 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-1">
                Attention: {usersWithoutEmail.length} Users Without Email
              </h5>
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                There are <strong>{usersWithoutEmail.length}</strong> users from Supabase who do not have an email address.
                These users cannot be managed until an email is added.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Message */}
      {statusMessage && (
        <div className={`p-3 rounded-md mb-4 text-sm ${statusMessage.type === 'loading' ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200' : statusMessage.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'}`}>
          {statusMessage.message}
        </div>
      )}

      {/* Page Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-white">User Management</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Total: <strong>{users.length}</strong> users
              {usersWithoutEmail.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 rounded text-xs font-semibold">
                  {usersWithoutEmail.length} without email
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddUserModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add New User
            </button>
            <div className="flex items-center gap-2 text-sm bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 font-semibold py-2 px-3 rounded-lg">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <span>{activeUsersCount} Active Users</span>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
            Search Users:
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={`Search by email, username, flow account code (${BRAND_CONFIG.name === 'ESAIE' ? 'E1, E2, E3' : 'G1, G2, G3'}) or flow account email...`}
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 pl-10 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
              />
              <UsersIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {searchTerm || statusFilter !== 'all' || flowCodeFilter !== 'all' || accountStatusFilter !== 'all' ? (
              <span>
                Filtered: <strong>{filteredUsers.length}</strong> users
                {searchTerm && ` (search: "${searchTerm}")`}
                {statusFilter !== 'all' && ` (cookie status: ${statusFilter})`}
                {flowCodeFilter !== 'all' && ` (flow code: ${flowCodeFilter === 'none' ? 'None' : flowCodeFilter === 'active' ? 'Active User' : flowCodeFilter})`}
                {accountStatusFilter !== 'all' && ` (account status: ${accountStatusFilter === 'none' ? 'None' : accountStatusFilter === 'expiring_soon' ? 'Expiring Soon' : accountStatusFilter})`}
              </span>
            ) : (
              <span>Total: <strong>{users.length}</strong> users</span>
            )}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">#</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Email</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">
                <div className="flex flex-col gap-1">
                  <span>Flow Code</span>
                  <select
                    value={flowCodeFilter}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFlowCodeFilter(e.target.value)}
                    className="text-xs px-2 py-1 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="all">All User</option>
                    <option value="active">Active User</option>
                    <option value="none">None</option>
                    {uniqueFlowCodes.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
              </th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">
                <div className="flex flex-col gap-1">
                  <span>Cookie Status</span>
                  <select
                    value={statusFilter}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as 'all' | 'good' | 'needs_attention' | 'none')}
                    className="text-xs px-2 py-1 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="all">All</option>
                    <option value="good">Good</option>
                    <option value="needs_attention">Needs Attention</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">
                <div className="flex flex-col gap-1">
                  <span>Account Status</span>
                  <select
                    value={accountStatusFilter}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAccountStatusFilter(e.target.value as 'all' | 'active' | 'expiring_soon' | 'expired' | 'none')}
                    className="text-xs px-2 py-1 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="expiring_soon">Expiring Soon</option>
                    <option value="expired">Expired</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Requests</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Expired Date</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Last Login</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Device</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Token</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user: EnhancedUser, index: number) => {
              let activeInfo: { text: string; color: 'green' | 'gray' | 'red'; fullDate: string; } = { text: 'Never', color: 'red', fullDate: 'N/A' };
              if (user.last_seen_at) {
                const lastSeenDate = new Date(user.last_seen_at);
                const diffMinutes = (new Date().getTime() - lastSeenDate.getTime()) / (1000 * 60);
                if (diffMinutes < 60) {
                  activeInfo = { text: 'Active now', color: 'green', fullDate: lastSeenDate.toLocaleString() };
                } else {
                  activeInfo = { text: getTimeAgo(lastSeenDate), color: 'gray', fullDate: lastSeenDate.toLocaleString() };
                }
              }
              const activeStatusColors: Record<'green' | 'gray' | 'red', string> = {
                green: 'bg-green-500',
                gray: 'bg-neutral-400',
                red: 'bg-red-500',
              };

              const expiresAt = user.expires_at ? new Date(user.expires_at) : null;
              const isExpired = expiresAt ? expiresAt < new Date() : false;

              return (
                <tr
                  key={user.id}
                  className={`border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${
                    user.missing_email ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                  }`}
                >
                  <td className="p-3 font-medium text-neutral-600 dark:text-neutral-400">{index + 1}</td>
                  <td className="p-3">
                    {user.missing_email ? (
                      <span className="text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                        <AlertTriangleIcon className="w-4 h-4" />
                        No Email
                      </span>
                    ) : (
                      <div>
                        <div className="text-neutral-900 dark:text-white">{user.email || '-'}</div>
                        {user.username && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">@{user.username}</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {user.email_code ? (
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-xs font-semibold">
                        {user.email_code}
                      </span>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    {user.missing_email ? (
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300">
                        No Access
                      </span>
                    ) : (
                      getStatusBadge(user.cookie_status)
                    )}
                  </td>
                  <td className="p-3">
                    {getTokenUltraStatusBadge(user.token_ultra_status)}
                  </td>
                  <td className="p-3">
                    {user.missing_email ? (
                      <span className="text-neutral-400">-</span>
                    ) : (
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-xs font-semibold">
                        {user.usage_count || 0}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {expiresAt ? (
                      <div className={`text-sm ${isExpired ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-neutral-600 dark:text-neutral-400'}`}>
                        {expiresAt.toLocaleDateString()}
                        <div className="text-xs text-neutral-500">{expiresAt.toLocaleTimeString()}</div>
                      </div>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2" title={`Last seen: ${activeInfo.fullDate}`}>
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${activeStatusColors[activeInfo.color]}`}></span>
                      <span className="text-xs">{activeInfo.text}</span>
                    </div>
                  </td>
                  <td className="p-3 text-xs font-mono text-neutral-600 dark:text-neutral-300">
                    {user.last_device || '-'}
                  </td>
                  <td className="p-3 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                    {user.personal_auth_token ? `...${user.personal_auth_token.slice(-6)}` : '-'}
                  </td>
                  <td className="p-3">
                    {user.missing_email ? (
                      <span className="text-xs text-neutral-400">No email</span>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEditModal(user)}
                          className="px-2 py-1 bg-primary-100 dark:bg-primary-900/50 text-primary-800 dark:text-primary-300 rounded text-xs font-semibold hover:bg-primary-200 dark:hover:bg-primary-900/70"
                          title="Edit User"
                        >
                          <PencilIcon className="w-4 h-4 inline" />
                        </button>
                        {!user.email_code ? (
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setAssignModalOpen(true);
                            }}
                            className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded text-xs font-semibold hover:bg-green-200 dark:hover:bg-green-900/70"
                            title="Auto Assign Flow Account"
                          >
                            <PlusIcon className="w-4 h-4 inline" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUnassignFlowAccount(user)}
                            className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 rounded text-xs font-semibold hover:bg-yellow-200 dark:hover:bg-yellow-900/70"
                            title="Unassign Flow Account"
                          >
                            <XIcon className="w-4 h-4 inline" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setGrabCookieModalOpen(true);
                          }}
                          className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-xs font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/70"
                          title="Grab Cookie from Google"
                        >
                          <KeyIcon className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setDeleteModalOpen(true);
                          }}
                          className="px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 rounded text-xs font-semibold hover:bg-red-200 dark:hover:bg-red-900/70"
                          title="Delete User"
                        >
                          <TrashIcon className="w-4 h-4 inline" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            {searchTerm || statusFilter !== 'all' || flowCodeFilter !== 'all' ? 'No users found matching filters' : 'No users found'}
          </div>
        )}
      </div>

      {/* Edit User Modal - Comprehensive from AdminDashboardView */}
      {editModalOpen && selectedUser && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Edit User</h3>
              <button onClick={() => setEditModalOpen(false)} className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="mb-4 text-sm">Updating profile for <span className="font-semibold">{selectedUser.email}</span>.</p>
            <div className="space-y-4">
              <div>
                <label htmlFor="status-select" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Account Status
                </label>
                <select
                  id="status-select"
                  value={newStatus}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewStatus(e.target.value as UserStatus)}
                  className="w-full bg-neutral-50 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="trial">Trial</option>
                  <option value="subscription">Subscription</option>
                  <option value="lifetime">Lifetime</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label htmlFor="token-input" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Personal Auth Token
                </label>
                <input
                  id="token-input"
                  type="text"
                  value={personalToken}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPersonalToken(e.target.value)}
                  placeholder="User's personal __SESSION token"
                  className="w-full bg-neutral-50 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="batch-input" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Batch 02
                </label>
                <input
                  id="batch-input"
                  type="text"
                  value={batch02}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBatch02(e.target.value)}
                  placeholder="batch_02 or leave empty"
                  className="w-full bg-neutral-50 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
              {/* Flow Account Assignment */}
              {!selectedUser.email_code ? (
                <div>
                  <FlowAccountSelector
                    flowAccounts={flowAccounts}
                    selectedCode={selectedFlowAccountCode}
                    assignMode={assignMode}
                    onCodeChange={setSelectedFlowAccountCode}
                    onModeChange={setAssignMode}
                    disabled={isAssigningEmailCode === selectedUser.id}
                    label="Flow Account"
                  />
                  <button
                    onClick={async () => {
                      if (!selectedUser) return;
                      
                      if (assignMode === 'manual' && !selectedFlowAccountCode) {
                        showStatusMessage('error', 'Please select a flow account', 3000);
                        return;
                      }

                      setIsAssigningEmailCode(selectedUser.id);
                      const sortedAccounts = [...flowAccounts].sort((a, b) => 
                        a.current_users_count - b.current_users_count
                      );
                      const codeToUse = selectedFlowAccountCode || (sortedAccounts[0]?.code);
                      const result = await assignEmailCodeToUser(selectedUser.id, codeToUse);
                      if (result.success) {
                        showStatusMessage('success', `Assigned ${result.emailCode} to user`);
                        fetchData();
                        setEditModalOpen(false);
                      } else {
                        showStatusMessage('error', result.message || 'Failed to assign flow account');
                      }
                      setIsAssigningEmailCode(null);
                    }}
                    disabled={isAssigningEmailCode === selectedUser.id || (assignMode === 'manual' && !selectedFlowAccountCode) || flowAccounts.length === 0}
                    className="w-full mt-3 py-2.5 px-4 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isAssigningEmailCode === selectedUser.id ? 'Assigning...' : 'Assign Flow Account'}
                  </button>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Current Flow Account Code
                  </label>
                  <div className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 font-mono font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
                    {selectedUser.email_code}
                  </div>
                  
                  <FlowAccountSelector
                    flowAccounts={flowAccounts}
                    selectedCode={selectedFlowAccountCode}
                    assignMode={assignMode}
                    onCodeChange={setSelectedFlowAccountCode}
                    onModeChange={setAssignMode}
                    disabled={isAssigningEmailCode === selectedUser.id}
                    label="Reassign Flow Account"
                    showReassign={true}
                  />
                  
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={async () => {
                        if (!selectedUser) return;
                        if (!confirm(`Are you sure you want to reset flow account for this user?`)) return;
                        setIsAssigningEmailCode(selectedUser.id);
                        const result = await resetEmailCodeFromUser(selectedUser.id);
                        if (result.success) {
                          showStatusMessage('success', 'Flow account code reset successfully');
                          fetchData();
                          setEditModalOpen(false);
                        } else {
                          showStatusMessage('error', result.message || 'Failed to reset email code');
                        }
                        setIsAssigningEmailCode(null);
                      }}
                      disabled={isAssigningEmailCode === selectedUser.id}
                      className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-neutral-600 dark:bg-neutral-500 rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {isAssigningEmailCode === selectedUser.id ? 'Resetting...' : 'Reset'}
                    </button>
                    
                    <button
                      onClick={async () => {
                        console.log('[UserManagementView] ⚡ Reassign button clicked!', {
                          hasSelectedUser: !!selectedUser,
                          selectedUserId: selectedUser?.id,
                          assignMode,
                          selectedFlowAccountCode,
                          flowAccountsLength: flowAccounts.length,
                          isAssigningEmailCode: isAssigningEmailCode
                        });
                        
                        if (!selectedUser) {
                          console.error('[UserManagementView] ❌ No selected user!');
                          return;
                        }
                        
                        if (assignMode === 'manual' && !selectedFlowAccountCode) {
                          console.warn('[UserManagementView] ⚠️ Manual mode but no flow account selected');
                          showStatusMessage('error', 'Please select a flow account', 3000);
                          return;
                        }
                        
                        console.log('[UserManagementView] ✅ Starting reassignment process...');
                        setIsAssigningEmailCode(selectedUser.id);
                        
                        console.log('[UserManagementView] Reassigning flow account:', {
                          userId: selectedUser.id,
                          userEmail: selectedUser.email,
                          currentCode: selectedUser.email_code || 'none',
                          assignMode
                        });
                        
                        const resetResult = await resetEmailCodeFromUser(selectedUser.id);
                        if (!resetResult.success) {
                          console.error('[UserManagementView] Reset failed:', resetResult);
                          showStatusMessage('error', resetResult.message || 'Failed to reset email code');
                          setIsAssigningEmailCode(null);
                          return;
                        }
                        console.log('[UserManagementView] Reset successful, now assigning new code');
                        
                        const sortedAccounts = [...flowAccounts].sort((a, b) => 
                          a.current_users_count - b.current_users_count
                        );
                        
                        // Fix: Respect assignMode - manual mode must use selectedFlowAccountCode
                        let codeToUse: string;
                        if (assignMode === 'manual') {
                          // Manual mode: must use selectedFlowAccountCode (already validated above)
                          codeToUse = selectedFlowAccountCode;
                        } else {
                          // Auto mode: use first available account
                          codeToUse = sortedAccounts[0]?.code || '';
                        }
                        
                        if (!codeToUse) {
                          console.error('[UserManagementView] No flow account available');
                          showStatusMessage('error', 'No available flow account found');
                          setIsAssigningEmailCode(null);
                          return;
                        }
                        
                        console.log('[UserManagementView] Assigning new code:', {
                          userId: selectedUser.id,
                          userEmail: selectedUser.email,
                          newCode: codeToUse,
                          assignMode,
                          selectedFlowAccountCode
                        });
                        
                        const assignResult = await assignEmailCodeToUser(selectedUser.id, codeToUse);
                        
                        console.log('[UserManagementView] Assign result:', assignResult);
                        if (assignResult.success) {
                          showStatusMessage('success', `Reassigned ${assignResult.emailCode} to user`);
                          fetchData();
                          setEditModalOpen(false);
                        } else {
                          showStatusMessage('error', assignResult.message || 'Failed to reassign flow account');
                        }
                        setIsAssigningEmailCode(null);
                      }}
                      disabled={isAssigningEmailCode === selectedUser.id || (assignMode === 'manual' && !selectedFlowAccountCode) || flowAccounts.length === 0}
                      className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      onMouseEnter={() => {
                        console.log('[UserManagementView] 🔍 Button hover state:', {
                          isDisabled: isAssigningEmailCode === selectedUser?.id || (assignMode === 'manual' && !selectedFlowAccountCode) || flowAccounts.length === 0,
                          isAssigningEmailCode: isAssigningEmailCode,
                          selectedUserId: selectedUser?.id,
                          assignMode,
                          selectedFlowAccountCode,
                          flowAccountsLength: flowAccounts.length
                        });
                      }}
                    >
                      {isAssigningEmailCode === selectedUser.id ? 'Reassigning...' : 'Reassign'}
                    </button>
                  </div>
                </div>
              )}
              {newStatus === 'subscription' && (
                <div className="mt-4 p-3 bg-neutral-100 dark:bg-neutral-700/50 rounded-md">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Subscription Expiry
                  </label>
                  <div className="flex gap-4 mb-3">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="editExpiryMode"
                        value="duration"
                        checked={editSubscriptionExpiryMode === 'duration'}
                        onChange={() => setEditSubscriptionExpiryMode('duration')}
                        className="form-radio"
                      />
                      <span className="ml-2">Duration</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="editExpiryMode"
                        value="manual"
                        checked={editSubscriptionExpiryMode === 'manual'}
                        onChange={() => setEditSubscriptionExpiryMode('manual')}
                        className="form-radio"
                      />
                      <span className="ml-2">Manual Date</span>
                    </label>
                  </div>

                  {editSubscriptionExpiryMode === 'duration' && (
                    <div className="flex gap-4">
                      <label className="flex items-center">
                        <input type="radio" name="editDuration" value={1} checked={subscriptionDuration === 1} onChange={() => setSubscriptionDuration(1)} className="form-radio" />
                        <span className="ml-2">1 Month</span>
                      </label>
                      <label className="flex items-center">
                        <input type="radio" name="editDuration" value={6} checked={subscriptionDuration === 6} onChange={() => setSubscriptionDuration(6)} className="form-radio" />
                        <span className="ml-2">6 Months</span>
                      </label>
                      <label className="flex items-center">
                        <input type="radio" name="editDuration" value={12} checked={subscriptionDuration === 12} onChange={() => setSubscriptionDuration(12)} className="form-radio" />
                        <span className="ml-2">12 Months</span>
                      </label>
                    </div>
                  )}

                  {editSubscriptionExpiryMode === 'manual' && (
                    <div>
                      <input
                        type="date"
                        value={editManualExpiryDate}
                        onChange={(e) => setEditManualExpiryDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                      />
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        Select expiry date for subscription
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Action Buttons Section */}
            <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700">
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={handleForceLogout}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-neutral-600 dark:bg-neutral-500 rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-400 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <XIcon className="w-4 h-4" />
                  Logout
                </button>
                <button
                  onClick={handleRemoveUser}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <TrashIcon className="w-4 h-4" />
                  Remove
                </button>
                <button
                  onClick={() => setEditModalOpen(false)}
                  className="w-full px-4 py-2.5 text-sm font-semibold bg-neutral-200 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-500 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChanges}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-all shadow-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
        , document.body
      )}

      {/* Assign Flow Account Modal */}
      {assignModalOpen && selectedUser && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-zoomIn" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 border-[0.5px] border-neutral-200/80 dark:border-neutral-800/80">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">Assign Flow Account</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Select a flow account to assign to user <strong>{selectedUser.email}</strong>
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
                Flow Account
              </label>
              <select
                value={selectedFlowAccountCode}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedFlowAccountCode(e.target.value)}
                className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">-- Select Flow Account --</option>
                {flowAccounts
                  .filter(acc => acc.status === 'active')
                  .map(acc => {
                    const MAX_USERS = 10; // Hardcoded limit (same as FlowAccountManagementView table)
                    return (
                      <option key={acc.code} value={acc.code}>
                        {acc.code} - {acc.email} ({acc.current_users_count || 0}/{MAX_USERS})
                      </option>
                    );
                  })}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setAssignModalOpen(false);
                  setSelectedUser(null);
                  setSelectedFlowAccountCode('');
                }}
                className="px-4 py-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!selectedFlowAccountCode) {
                    alert('Please select a flow account');
                    return;
                  }
                  handleAssignFlowAccount(selectedUser, selectedFlowAccountCode);
                }}
                className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Assign
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Grab Cookie Modal */}
      {grabCookieModalOpen && selectedUser && createPortal(
        <ConfirmationModal
          isOpen={grabCookieModalOpen}
          onCancel={() => {
            setGrabCookieModalOpen(false);
            setSelectedUser(null);
          }}
          onConfirm={handleGrabCookie}
          title="Grab Cookie"
          message={`Grab cookie from Google for user ${selectedUser.email}? A browser will open for login.`}
          confirmText={grabCookieLoading ? "Grabbing..." : "Grab Cookie"}
          cancelText="Cancel"
          confirmButtonClass="bg-blue-600 hover:bg-blue-700"
          language={language}
        />,
        document.body
      )}

      {/* Delete User Modal */}
      {deleteModalOpen && createPortal(
        <ConfirmationModal
          isOpen={deleteModalOpen}
          onCancel={() => {
            setDeleteModalOpen(false);
            setSelectedUser(null);
          }}
          onConfirm={handleDelete}
          title="Delete User"
          message={`Are you sure you want to delete user ${selectedUser?.email}? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          language={language}
        />,
        document.body
      )}

      {/* Force Logout Confirmation */}
      {isConfirmLogoutOpen && selectedUser && createPortal(
        <ConfirmationModal
          isOpen={isConfirmLogoutOpen}
          title="Confirm Force Logout"
          message={`Are you sure you want to terminate ${selectedUser.email}'s current session? They will be logged out immediately, but their account will remain active.`}
          onConfirm={executeForceLogout}
          onCancel={() => setIsConfirmLogoutOpen(false)}
          confirmText="Logout"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          language={language}
        />,
        document.body
      )}

      {/* Remove User Confirmation */}
      {isConfirmRemoveOpen && selectedUser && createPortal(
        <ConfirmationModal
          isOpen={isConfirmRemoveOpen}
          title="Confirm Remove User"
          message={`Are you sure you want to permanently remove ${selectedUser.email}? This action cannot be undone.`}
          onConfirm={executeRemoveUser}
          onCancel={() => setIsConfirmRemoveOpen(false)}
          confirmText="Remove User"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          language={language}
        />,
        document.body
      )}

      {/* Add User Modal */}
      {isAddUserModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 border-[0.5px] border-neutral-200/80 dark:border-neutral-800/80">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Add New User to Token Management</h3>
              <button 
                onClick={() => {
                  setIsAddUserModalOpen(false);
                  setNewUserEmail('');
                  setNewUserFullName('');
                  setNewUserPhone('');
                  setNewUserNotes('');
                  setSelectedFlowAccountCode('');
                  setAddUserAssignMode('auto');
                  setSubscriptionExpiryMode('duration');
                  setAddUserSubscriptionDuration(6);
                  setAddUserManualExpiryDate('');
                }} 
                className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            
            {/* Status Message in Modal */}
            {statusMessage && statusMessage.type !== 'loading' && (
              <div className={`p-3 rounded-md mb-4 text-sm ${
                statusMessage.type === 'success' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' 
                  : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
              }`}>
                {statusMessage.message}
              </div>
            )}
            
            {statusMessage && statusMessage.type === 'loading' && (
              <div className="p-3 rounded-md mb-4 text-sm bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
                {statusMessage.message}
              </div>
            )}
            
            <div className="space-y-4 mb-6">
              {/* Full Name Field */}
              <div>
                <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newUserFullName}
                  onChange={(e) => setNewUserFullName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  required
                />
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  required
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  User will be created automatically if not found in users table
                </p>
              </div>

              {/* Phone Field */}
              <div>
                <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  placeholder="+60123456789"
                  className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  required
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Include country code (e.g., +60 for Malaysia)
                </p>
              </div>

              <div>
                <FlowAccountSelector
                  flowAccounts={flowAccounts}
                  selectedCode={selectedFlowAccountCode}
                  assignMode={addUserAssignMode}
                  onCodeChange={setSelectedFlowAccountCode}
                  onModeChange={setAddUserAssignMode}
                  disabled={addUserLoading}
                  label="Flow Account"
                />
                {flowAccounts.length === 0 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    ⚠️ No flow accounts found. Please add flow accounts first.
                  </p>
                )}
              </div>

              <div className="mt-4 p-3 bg-neutral-100 dark:bg-neutral-700/50 rounded-md">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Subscription Expiry
                </label>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="expiryMode"
                      value="duration"
                      checked={subscriptionExpiryMode === 'duration'}
                      onChange={() => setSubscriptionExpiryMode('duration')}
                      className="form-radio"
                    />
                    <span className="ml-2">Duration</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="expiryMode"
                      value="manual"
                      checked={subscriptionExpiryMode === 'manual'}
                      onChange={() => setSubscriptionExpiryMode('manual')}
                      className="form-radio"
                    />
                    <span className="ml-2">Manual Date</span>
                  </label>
                </div>

                {subscriptionExpiryMode === 'duration' && (
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="duration"
                        value={1}
                        checked={addUserSubscriptionDuration === 1}
                        onChange={() => setAddUserSubscriptionDuration(1)}
                        className="form-radio"
                      />
                      <span className="ml-2">1 Month</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="duration"
                        value={6}
                        checked={addUserSubscriptionDuration === 6}
                        onChange={() => setAddUserSubscriptionDuration(6)}
                        className="form-radio"
                      />
                      <span className="ml-2">6 Months</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="duration"
                        value={12}
                        checked={addUserSubscriptionDuration === 12}
                        onChange={() => setAddUserSubscriptionDuration(12)}
                        className="form-radio"
                      />
                      <span className="ml-2">12 Months</span>
                    </label>
                  </div>
                )}

                {subscriptionExpiryMode === 'manual' && (
                  <div>
                    <input
                      type="date"
                      value={addUserManualExpiryDate}
                      onChange={(e) => setAddUserManualExpiryDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      Select expiry date for subscription
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
                  Notes (Optional)
                </label>
                <textarea
                  value={newUserNotes}
                  onChange={(e) => setNewUserNotes(e.target.value)}
                  placeholder="Additional notes..."
                  rows={3}
                  className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsAddUserModalOpen(false);
                  setNewUserEmail('');
                  setNewUserFullName('');
                  setNewUserPhone('');
                  setNewUserNotes('');
                  setSelectedFlowAccountCode('');
                  setAddUserAssignMode('auto');
                  setSubscriptionExpiryMode('duration');
                  setAddUserSubscriptionDuration(6);
                  setAddUserManualExpiryDate('');
                }}
                className="px-4 py-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  console.log('[UserManagementView] Add User button clicked');
                  handleAddUser(e);
                }}
                disabled={addUserLoading}
                className="px-4 py-2 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addUserLoading ? 'Adding...' : 'Add User'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default UserManagementView;