import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getBackendCookies, grabCookie, autoGenerateCookie, getAutoCookieSchedule, setAutoCookieSchedule, runAutoCookieNow, getAutoCookieRunStatus, type BackendCookie, type AutoCookieSchedule, type AutoCookieRunStatus } from '../../../services/tokenBackendService';
import { getAllFlowAccounts, addFlowAccount, updateFlowAccount, removeFlowAccount, recalculateFlowAccountCounts, type FlowAccount } from '../../../services/flowAccountService';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import { CheckCircleIcon, AlertTriangleIcon, XIcon, KeyIcon, PencilIcon, TrashIcon, RefreshCwIcon, PlusIcon, EyeIcon, EyeOffIcon, ClipboardIcon } from '../../Icons';
import ConfirmationModal from '../../common/ConfirmationModal';
import { BRAND_CONFIG } from '../../../services/brandConfig';

interface FlowAccountManagementViewProps {
  language: Language;
}

const FlowAccountManagementView: React.FC<FlowAccountManagementViewProps> = ({ language }) => {
  const [supabaseAccounts, setSupabaseAccounts] = useState<FlowAccount[]>([]);
  const [cookiesByFolder, setCookiesByFolder] = useState<Record<string, BackendCookie[]>>({});
  const [loading, setLoading] = useState(true);
  const [grabCookieModalOpen, setGrabCookieModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<FlowAccount | null>(null);
  const [grabLoading, setGrabLoading] = useState(false);
  const [autoGenerateLoading, setAutoGenerateLoading] = useState<Record<string, boolean>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Form state
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newCode, setNewCode] = useState('');
  
  // Edit form state
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [selectedSupabaseAccount, setSelectedSupabaseAccount] = useState<FlowAccount | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [shouldStopGeneration, setShouldStopGeneration] = useState(false);
  const [isSelectAccountsModalOpen, setIsSelectAccountsModalOpen] = useState(false);
  const [selectedAccountCodes, setSelectedAccountCodes] = useState<string[]>([]);
  const [generationProgress, setGenerationProgress] = useState<{
    current: string;
    total: number;
    completed: number;
    status: string;
  } | null>(null);
  const [autoSchedule, setAutoSchedule] = useState<AutoCookieSchedule>({ enabled: false, interval_hours: 4, next_run: null });
  const [autoScheduleLoading, setAutoScheduleLoading] = useState(false);
  const [runNowLoading, setRunNowLoading] = useState(false);
  const [runStatus, setRunStatus] = useState<AutoCookieRunStatus>({ status: 'idle', total: 0, completed: 0, current: '', message: '' });
  const runStatusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    getAutoCookieSchedule().then(setAutoSchedule).catch(() => {
      setAutoSchedule({ enabled: false, interval_hours: 4, next_run: null });
    });
    getAutoCookieRunStatus().then(setRunStatus).catch(() => {});
  }, []);

  // Poll run-status while backend reports running; on completed/failed refresh list and stop
  useEffect(() => {
    if (runStatus.status !== 'running') {
      if (runStatusPollRef.current) {
        clearInterval(runStatusPollRef.current);
        runStatusPollRef.current = null;
      }
      return;
    }
    const poll = async () => {
      try {
        const next = await getAutoCookieRunStatus();
        setRunStatus(next);
        if (next.status === 'completed' || next.status === 'failed') {
          if (runStatusPollRef.current) {
            clearInterval(runStatusPollRef.current);
            runStatusPollRef.current = null;
          }
          await fetchAccounts();
        }
      } catch {
        // ignore
      }
    };
    runStatusPollRef.current = setInterval(poll, 2500);
    poll(); // once immediately
    return () => {
      if (runStatusPollRef.current) {
        clearInterval(runStatusPollRef.current);
        runStatusPollRef.current = null;
      }
    };
  }, [runStatus.status]);

  // Helper function to calculate cookie pool info from cookiesByFolder
  const getCookiePoolInfo = (code: string): { cookie_count: number; cookie_pool_status: 'good' | 'needs_more' | 'none' } => {
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

  // Get next cookie number for flow account
  const getNextCookieNumber = (code: string): number => {
    const cookies = cookiesByFolder[code] || [];
    if (cookies.length === 0) return 1;
    
    // Extract numbers from existing cookies (format: flow_g1_c1.json)
    const numbers: number[] = [];
    cookies.forEach(cookie => {
      const parts = cookie.filename.replace('.json', '').split('_');
      if (parts.length >= 3 && parts[2].startsWith('c')) {
        try {
          const num = parseInt(parts[2].substring(1), 10);
          if (!isNaN(num)) {
            numbers.push(num);
          }
        } catch (e) {
          // Ignore invalid numbers
        }
      }
    });
    
    if (numbers.length === 0) return 1;
    return Math.max(...numbers) + 1;
  };

  // Extract number from code (G1, G2, G3, E1, E2, etc.)
  const extractCodeNumber = (code: string): number => {
    // Extract number from code like G1, G2, G3, E1, E2, etc.
    const match = code.match(/^[A-Z](\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    // If no match, return a large number to push to end
    return 9999;
  };

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const [supabaseData, cookiesData] = await Promise.all([
        getAllFlowAccounts(),
        getBackendCookies(),
      ]);
      setSupabaseAccounts(supabaseData);
      setCookiesByFolder(cookiesData);
    } catch (error) {
      console.error('Error fetching flow accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sort accounts by code number (G1, G2, G3, etc.)
  const sortedAccounts = useMemo(() => {
    return [...supabaseAccounts].sort((a, b) => {
      const numA = extractCodeNumber(a.code);
      const numB = extractCodeNumber(b.code);
      return numA - numB;
    });
  }, [supabaseAccounts]);

  // Generate next available code (E1, E2, E3 for ESAIE or G1, G2, G3 for MONOKLIX)
  const generateNextCode = (existingAccounts: FlowAccount[]): string => {
    const isEsaie = BRAND_CONFIG.name === 'ESAIE';
    const prefix = isEsaie ? 'E' : 'G';
    const regex = new RegExp(`^${prefix}\\d+$`);
    
    const existingCodes = existingAccounts
      .map(acc => acc.code)
      .filter(code => regex.test(code));

    const numbers = existingCodes
      .map(code => {
        const match = code.match(new RegExp(`^${prefix}(\\d+)$`));
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(num => num > 0)
      .sort((a, b) => a - b);

    let nextNumber = 1;
    if (numbers.length > 0) {
      const maxNumber = Math.max(...numbers);
      nextNumber = maxNumber + 1;
      for (let i = 1; i <= maxNumber; i++) {
        if (!numbers.includes(i)) {
          nextNumber = i;
          break;
        }
      }
    }
    return `${prefix}${nextNumber}`;
  };

  useEffect(() => {
    if (isAddModalOpen) {
      const nextCode = generateNextCode(supabaseAccounts);
      setNewCode(nextCode);
    }
  }, [isAddModalOpen, supabaseAccounts]);

  const handleAddAccount = async () => {
    if (!newEmail.trim() || !newPassword.trim()) {
      setStatusMessage({ type: 'error', message: 'Please fill in email and password' });
      return;
    }

    const codeToUse = newCode.trim() || generateNextCode(supabaseAccounts);
    const result = await addFlowAccount(newEmail, newPassword, codeToUse);
    
    if (result.success) {
      setStatusMessage({ type: 'success', message: `Flow account added successfully with code ${codeToUse}` });
      setIsAddModalOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewCode('');
      fetchAccounts();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', message: result.message });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleEditAccount = async () => {
    if (!selectedSupabaseAccount) return;

    if (!editEmail.trim()) {
      setStatusMessage({ type: 'error', message: 'Email is required' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    const updates: { email?: string; password?: string } = {};
    if (editEmail.trim() !== selectedSupabaseAccount.email) {
      updates.email = editEmail.trim();
    }
    if (editPassword.trim() && editPassword.trim() !== selectedSupabaseAccount.password) {
      updates.password = editPassword.trim();
    }

    if (Object.keys(updates).length === 0) {
      setStatusMessage({ type: 'error', message: 'No changes detected' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    const result = await updateFlowAccount(selectedSupabaseAccount.id, updates);
    
    if (result.success) {
      setStatusMessage({ type: 'success', message: 'Flow account updated successfully' });
      setIsEditModalOpen(false);
      setSelectedSupabaseAccount(null);
      setEditEmail('');
      setEditPassword('');
      fetchAccounts();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', message: result.message || 'Failed to update account' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleRemoveAccount = async () => {
    if (!selectedSupabaseAccount) return;
    const result = await removeFlowAccount(selectedSupabaseAccount.id);
    
    if (result.success) {
      setStatusMessage({ type: 'success', message: 'Flow account removed successfully' });
      setIsRemoveModalOpen(false);
      setSelectedSupabaseAccount(null);
      fetchAccounts();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', message: result.message || 'Failed to remove account' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleRecalculateCounts = async () => {
    setIsRecalculating(true);
    try {
      const result = await recalculateFlowAccountCounts();
      if (result.success) {
        setStatusMessage({ type: 'success', message: result.message });
        fetchAccounts(); // Refresh to show updated counts
      } else {
        setStatusMessage({ type: 'error', message: result.message });
      }
    } catch (error) {
      console.error('Error recalculating counts:', error);
      setStatusMessage({ type: 'error', message: 'Failed to recalculate counts' });
    } finally {
      setIsRecalculating(false);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleGrabCookie = async () => {
    if (!selectedAccount) return;
    setGrabLoading(true);
    // Get next cookie number for this flow account
    const nextNum = getNextCookieNumber(selectedAccount.code);
    const cookieName = `flow_${selectedAccount.code.toLowerCase()}_c${nextNum}`;
    const result = await grabCookie(cookieName, selectedAccount.email);
    setGrabLoading(false);
    if (result.success) {
      fetchAccounts();
      setGrabCookieModalOpen(false);
      setSelectedAccount(null);
    } else {
      alert(result.error || 'Failed to grab cookie');
    }
  };

  const handleAutoGenerateCookie = async (account: FlowAccount) => {
    setAutoGenerateLoading(prev => ({ ...prev, [account.code]: true }));
    try {
      const result = await autoGenerateCookie(account.code);
      if (result.success) {
        setStatusMessage({ type: 'success', message: `Successfully auto-generated cookie: ${result.filename || 'N/A'}` });
        fetchAccounts();
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage({ type: 'error', message: result.error || 'Failed to auto-generate cookie' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error: any) {
      setStatusMessage({ type: 'error', message: error.message || 'Failed to auto-generate cookie' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setAutoGenerateLoading(prev => ({ ...prev, [account.code]: false }));
    }
  };

  const handleGenerateAllNewCookies = async (accountsToGenerate: FlowAccount[]) => {
    if (accountsToGenerate.length === 0) {
      setStatusMessage({ 
        type: 'error', 
        message: 'Please select at least one flow account to generate cookies.' 
      });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    setShouldStopGeneration(false); // Reset stop flag
    setIsGeneratingAll(true);
    setIsSelectAccountsModalOpen(false); // Close modal
    setGenerationProgress({
      current: '',
      total: accountsToGenerate.length,
      completed: 0,
      status: 'Starting...'
    });

    try {
      for (let i = 0; i < accountsToGenerate.length; i++) {
        // Check if user wants to stop
        if (shouldStopGeneration) {
          setStatusMessage({ 
            type: 'error', 
            message: `Bulk generation stopped by user. Completed ${i} out of ${accountsToGenerate.length} accounts.` 
          });
          break;
        }

        const account = accountsToGenerate[i];
        
        setGenerationProgress({
          current: account.code,
          total: accountsToGenerate.length,
          completed: i,
          status: `Generating cookies for ${account.code}...`
        });

        let attempts = 0;
        const maxAttempts = 2; // Maximum 2 attempts per account
        let success = false;

        // Keep generating until we get cookies with count > 20
        while (attempts < maxAttempts && !success) {
          // Check if user wants to stop
          if (shouldStopGeneration) {
            break;
          }

          attempts++;
          
          setGenerationProgress({
            current: account.code,
            total: accountsToGenerate.length,
            completed: i,
            status: `Generating cookies for ${account.code} (Attempt ${attempts}/${maxAttempts})...`
          });

          try {
            const result = await autoGenerateCookie(account.code);
            
            if (result.success) {
              // Check if cookies count is sufficient (> 20)
              if (result.cookies_count && result.cookies_count > 20) {
                success = true;
                setStatusMessage({ 
                  type: 'success', 
                  message: `✅ ${account.code}: Generated ${result.cookies_count} cookies (${result.filename})` 
                });
                
                // Refresh accounts to get updated cookie info
                await fetchAccounts();
                
                // Wait a bit before showing next message
                await new Promise(resolve => setTimeout(resolve, 1000));
              } else {
                // Cookies count is insufficient, try again
                const count = result.cookies_count || 0;
                setStatusMessage({ 
                  type: 'error', 
                  message: `⚠️ ${account.code}: Only ${count} cookies (need >20). Retrying...` 
                });
                
                // Wait 3 seconds before retry
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            } else {
              // Generation failed
              setStatusMessage({ 
                type: 'error', 
                message: `❌ ${account.code}: ${result.error || 'Failed to generate cookies'}. Retrying...` 
              });
              
              // Wait 3 seconds before retry
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          } catch (error: any) {
            setStatusMessage({ 
              type: 'error', 
              message: `❌ ${account.code}: Error - ${error.message || 'Unknown error'}. Retrying...` 
            });
            
            // Wait 3 seconds before retry
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }

        if (!success) {
          setStatusMessage({ 
            type: 'error', 
            message: `❌ ${account.code}: Failed after ${maxAttempts} attempts. Skipping...` 
          });
        }

        // Check if user wants to stop before waiting
        if (shouldStopGeneration) {
          break;
        }

        // Wait 10 seconds before moving to next account (except for the last one)
        if (i < accountsToGenerate.length - 1) {
          setGenerationProgress({
            current: account.code,
            total: accountsToGenerate.length,
            completed: i + 1,
            status: `Waiting 10 seconds before next account...`
          });
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }

      // Final success message
      setStatusMessage({ 
        type: 'success', 
        message: `✅ Completed generating cookies for ${accountsToGenerate.length} flow accounts!` 
      });
      
      // Refresh accounts
      await fetchAccounts();
      
    } catch (error: any) {
      setStatusMessage({ 
        type: 'error', 
        message: `Error during bulk generation: ${error.message || 'Unknown error'}` 
      });
    } finally {
      setIsGeneratingAll(false);
      setShouldStopGeneration(false); // Reset stop flag
      setGenerationProgress(null);
      setSelectedAccountCodes([]); // Reset selection
      setTimeout(() => setStatusMessage(null), 10000);
    }
  };

  const handleOpenSelectAccountsModal = () => {
    const accountsWithUsers = sortedAccounts.filter(account => (account.current_users_count || 0) > 0);
    
    if (accountsWithUsers.length === 0) {
      setStatusMessage({ 
        type: 'error', 
        message: 'No flow accounts with users found. Please assign users to flow accounts first.' 
      });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    // Auto-select all by default
    setSelectedAccountCodes(accountsWithUsers.map(a => a.code));
    setIsSelectAccountsModalOpen(true);
  };

  const handleAccountToggle = (code: string) => {
    setSelectedAccountCodes(prev => {
      if (prev.includes(code)) {
        return prev.filter(c => c !== code);
      } else {
        return [...prev, code];
      }
    });
  };

  const handleSelectAll = () => {
    const accountsWithUsers = sortedAccounts.filter(account => (account.current_users_count || 0) > 0);
    if (selectedAccountCodes.length === accountsWithUsers.length) {
      setSelectedAccountCodes([]);
    } else {
      setSelectedAccountCodes(accountsWithUsers.map(a => a.code));
    }
  };

  const handleStartGeneration = () => {
    const accountsWithUsers = sortedAccounts.filter(account => 
      (account.current_users_count || 0) > 0 && selectedAccountCodes.includes(account.code)
    );
    
    if (accountsWithUsers.length === 0) {
      setStatusMessage({ 
        type: 'error', 
        message: 'Please select at least one flow account.' 
      });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    handleGenerateAllNewCookies(accountsWithUsers);
  };

  const handleStopGeneration = () => {
    setShouldStopGeneration(true);
    setStatusMessage({ 
      type: 'error', 
      message: 'Stopping bulk generation...' 
    });
  };

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      // Show temporary success feedback
      setStatusMessage({ type: 'success', message: 'Email copied to clipboard!' });
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
      setStatusMessage({ type: 'error', message: 'Failed to copy email' });
      setTimeout(() => setStatusMessage(null), 2000);
    }
  };

  const togglePasswordVisibility = (code: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  const getPoolStatusBadge = (status?: string, count?: number) => {
    if (status === 'good') {
      return (
        <div>
          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded text-xs font-semibold">
            {count || 0} cookies
          </span>
          <div className="text-xs text-green-600 dark:text-green-400 mt-1">Good</div>
        </div>
      );
    } else if (status === 'needs_more') {
      return (
        <div>
          <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 rounded text-xs font-semibold">
            {count || 0} cookie{count !== 1 ? 's' : ''}
          </span>
          <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Needs More</div>
        </div>
      );
    } else {
      return (
        <div>
          <span className="px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 rounded text-xs font-semibold">
            0 cookies
          </span>
          <div className="text-xs text-red-600 dark:text-red-400 mt-1">None</div>
        </div>
      );
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return dateString.substring(0, 10);
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString?: string | Date) => {
    if (!dateString) return '-';
    try {
      const d = typeof dateString === 'string' ? new Date(dateString) : dateString;
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '-';
    }
  };

  const getLastCreatedForAccount = (account: FlowAccount): string | Date | undefined => {
    const cookies = cookiesByFolder[account.code] || [];
    if (cookies.length === 0) return account.updated_at || account.created_at;
    let minAgeDays: number | null = null;
    for (const c of cookies) {
      const age = typeof c.age_days === 'number' ? c.age_days : (typeof c.age_days === 'string' && c.age_days !== 'N/A' ? parseFloat(c.age_days) : null);
      if (age !== null && !isNaN(age) && (minAgeDays === null || age < minAgeDays)) {
        minAgeDays = age;
      }
    }
    if (minAgeDays !== null) {
      return new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000);
    }
    return account.updated_at || account.created_at;
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
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-white">Flow Account Management</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Total: <strong>{supabaseAccounts.length}</strong> flow accounts
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRecalculateCounts}
              disabled={isRecalculating || isGeneratingAll}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCwIcon className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
              {isRecalculating ? 'Recalculating...' : 'Recalculate Counts'}
            </button>
            <button
              onClick={handleOpenSelectAccountsModal}
              disabled={isGeneratingAll || isRecalculating}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingAll ? (
                <>
                  <Spinner />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <KeyIcon className="w-4 h-4" />
                  <span>Bulk Generate</span>
                </>
              )}
            </button>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
              <span className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-nowrap">Auto every 4h</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoSchedule.enabled}
                disabled={autoScheduleLoading}
                onClick={async () => {
                  if (autoScheduleLoading) return;
                  setAutoScheduleLoading(true);
                  setStatusMessage(null);
                  try {
                    const next = await setAutoCookieSchedule(!autoSchedule.enabled, 4);
                    setAutoSchedule(next);
                    setStatusMessage({ type: 'success', message: next.enabled ? 'Auto-generate setiap 4 jam diaktifkan.' : 'Auto-generate setiap 4 jam dimatikan.' });
                    setTimeout(() => setStatusMessage(null), 3000);
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setStatusMessage({ type: 'error', message: msg });
                  } finally {
                    setAutoScheduleLoading(false);
                  }
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  autoSchedule.enabled ? 'bg-primary-600' : 'bg-neutral-200 dark:bg-neutral-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                    autoSchedule.enabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
              {autoSchedule.enabled && autoSchedule.next_run && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400 hidden sm:inline">
                  Next: {new Date(autoSchedule.next_run).toLocaleString()}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                if (runNowLoading) return;
                setRunNowLoading(true);
                try {
                  const result = await runAutoCookieNow();
                  if (result.success) {
                    setRunStatus({ status: 'running', total: 0, completed: 0, current: '', message: 'Starting...' });
                    setStatusMessage({ type: 'success', message: 'Run now started.' });
                    setTimeout(() => setStatusMessage(null), 3000);
                  } else {
                    setStatusMessage({ type: 'error', message: result.message || 'Failed to run' });
                  }
                } catch (e) {
                  setStatusMessage({ type: 'error', message: e instanceof Error ? e.message : 'Failed to run' });
                } finally {
                  setRunNowLoading(false);
                }
              }}
              disabled={runNowLoading || isGeneratingAll || runStatus.status === 'running'}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-600 text-white text-sm font-semibold rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {runNowLoading ? <Spinner /> : null}
              <span>{runNowLoading ? 'Starting...' : 'Run now'}</span>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add Flow Account
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className={`mb-4 p-3 rounded-lg ${
            statusMessage.type === 'success' 
              ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200' 
              : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircleIcon className="w-5 h-5" />
              ) : (
                <XIcon className="w-5 h-5" />
              )}
              <span>{statusMessage.message}</span>
            </div>
          </div>
        )}

        {runStatus.status !== 'idle' && (
          <div className={`mb-4 p-4 rounded-lg border ${
            runStatus.status === 'running'
              ? 'bg-blue-50 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800'
              : runStatus.status === 'completed'
                ? 'bg-green-50 dark:bg-green-900/50 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/50 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-semibold ${
                runStatus.status === 'running' ? 'text-blue-800 dark:text-blue-200'
                : runStatus.status === 'completed' ? 'text-green-800 dark:text-green-200'
                : 'text-red-800 dark:text-red-200'
              }`}>
                Auto Run Every 4h — {runStatus.status === 'running' ? 'In progress' : runStatus.status === 'completed' ? 'Done' : 'Failed'}
              </span>
              {(runStatus.status === 'running' && runStatus.total > 0) && (
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  {runStatus.completed} / {runStatus.total}
                </span>
              )}
            </div>
            {runStatus.status === 'running' && runStatus.total > 0 && (
              <>
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(runStatus.completed / runStatus.total) * 100}%` }}
                  />
                </div>
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <div><strong>Current:</strong> {runStatus.current || 'N/A'}</div>
                  <div><strong>Status:</strong> {runStatus.message}</div>
                </div>
              </>
            )}
            {(runStatus.status === 'completed' || runStatus.status === 'failed') && (
              <p className={`text-sm ${
                runStatus.status === 'completed' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
              }`}>
                {runStatus.status === 'completed' ? `${runStatus.completed} account(s) processed. Cookie list refreshed.` : runStatus.message}
              </p>
            )}
          </div>
        )}

        {generationProgress && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                Generating Cookies for All Accounts
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  {generationProgress.completed} / {generationProgress.total}
                </span>
                <button
                  onClick={handleStopGeneration}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
                >
                  Stop
                </button>
              </div>
            </div>
            <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mb-2">
              <div 
                className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(generationProgress.completed / generationProgress.total) * 100}%` }}
              />
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <div><strong>Current:</strong> {generationProgress.current || 'N/A'}</div>
              <div><strong>Status:</strong> {generationProgress.status}</div>
            </div>
          </div>
        )}
      </div>

      {/* Flow Accounts Table */}
      {sortedAccounts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Code</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Email</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Password</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Assigned Users</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Available Slots</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Cookie Pool</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Last Created</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.map((account) => {
                const currentUsersCount = account.current_users_count || 0;
                const MAX_USERS = 10; // Hardcoded limit (max_users column doesn't exist in DB)
                const availableSlots = MAX_USERS - currentUsersCount;
                const poolInfo = getCookiePoolInfo(account.code);

                return (
                  <tr
                    key={account.code}
                    className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <td className="p-3">
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-sm font-semibold">
                        {account.code}
                      </span>
                    </td>
                    <td className="p-3">
                      <code className="text-sm text-neutral-900 dark:text-white">{account.email}</code>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300">
                          {showPasswords[account.code] ? account.password : '••••••••'}
                        </span>
                        <button
                          onClick={() => togglePasswordVisibility(account.code)}
                          className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                          title={showPasswords[account.code] ? 'Hide password' : 'Show password'}
                        >
                          {showPasswords[account.code] ? (
                            <EyeOffIcon className="w-4 h-4" />
                          ) : (
                            <EyeIcon className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded text-xs font-semibold cursor-help"
                        title={`Current users: ${currentUsersCount}`}
                      >
                        {currentUsersCount} / {MAX_USERS}
                      </span>
                    </td>
                    <td className="p-3">
                      {availableSlots > 0 ? (
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded text-xs font-semibold">
                          {availableSlots} slots available
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 rounded text-xs font-semibold">
                          Full
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {getPoolStatusBadge(poolInfo.cookie_pool_status, poolInfo.cookie_count)}
                    </td>
                    <td className="p-3">
                      <small className="text-neutral-600 dark:text-neutral-400">
                        {formatDateTime(getLastCreatedForAccount(account))}
                      </small>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => fetchAccounts()}
                          className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-xs font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/70"
                          title="Refresh"
                        >
                          <RefreshCwIcon className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAccount(account);
                            setGrabCookieModalOpen(true);
                          }}
                          className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded text-xs font-semibold hover:bg-green-200 dark:hover:bg-green-900/70"
                          title={`Generate General Cookies for ${account.email}`}
                        >
                          <KeyIcon className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => handleAutoGenerateCookie(account)}
                          disabled={autoGenerateLoading[account.code]}
                          className="px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 rounded text-xs font-semibold hover:bg-purple-200 dark:hover:bg-purple-900/70 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={`Auto Generate Cookies for ${account.email} (Automatic Login)`}
                        >
                          {autoGenerateLoading[account.code] ? (
                            <Spinner />
                          ) : (
                            <span className="text-xs">⚡ Auto</span>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSupabaseAccount(account);
                            setEditEmail(account.email);
                            setEditPassword('');
                            setShowEditPassword(false);
                            setIsEditModalOpen(true);
                          }}
                          className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 rounded text-xs font-semibold hover:bg-yellow-200 dark:hover:bg-yellow-900/70"
                          title="Edit Email"
                        >
                          <PencilIcon className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSupabaseAccount(account);
                            setIsRemoveModalOpen(true);
                          }}
                          disabled={currentUsersCount > 0}
                          className="px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 rounded text-xs font-semibold hover:bg-red-200 dark:hover:bg-red-900/70 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={currentUsersCount > 0 ? 'Cannot remove account with active users' : 'Delete'}
                        >
                          <TrashIcon className="w-4 h-4 inline" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
          <div className="text-4xl mb-4">📧</div>
          <h5 className="text-lg font-semibold mb-2">No Flow Accounts</h5>
          <p className="mb-4">No flow accounts in the system yet.</p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors mx-auto"
          >
            <PlusIcon className="w-4 h-4" />
            Add First Flow Account
          </button>
        </div>
      )}

      {/* Add Account Modal */}
      {isAddModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Add Flow Account</h3>
              <button onClick={() => {
                setIsAddModalOpen(false);
                setNewEmail('');
                setNewPassword('');
                setNewCode('');
              }} className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Code (Auto-generated)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={newCode}
                    readOnly
                    className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 font-mono font-semibold text-neutral-600 dark:text-neutral-400 cursor-not-allowed"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Auto</span>
                  </div>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Code will be automatically generated ({BRAND_CONFIG.name === 'ESAIE' ? 'E1, E2, E3' : 'G1, G2, G3'}, etc.) based on existing codes
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-neutral-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddAccount}
                className="flex-1 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
              >
                Add Account
              </button>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewEmail('');
                  setNewPassword('');
                  setNewCode('');
                }}
                className="flex-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Account Modal */}
      {isEditModalOpen && selectedSupabaseAccount && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Edit Flow Account ({selectedSupabaseAccount.code})</h3>
              <button onClick={() => {
                setIsEditModalOpen(false);
                setSelectedSupabaseAccount(null);
                setEditEmail('');
                setEditPassword('');
                setShowEditPassword(false);
              }} className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Code (Read-only)</label>
                <div className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 font-mono font-semibold text-neutral-600 dark:text-neutral-400 cursor-not-allowed">
                  {selectedSupabaseAccount.code}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-neutral-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Password (Leave empty to keep current)</label>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Enter new password (optional)"
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 pr-10 text-neutral-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                  >
                    {showEditPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Leave password empty if you don't want to change it
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleEditAccount}
                className="flex-1 bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-orange-700 transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedSupabaseAccount(null);
                  setEditEmail('');
                  setEditPassword('');
                  setShowEditPassword(false);
                }}
                className="flex-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Remove Confirmation Modal */}
      {isRemoveModalOpen && selectedSupabaseAccount && createPortal(
        <ConfirmationModal
          isOpen={isRemoveModalOpen}
          onCancel={() => {
            setIsRemoveModalOpen(false);
            setSelectedSupabaseAccount(null);
          }}
          onConfirm={handleRemoveAccount}
          title="Remove Flow Account"
          message={`Are you sure you want to remove flow account "${selectedSupabaseAccount.code}" (${selectedSupabaseAccount.email})? This action cannot be undone.`}
          confirmText="Remove"
          cancelText="Cancel"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          language={language}
        />,
        document.body
      )}

      {/* Grab Cookie Modal */}
      {grabCookieModalOpen && selectedAccount && createPortal(
        (() => {
          const nextNum = getNextCookieNumber(selectedAccount.code);
          const nextFileName = `flow_${selectedAccount.code.toLowerCase()}_c${nextNum}.json`;
          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" aria-modal="true" role="dialog">
              <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border-[0.5px] border-neutral-200/80 dark:border-neutral-800/80">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">Grab Cookie for Flow Account</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                  Generate general cookies for <span className="inline-flex items-center gap-2">
                    <strong>{selectedAccount.email}</strong>
                    <button
                      onClick={() => handleCopyEmail(selectedAccount.email)}
                      className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                      title="Copy email"
                    >
                      <ClipboardIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                    </button>
                  </span> ({selectedAccount.code}).
                </p>
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-1">Next Cookie Filename:</p>
                  <code className="text-sm font-mono text-blue-900 dark:text-blue-100">{nextFileName}</code>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                  A browser will open for Google login.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setGrabCookieModalOpen(false);
                      setSelectedAccount(null);
                    }}
                    className="px-4 py-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGrabCookie}
                    disabled={grabLoading}
                    className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {grabLoading ? 'Grabbing...' : 'Grab Cookie'}
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* Select Accounts Modal */}
      {isSelectAccountsModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Select Flow Accounts to Generate Cookies</h3>
              <button 
                onClick={() => {
                  setIsSelectAccountsModalOpen(false);
                  setSelectedAccountCodes([]);
                }} 
                className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Process:</strong> Generate cookies for each selected account until cookies count &gt; 20. 
                Wait 10 seconds between accounts.
              </p>
            </div>

            <div className="mb-4">
              <button
                onClick={handleSelectAll}
                className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
              >
                {selectedAccountCodes.length === sortedAccounts.filter(a => (a.current_users_count || 0) > 0).length 
                  ? 'Deselect All' 
                  : 'Select All'}
              </button>
              <span className="text-sm text-neutral-500 dark:text-neutral-400 ml-2">
                ({selectedAccountCodes.length} selected)
              </span>
            </div>

            <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
              {sortedAccounts
                .filter(account => (account.current_users_count || 0) > 0)
                .map(account => (
                  <label
                    key={account.code}
                    className="flex items-center gap-3 p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAccountCodes.includes(account.code)}
                      onChange={() => handleAccountToggle(account.code)}
                      className="w-4 h-4 text-purple-600 border-neutral-300 rounded focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-neutral-900 dark:text-white">
                        {account.code}
                      </div>
                      <div className="text-sm text-neutral-500 dark:text-neutral-400">
                        {account.email} • {account.current_users_count || 0} users
                      </div>
                    </div>
                  </label>
                ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleStartGeneration}
                disabled={selectedAccountCodes.length === 0}
                className="flex-1 bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Cookies ({selectedAccountCodes.length})
              </button>
              <button
                onClick={() => {
                  setIsSelectAccountsModalOpen(false);
                  setSelectedAccountCodes([]);
                }}
                className="flex-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default FlowAccountManagementView;
