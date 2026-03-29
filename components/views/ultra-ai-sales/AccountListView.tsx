import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  getAllAccounts,
  updateAccount,
  deleteAccount,
  addAccount,
  bulkImportAccounts,
  type UltraAiAccount,
} from '../../../services/ultraAiSalesService';
import { addUser, getAllUsers } from '../../../services/ultraAiUserService';
import { addFlowAccount, getAllFlowAccounts, updateFlowAccount, type FlowAccount } from '../../../services/flowAccountService';
import { BRAND_CONFIG } from '../../../services/brandConfig';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import ConfirmationModal from '../../common/ConfirmationModal';
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  XIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
  ClipboardIcon,
  RefreshCwIcon,
  DownloadIcon,
  PlusIcon,
  ActivityIcon,
  SendIcon,
  MailIcon,
  UploadIcon,
} from '../../Icons';

interface AccountListViewProps {
  language: Language;
  refreshKey: number;
  onRefresh: () => void;
}

const AccountListView: React.FC<AccountListViewProps> = ({
  language,
  refreshKey,
  onRefresh,
}) => {
  const [accounts, setAccounts] = useState<UltraAiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusSortOrder, setStatusSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  
  // Modals
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSoldModalOpen, setIsSoldModalOpen] = useState(false);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<UltraAiAccount | null>(null);
  const [selectedAccountForEdit, setSelectedAccountForEdit] = useState<UltraAiAccount | null>(null);
  const [selectedAccountForActivate, setSelectedAccountForActivate] = useState<UltraAiAccount | null>(null);
  const [isOpeningGmail, setIsOpeningGmail] = useState(false);
  
  // Add account form state
  const [showPassword, setShowPassword] = useState(false);
  const [addAccountLoading, setAddAccountLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addStatus, setAddStatus] = useState<'available' | 'reserved' | 'suspended' | 'expired' | 'new_stock'>('new_stock');
  const [accountType, setAccountType] = useState('ultra_ai');
  const [accountTier, setAccountTier] = useState('');
  const [notes, setNotes] = useState('');
  
  // Sold form
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerContact, setBuyerContact] = useState(''); // Combined: phone @ telegram
  const [buyerNotes, setBuyerNotes] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'no_need'>('pending');

  // Edit form state
  const [editLoading, setEditLoading] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editStatus, setEditStatus] = useState<'available' | 'reserved' | 'sold' | 'suspended' | 'expired' | 'new_stock' | 'transferred' | 'replaced'>('sold');
  
  // Current users mapping (account_email -> buyer_email)
  const [currentUsersMap, setCurrentUsersMap] = useState<Record<string, string>>({});

  // Transfer state
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(null);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedAccountForTransfer, setSelectedAccountForTransfer] = useState<UltraAiAccount | null>(null);
  const [transferMode, setTransferMode] = useState<'new' | 'replace'>('new');
  const [selectedFlowAccountCode, setSelectedFlowAccountCode] = useState('');
  const [availableFlowAccounts, setAvailableFlowAccounts] = useState<FlowAccount[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);

  // Bulk upload state
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<Array<{ email: string; password: string }>>([]);
  const [bulkUploadLoading, setBulkUploadLoading] = useState(false);
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  // Per-domain: which domains have email list collapsed (hidden). Empty Set = all expanded.
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set());

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      if (searchTerm) {
        filters.search = searchTerm;
      }
      const data = await getAllAccounts(filters);
      // All accounts are stock emails now (buyer info moved to ultra_ai_users table)
      setAccounts(data);
      
      // Fetch current users from ultra_ai_users table
      try {
        const users = await getAllUsers();
        const usersMap: Record<string, string> = {};
        users.forEach(user => {
          if (user.account_email && user.buyer_email) {
            usersMap[user.account_email] = user.buyer_email;
          }
        });
        setCurrentUsersMap(usersMap);
      } catch (error) {
        console.error('Error fetching current users:', error);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setStatusMessage({ type: 'error', message: 'Failed to fetch accounts' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [refreshKey, statusFilter]);

  // Close status filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) {
        setIsStatusFilterOpen(false);
      }
    };

    if (isStatusFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isStatusFilterOpen]);

  const handleSearch = () => {
    fetchAccounts();
  };

  // Parse CSV file
  const parseCSV = (text: string): Array<{ email: string; password: string }> => {
    const lines = text.split('\n').filter(line => line.trim());
    const accounts: Array<{ email: string; password: string }> = [];
    
    // Skip header jika ada
    const startIndex = lines[0]?.toLowerCase().includes('email') ? 1 : 0;
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Handle CSV dengan comma atau semicolon separator
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 2) {
        // Try semicolon
        const parts2 = line.split(';').map(p => p.trim());
        if (parts2.length >= 2) {
          accounts.push({
            email: parts2[0].replace(/"/g, ''),
            password: parts2[1].replace(/"/g, ''),
          });
        }
      } else {
        accounts.push({
          email: parts[0].replace(/"/g, ''),
          password: parts[1].replace(/"/g, ''),
        });
      }
    }
    
    return accounts;
  };

  // Handle file select
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      setStatusMessage({ type: 'error', message: 'Please select a CSV file' });
      return;
    }
    
    setCsvFile(file);
    
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      
      if (parsed.length === 0) {
        setStatusMessage({ type: 'error', message: 'No valid data found in CSV file' });
        return;
      }
      
      setCsvData(parsed);
      setIsBulkUploadModalOpen(true);
    } catch (error) {
      console.error('Error reading CSV file:', error);
      setStatusMessage({ type: 'error', message: 'Failed to read CSV file' });
    }
  };

  // Handle bulk upload confirmation
  const handleBulkUploadConfirm = async () => {
    if (csvData.length === 0) return;
    
    setBulkUploadLoading(true);
    setBulkUploadProgress(null);
    
    try {
      const accountsToImport = csvData.map(acc => ({
        email: acc.email.trim(),
        password: acc.password.trim() || null,
        status: 'new_stock' as const,
        account_type: 'ultra_ai',
        account_tier: null,
        notes: null,
      }));
      
      const result = await bulkImportAccounts(accountsToImport);
      setBulkUploadProgress(result);
      
      if (result.success > 0) {
        setStatusMessage({ 
          type: 'success', 
          message: `Successfully imported ${result.success} accounts. ${result.failed > 0 ? `${result.failed} failed.` : ''}` 
        });
        setIsBulkUploadModalOpen(false);
        setCsvFile(null);
        setCsvData([]);
        setBulkUploadProgress(null);
        fetchAccounts();
        onRefresh();
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage({ 
          type: 'error', 
          message: `Failed to import accounts. ${result.errors.slice(0, 3).join(', ')}${result.errors.length > 3 ? '...' : ''}` 
        });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      console.error('Error bulk importing accounts:', error);
      setStatusMessage({ type: 'error', message: 'An error occurred while importing accounts' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setBulkUploadLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAccount) return;
    const result = await deleteAccount(selectedAccount.id);
    if (result.success) {
      setStatusMessage({ type: 'success', message: 'Account deleted successfully' });
      setIsDeleteModalOpen(false);
      setSelectedAccount(null);
      fetchAccounts();
      onRefresh();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', message: result.message || 'Failed to delete account' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleMarkAsSold = async () => {
    if (!selectedAccount || !buyerName || !salePrice) {
      setStatusMessage({ type: 'error', message: 'Buyer name and sale price are required' });
      return;
    }
    // Parse buyerContact: format "phone @ telegram" or just phone/telegram
    let parsedPhone = '';
    let parsedTelegram = '';
    if (buyerContact) {
      const parts = buyerContact.split('@').map(p => p.trim());
      if (parts.length > 1) {
        parsedPhone = parts[0];
        parsedTelegram = parts.slice(1).join('@'); // In case there are multiple @
      } else {
        // If no @, assume it's phone
        parsedPhone = buyerContact;
      }
    }

    try {
      // Create user in ultra_ai_users table
      const userResult = await addUser({
        buyer_name: buyerName,
        buyer_email: buyerEmail || null,
        buyer_phone: parsedPhone || null,
        buyer_telegram: parsedTelegram || null,
        buyer_notes: buyerNotes || null,
        account_id: selectedAccount.id,
        account_email: selectedAccount.email,
        sale_date: new Date().toISOString(),
        sale_price: parseFloat(salePrice),
        payment_method: paymentMethod || null,
        payment_status: paymentStatus,
        status: 'active',
      });

      if (!userResult.success) {
        setStatusMessage({ type: 'error', message: userResult.message || 'Failed to create user record' });
        setTimeout(() => setStatusMessage(null), 5000);
        return;
      }

      // Update account status to 'sold'
      const accountResult = await updateAccount(selectedAccount.id, {
        status: 'sold',
      });

      if (accountResult.success) {
        setStatusMessage({ type: 'success', message: 'Account marked as sold successfully' });
        setIsSoldModalOpen(false);
        setSelectedAccount(null);
        resetSoldForm();
        fetchAccounts();
        onRefresh();
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', message: accountResult.message || 'Failed to update account status' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while marking account as sold' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const resetSoldForm = () => {
    setBuyerName('');
    setBuyerEmail('');
    setBuyerContact('');
    setBuyerNotes('');
    setSalePrice('');
    setPaymentMethod('');
    setPaymentStatus('pending');
  };

  const handleAddAccount = async () => {
    if (!email.trim()) {
      setStatusMessage({ type: 'error', message: 'Email is required' });
      return;
    }

    setAddAccountLoading(true);
    try {
      const result = await addAccount({
        email: email.trim(),
        password: addPassword.trim() || null,
        status: addStatus,
        account_type: accountType,
        account_tier: accountTier || null,
        notes: notes.trim() || null,
      });

      if (result.success) {
        setStatusMessage({ type: 'success', message: 'Account added successfully' });
        resetAddAccountForm();
        setIsAddAccountModalOpen(false);
        fetchAccounts();
        onRefresh();
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', message: result.message || 'Failed to add account' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while adding account' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setAddAccountLoading(false);
    }
  };

  const resetAddAccountForm = () => {
    setEmail('');
    setAddPassword('');
    setAddStatus('new_stock');
    setAccountType('ultra_ai');
    setAccountTier('');
    setNotes('');
  };

  const handleActivateAccount = (account: UltraAiAccount) => {
    setSelectedAccountForActivate(account);
    setIsActivateModalOpen(true);
  };

  const handleLoginGmail = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (!selectedAccountForActivate) {
      console.error('No account selected for activation');
      setStatusMessage({ type: 'error', message: 'No account selected' });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }
    
    console.log('Opening Gmail for account:', selectedAccountForActivate.id, selectedAccountForActivate.email);
    
    setIsOpeningGmail(true);
    
    try {
      setStatusMessage({ type: 'success', message: 'Opening Gmail in browser...' });
      
      const url = `http://localhost:1247/api/accounts/${selectedAccountForActivate.id}/open-gmail`;
      console.log('Calling API:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Response data:', data);
      
      if (data.success) {
        setStatusMessage({ type: 'success', message: data.message || 'Gmail opened in browser. Please verify login.' });
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage({ type: 'error', message: data.error || 'Failed to open Gmail' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error: any) {
      console.error('Error opening Gmail:', error);
      setStatusMessage({ type: 'error', message: error.message || 'Failed to open Gmail. Please check if backend server is running on port 1247.' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setIsOpeningGmail(false);
    }
  };

  const handleDoneActivate = async () => {
    if (!selectedAccountForActivate) return;

    const result = await updateAccount(selectedAccountForActivate.id, {
      status: 'available',
    });

    if (result.success) {
      setStatusMessage({ type: 'success', message: 'Account activated successfully. Status changed to Available.' });
      setIsActivateModalOpen(false);
      setSelectedAccountForActivate(null);
      fetchAccounts();
      onRefresh();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', message: result.message || 'Failed to activate account' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedAccountForEdit) return;

    setEditLoading(true);
    try {
      const updates: any = {
        password: editPassword || null,
        notes: editNotes || null,
        expiry_date: editExpiryDate ? new Date(editExpiryDate).toISOString() : null,
        status: editStatus,
      };

      const result = await updateAccount(selectedAccountForEdit.id, updates);

      if (result.success) {
        setStatusMessage({ type: 'success', message: 'Account updated successfully' });
        setIsEditModalOpen(false);
        setSelectedAccountForEdit(null);
        fetchAccounts();
        onRefresh();
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', message: result.message || 'Failed to update account' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while updating account' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setEditLoading(false);
    }
  };

  // Generate next available code for Flow Account
  const generateNextCode = async (): Promise<string> => {
    const existingAccounts = await getAllFlowAccounts();
    const prefix = 'G';
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

  const handleOpenTransferModal = async (account: UltraAiAccount) => {
    if (!account.email || !account.password) {
      setStatusMessage({ type: 'error', message: 'Email and password are required to transfer account' });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    setSelectedAccountForTransfer(account);
    setTransferMode('new');
    setSelectedFlowAccountCode('');
    
    // Fetch available flow accounts for the dropdown
    const flowAccounts = await getAllFlowAccounts();
    setAvailableFlowAccounts(flowAccounts);
    
    setIsTransferModalOpen(true);
  };

  const handleTransferWithNewCode = async () => {
    if (!selectedAccountForTransfer) return;
    
    setTransferLoading(true);
    try {
      const code = await generateNextCode();
      const result = await addFlowAccount(
        selectedAccountForTransfer.email,
        selectedAccountForTransfer.password || '',
        code
      );

      if (result.success) {
        const updateResult = await updateAccount(selectedAccountForTransfer.id, {
          status: 'transferred',
        });
        
        if (updateResult.success) {
          setStatusMessage({ 
            type: 'success', 
            message: `Account transferred with new code ${code}. Status changed to Transferred.` 
          });
          setIsTransferModalOpen(false);
          setSelectedAccountForTransfer(null);
          await fetchAccounts();
          onRefresh();
          setTimeout(() => setStatusMessage(null), 3000);
        } else {
          setStatusMessage({ 
            type: 'error', 
            message: `Account transferred with code ${code}, but failed to update status: ${updateResult.message}` 
          });
          await fetchAccounts();
          onRefresh();
          setTimeout(() => setStatusMessage(null), 5000);
        }
      } else {
        setStatusMessage({ type: 'error', message: result.message || 'Failed to transfer account' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while transferring account' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setTransferLoading(false);
    }
  };

  const handleTransferReplaceEmail = async () => {
    if (!selectedAccountForTransfer || !selectedFlowAccountCode) {
      setStatusMessage({ type: 'error', message: 'Please select a flow account code' });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    setTransferLoading(true);
    try {
      // Find flow account by code
      const flowAccount = availableFlowAccounts.find(acc => acc.code === selectedFlowAccountCode);
      
      if (!flowAccount) {
        setStatusMessage({ type: 'error', message: 'Flow account not found' });
        setTimeout(() => setStatusMessage(null), 5000);
        return;
      }

      // Update flow account email
      const result = await updateFlowAccount(flowAccount.id, {
        email: selectedAccountForTransfer.email,
        password: selectedAccountForTransfer.password || undefined,
      });

      if (result.success) {
        const updateResult = await updateAccount(selectedAccountForTransfer.id, {
          status: 'transferred',
        });
        
        if (updateResult.success) {
          setStatusMessage({ 
            type: 'success', 
            message: `Account transferred to existing flow account ${selectedFlowAccountCode}. Email replaced. Status changed to Transferred.` 
          });
          setIsTransferModalOpen(false);
          setSelectedAccountForTransfer(null);
          setSelectedFlowAccountCode('');
          await fetchAccounts();
          onRefresh();
          setTimeout(() => setStatusMessage(null), 3000);
        } else {
          setStatusMessage({ 
            type: 'error', 
            message: `Email replaced in flow account ${selectedFlowAccountCode}, but failed to update status: ${updateResult.message}` 
          });
          await fetchAccounts();
          onRefresh();
          setTimeout(() => setStatusMessage(null), 5000);
        }
      } else {
        setStatusMessage({ type: 'error', message: result.message || 'Failed to replace email' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while replacing email' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setTransferLoading(false);
    }
  };

  const togglePasswordVisibility = (accountId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [accountId]: !prev[accountId],
    }));
  };

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setStatusMessage({ type: 'success', message: 'Email copied to clipboard!' });
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
      setStatusMessage({ type: 'error', message: 'Failed to copy email' });
      setTimeout(() => setStatusMessage(null), 2000);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { text: string; color: string }> = {
      available: { text: 'Available', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
      reserved: { text: 'Reserved', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
      sold: { text: 'Sold', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
      transferred: { text: 'Transferred', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
      suspended: { text: 'Suspended', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
      expired: { text: 'Expired', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300' },
      new_stock: { text: 'New Stock', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
      replaced: { text: 'Replaced', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300' },
    };
    const config = statusConfig[status] || { text: status, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const getPaymentStatusBadge = (status?: string | null) => {
    if (!status) return null;
    const config: Record<string, { text: string; color: string }> = {
      pending: { text: 'Pending', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
      paid: { text: 'Paid', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
      refunded: { text: 'Refunded', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
      no_need: { text: 'No Need', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300' },
    };
    const badge = config[status] || { text: status, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString.substring(0, 10);
    }
  };

  const formatCurrency = (amount?: number | null) => {
    if (!amount) return '-';
    return `RM ${amount.toFixed(2)}`;
  };

  const getDomain = (email: string): string => {
    if (!email || !email.includes('@')) return 'unknown';
    return email.split('@').slice(1).join('@').toLowerCase();
  };

  // Status sort order: new_stock (1), available (2), reserved (3), sold (4), transferred (5), suspended (6), expired (7)
  const getStatusPriority = (status: string): number => {
    const priorityMap: Record<string, number> = {
      'new_stock': 1,
      'available': 2,
      'reserved': 3,
      'sold': 4,
      'transferred': 5,
      'suspended': 6,
      'expired': 7,
      'replaced': 8,
    };
    return priorityMap[status] || 99;
  };

  const filteredAccounts = useMemo(() => {
    let filtered = accounts;
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(account => account.status === statusFilter);
    }
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(account =>
        account.email.toLowerCase().includes(search)
      );
    }
    
    // Status sort
    const sorted = [...filtered].sort((a, b) => {
      const priorityA = getStatusPriority(a.status);
      const priorityB = getStatusPriority(b.status);
      return statusSortOrder === 'asc' 
        ? priorityA - priorityB 
        : priorityB - priorityA;
    });
    
    return sorted;
  }, [accounts, statusFilter, searchTerm, statusSortOrder]);

  const accountsByDomain = useMemo(() => {
    const map: Record<string, UltraAiAccount[]> = {};
    filteredAccounts.forEach((acc) => {
      const domain = getDomain(acc.email);
      if (!map[domain]) map[domain] = [];
      map[domain].push(acc);
    });
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, UltraAiAccount[]>>((out, key) => {
        out[key] = map[key];
        return out;
      }, {});
  }, [filteredAccounts]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      new_stock: 0,
      available: 0,
      reserved: 0,
      sold: 0,
      transferred: 0,
      suspended: 0,
      expired: 0,
      replaced: 0,
    };
    accounts.forEach((acc) => {
      if (acc.status && counts[acc.status] !== undefined) {
        counts[acc.status]++;
      }
    });
    return counts;
  }, [accounts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2 text-neutral-900 dark:text-white">Account List</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Total: <strong>{accounts.length}</strong> accounts
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload-input"
            />
            <label
              htmlFor="csv-upload-input"
              className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
            >
              <UploadIcon className="w-4 h-4" />
              Bulk Upload CSV
            </label>
            <button
              onClick={() => setIsAddAccountModalOpen(true)}
              className="flex items-center gap-2 bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add Account
            </button>
            <button
              onClick={fetchAccounts}
              className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              <RefreshCwIcon className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Status counts summary */}
        <div className="flex flex-wrap gap-3 mb-4 p-3 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700">
          <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide self-center">Status:</span>
          <button
            type="button"
            onClick={() => setStatusFilter('new_stock')}
            className={`text-sm px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'new_stock' ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 font-semibold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
          >
            New Stock <strong>{statusCounts.new_stock}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('available')}
            className={`text-sm px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'available' ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 font-semibold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
          >
            Available <strong>{statusCounts.available}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('reserved')}
            className={`text-sm px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'reserved' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 font-semibold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
          >
            Reserved <strong>{statusCounts.reserved}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('sold')}
            className={`text-sm px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'sold' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 font-semibold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
          >
            Sold <strong>{statusCounts.sold}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('transferred')}
            className={`text-sm px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'transferred' ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300 font-semibold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
          >
            Transferred <strong>{statusCounts.transferred}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('suspended')}
            className={`text-sm px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'suspended' ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 font-semibold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
          >
            Suspended <strong>{statusCounts.suspended}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expired')}
            className={`text-sm px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'expired' ? 'bg-gray-100 dark:bg-gray-900/50 text-gray-800 dark:text-gray-300 font-semibold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
          >
            Expired <strong>{statusCounts.expired}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('replaced')}
            className={`text-sm px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'replaced' ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300 font-semibold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
          >
            Replaced <strong>{statusCounts.replaced}</strong>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`text-sm px-2.5 py-1 rounded-md transition-colors ${statusFilter === 'all' ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 font-semibold' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
          >
            All <strong>{accounts.length}</strong>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="new_stock">New Stock</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="sold">Sold</option>
            <option value="transferred">Transferred</option>
            <option value="suspended">Suspended</option>
            <option value="expired">Expired</option>
            <option value="replaced">Replaced</option>
          </select>
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
      </div>

      {/* Accounts Table - grouped by domain */}
      {filteredAccounts.length > 0 ? (
        <div className="space-y-6">
          {Object.entries(accountsByDomain).map(([domain, domainAccounts]) => {
            const isCollapsed = collapsedDomains.has(domain);
            const toggleDomain = () => {
              setCollapsedDomains((prev) => {
                const next = new Set(prev);
                if (next.has(domain)) next.delete(domain);
                else next.add(domain);
                return next;
              });
            };
            return (
            <div
              key={domain}
              className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 bg-neutral-50/50 dark:bg-neutral-800/30"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-neutral-700 dark:text-neutral-300 border-b border-neutral-300 dark:border-neutral-600 pb-1">
                  @{domain} <span className="text-neutral-500 font-normal">({domainAccounts.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={toggleDomain}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  {isCollapsed ? (
                    <>
                      <EyeIcon className="w-3.5 h-3.5" />
                      Show list
                    </>
                  ) : (
                    <>
                      <EyeOffIcon className="w-3.5 h-3.5" />
                      Hide list
                    </>
                  )}
                </button>
              </div>
              {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-800">
                      <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Email</th>
                      <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Password</th>
                      <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">
                        <div className="flex items-center gap-2 relative">
                          <span>Status</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setStatusSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                              className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                              title="Click to sort"
                            >
                              <span className="text-xs text-neutral-400">
                                {statusSortOrder === 'asc' ? '↑' : '↓'}
                              </span>
                            </button>
                            <div className="relative" ref={statusFilterRef}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsStatusFilterOpen(!isStatusFilterOpen);
                                }}
                                className={`p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors ${
                                  statusFilter !== 'all' ? 'text-primary-600 dark:text-primary-400' : ''
                                }`}
                                title="Filter by status"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                              </button>
                              {isStatusFilterOpen && (
                                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                                  <div className="p-2">
                                    <button
                                      onClick={() => {
                                        setStatusFilter('all');
                                        setIsStatusFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                        statusFilter === 'all'
                                          ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                                      }`}
                                    >
                                      All Status
                                    </button>
                                    <button
                                      onClick={() => {
                                        setStatusFilter('new_stock');
                                        setIsStatusFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                        statusFilter === 'new_stock'
                                          ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                                      }`}
                                    >
                                      New Stock
                                    </button>
                                    <button
                                      onClick={() => {
                                        setStatusFilter('available');
                                        setIsStatusFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                        statusFilter === 'available'
                                          ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                                      }`}
                                    >
                                      Available
                                    </button>
                                    <button
                                      onClick={() => {
                                        setStatusFilter('reserved');
                                        setIsStatusFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                        statusFilter === 'reserved'
                                          ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                                      }`}
                                    >
                                      Reserved
                                    </button>
                                    <button
                                      onClick={() => {
                                        setStatusFilter('sold');
                                        setIsStatusFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                        statusFilter === 'sold'
                                          ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                                      }`}
                                    >
                                      Sold
                                    </button>
                                    <button
                                      onClick={() => {
                                        setStatusFilter('transferred');
                                        setIsStatusFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                        statusFilter === 'transferred'
                                          ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                                      }`}
                                    >
                                      Transferred
                                    </button>
                                    <button
                                      onClick={() => {
                                        setStatusFilter('suspended');
                                        setIsStatusFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                        statusFilter === 'suspended'
                                          ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                                      }`}
                                    >
                                      Suspended
                                    </button>
                                    <button
                                      onClick={() => {
                                        setStatusFilter('expired');
                                        setIsStatusFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                        statusFilter === 'expired'
                                          ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                                      }`}
                                    >
                                      Expired
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </th>
                      <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Current User</th>
                      <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Notes</th>
                      <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Expiry Date</th>
                      <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainAccounts.map((account) => (
                      <tr key={account.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-neutral-900 dark:text-white">{account.email}</span>
                            <button
                              onClick={() => handleCopyEmail(account.email)}
                              className="text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
                              title="Copy email"
                            >
                              <ClipboardIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="p-3">
                          {account.password ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-neutral-900 dark:text-white font-mono">
                                {showPasswords[account.id] ? account.password : '••••••••'}
                              </span>
                              <button
                                onClick={() => togglePasswordVisibility(account.id)}
                                className="text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
                                title={showPasswords[account.id] ? 'Hide password' : 'Show password'}
                              >
                                {showPasswords[account.id] ? (
                                  <EyeOffIcon className="w-4 h-4" />
                                ) : (
                                  <EyeIcon className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="p-3">{getStatusBadge(account.status)}</td>
                        <td className="p-3">
                          {currentUsersMap[account.email] ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-neutral-900 dark:text-white">{currentUsersMap[account.email]}</span>
                              <button
                                onClick={() => handleCopyEmail(currentUsersMap[account.email])}
                                className="text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
                                title="Copy email"
                              >
                                <ClipboardIcon className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="p-3">
                          {account.notes ? (
                            <span className="text-sm text-neutral-600 dark:text-neutral-400" title={account.notes}>
                              {account.notes.length > 50 ? `${account.notes.substring(0, 50)}...` : account.notes}
                            </span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="p-3 text-neutral-600 dark:text-neutral-400">{formatDate(account.expiry_date)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {account.status === 'new_stock' && (
                              <button
                                onClick={() => handleActivateAccount(account)}
                                className="p-1.5 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded transition-colors"
                                title="Activate Account (Opens Gmail)"
                              >
                                <ActivityIcon className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedAccountForEdit(account);
                                setEditPassword(account.password || '');
                                setShowEditPassword(false);
                                setEditNotes(account.notes || '');
                                setEditExpiryDate(account.expiry_date ? account.expiry_date.split('T')[0] : '');
                                setEditStatus(account.status);
                                setIsEditModalOpen(true);
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded transition-colors"
                              title="Edit Account"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            {account.status !== 'sold' && account.status !== 'new_stock' && (
                              <button
                                onClick={() => {
                                  setSelectedAccount(account);
                                  setIsSoldModalOpen(true);
                                }}
                                className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50 rounded transition-colors"
                                title="Mark as sold"
                              >
                                <CheckCircleIcon className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenTransferModal(account)}
                              className="p-1.5 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/50 rounded transition-colors"
                              title="Transfer to Flow Account Management"
                            >
                              <SendIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedAccount(account);
                                setIsDeleteModalOpen(true);
                              }}
                              className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-colors"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-neutral-500 dark:text-neutral-400">No accounts found</p>
        </div>
      )}

      {/* Bulk Upload Confirmation Modal */}
      {isBulkUploadModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Confirm Bulk Upload</h3>
              <button
                onClick={() => {
                  setIsBulkUploadModalOpen(false);
                  setCsvFile(null);
                  setCsvData([]);
                  setBulkUploadProgress(null);
                }}
                className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
                disabled={bulkUploadLoading}
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                You are about to import <strong>{csvData.length}</strong> accounts with status <strong>New Stock</strong>.
              </p>
              
              {bulkUploadProgress && (
                <div className={`p-4 rounded-lg mb-4 ${
                  bulkUploadProgress.failed === 0 
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                    : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {bulkUploadProgress.failed === 0 ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertTriangleIcon className="w-5 h-5 text-yellow-600" />
                    )}
                    <span className="font-semibold">
                      Success: {bulkUploadProgress.success} | Failed: {bulkUploadProgress.failed}
                    </span>
                  </div>
                  {bulkUploadProgress.errors.length > 0 && (
                    <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400 max-h-32 overflow-y-auto">
                      {bulkUploadProgress.errors.slice(0, 10).map((error, idx) => (
                        <div key={idx}>{error}</div>
                      ))}
                      {bulkUploadProgress.errors.length > 10 && (
                        <div>... and {bulkUploadProgress.errors.length - 10} more errors</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="max-h-64 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-800 sticky top-0">
                    <tr>
                      <th className="text-left p-2 text-neutral-700 dark:text-neutral-300">#</th>
                      <th className="text-left p-2 text-neutral-700 dark:text-neutral-300">Email</th>
                      <th className="text-left p-2 text-neutral-700 dark:text-neutral-300">Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 50).map((account, idx) => (
                      <tr key={idx} className="border-b border-neutral-100 dark:border-neutral-800">
                        <td className="p-2 text-neutral-600 dark:text-neutral-400">{idx + 1}</td>
                        <td className="p-2 text-neutral-900 dark:text-white">{account.email}</td>
                        <td className="p-2 text-neutral-600 dark:text-neutral-400 font-mono text-xs">
                          {account.password ? '••••••••' : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvData.length > 50 && (
                  <div className="p-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    ... and {csvData.length - 50} more accounts
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setIsBulkUploadModalOpen(false);
                  setCsvFile(null);
                  setCsvData([]);
                  setBulkUploadProgress(null);
                }}
                className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                disabled={bulkUploadLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUploadConfirm}
                disabled={bulkUploadLoading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {bulkUploadLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Importing...
                  </>
                ) : (
                  'Confirm & Import'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedAccount && createPortal(
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onCancel={() => {
            setIsDeleteModalOpen(false);
            setSelectedAccount(null);
          }}
          onConfirm={handleDelete}
          title="Delete Account"
          message={`Are you sure you want to delete account ${selectedAccount.email}? This action cannot be undone.`}
          confirmText="Delete"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          language={language}
        />,
        document.body
      )}

      {/* Mark as Sold Modal */}
      {isSoldModalOpen && selectedAccount && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Mark as Sold</h3>
                <button
                  onClick={() => {
                    setIsSoldModalOpen(false);
                    setSelectedAccount(null);
                    resetSoldForm();
                  }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Account Email
                  </label>
                  <input
                    type="text"
                    value={selectedAccount.email}
                    disabled
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Buyer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Buyer Email
                  </label>
                  <input
                    type="email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Buyer Phone @ Telegram
                  </label>
                  <input
                    type="text"
                    value={buyerContact}
                    onChange={(e) => setBuyerContact(e.target.value)}
                    placeholder="e.g., 0123456789 @ username"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    Format: phone @ telegram (optional)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Sale Price (RM) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="">Select payment method</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="ewallet">E-Wallet</option>
                    <option value="veoly">VEOLY-AI (veoly-ai.com)</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Payment Status
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as 'pending' | 'paid' | 'no_need')}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="no_need">No Need</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Notes
                  </label>
                  <textarea
                    value={buyerNotes}
                    onChange={(e) => setBuyerNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setIsSoldModalOpen(false);
                    setSelectedAccount(null);
                    resetSoldForm();
                  }}
                  className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkAsSold}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Mark as Sold
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Account Modal */}
      {isEditModalOpen && selectedAccountForEdit && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Edit Account</h3>
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedAccountForEdit(null);
                  }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Account Email (readonly) */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Account Email
                  </label>
                  <input
                    type="text"
                    value={selectedAccountForEdit.email}
                    disabled
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Password (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    />
                    <button
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                      type="button"
                    >
                      {showEditPassword ? (
                        <EyeOffIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="new_stock">New Stock</option>
                    <option value="available">Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="sold">Sold</option>
                    <option value="transferred">Transferred</option>
                    <option value="suspended">Suspended</option>
                    <option value="expired">Expired</option>
                    <option value="replaced">Replaced</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={editExpiryDate}
                    onChange={(e) => setEditExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Notes
                  </label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                    placeholder="Add notes about this account..."
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedAccountForEdit(null);
                  }}
                  className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editLoading}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {editLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Activate Account Confirmation Modal */}
      {isActivateModalOpen && selectedAccountForActivate && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Activate Account</h3>
                <button
                  onClick={() => {
                    setIsActivateModalOpen(false);
                    setSelectedAccountForActivate(null);
                  }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-6">
                <p className="text-neutral-700 dark:text-neutral-300 mb-2">
                  Account: <span className="font-medium">{selectedAccountForActivate.email}</span>
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Please login to Gmail first, then click "Done Activate" to change the status to Available.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsActivateModalOpen(false);
                    setSelectedAccountForActivate(null);
                  }}
                  className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLoginGmail}
                  disabled={isOpeningGmail}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isOpeningGmail ? (
                    <>
                      <Spinner />
                      <span>Opening...</span>
                    </>
                  ) : (
                    <>
                      <MailIcon className="w-5 h-5" />
                      <span>Login Gmail</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleDoneActivate}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircleIcon className="w-5 h-5" />
                  Done Activate
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Transfer Account Modal */}
      {isTransferModalOpen && selectedAccountForTransfer && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Transfer Account</h3>
                <button
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setSelectedAccountForTransfer(null);
                    setSelectedFlowAccountCode('');
                  }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-neutral-700 dark:text-neutral-300 mb-2">
                  Account: <span className="font-medium">{selectedAccountForTransfer.email}</span>
                </p>
              </div>

              {/* Transfer Mode Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
                  Transfer Mode
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setTransferMode('new');
                      setSelectedFlowAccountCode('');
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      transferMode === 'new'
                        ? 'bg-primary-600 text-white'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    Transfer with New Code
                  </button>
                  <button
                    onClick={() => {
                      setTransferMode('replace');
                      setSelectedFlowAccountCode('');
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      transferMode === 'replace'
                        ? 'bg-primary-600 text-white'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    Replace Email (Existing Code)
                  </button>
                </div>
              </div>

              {/* New Code Mode */}
              {transferMode === 'new' && (
                <div className="mb-4">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    A new code will be auto-generated (G1, G2, etc.)
                  </p>
                </div>
              )}

              {/* Replace Email Mode */}
              {transferMode === 'replace' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Select Flow Account Code
                  </label>
                  <select
                    value={selectedFlowAccountCode}
                    onChange={(e) => setSelectedFlowAccountCode(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="">Select flow account code</option>
                    {availableFlowAccounts.map(acc => (
                      <option key={acc.id} value={acc.code}>
                        {acc.code} - {acc.email} ({acc.current_users_count}/10 users)
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    This will replace the email in the selected flow account
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setSelectedAccountForTransfer(null);
                    setSelectedFlowAccountCode('');
                  }}
                  className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={transferMode === 'new' ? handleTransferWithNewCode : handleTransferReplaceEmail}
                  disabled={transferLoading || (transferMode === 'replace' && !selectedFlowAccountCode)}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {transferLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Transferring...
                    </>
                  ) : (
                    transferMode === 'new' ? 'Transfer with New Code' : 'Replace Email'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Account Modal */}
      {isAddAccountModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Add Account</h3>
                <button
                  onClick={() => {
                    setIsAddAccountModalOpen(false);
                    resetAddAccountForm();
                  }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Password (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={addPassword}
                      onChange={(e) => setAddPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full px-3 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                      type="button"
                    >
                      {showPassword ? (
                        <EyeOffIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                      Status
                    </label>
                    <select
                      value={addStatus}
                      onChange={(e) => setAddStatus(e.target.value as any)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    >
                      <option value="new_stock">New Stock</option>
                      <option value="available">Available</option>
                      <option value="reserved">Reserved</option>
                      <option value="suspended">Suspended</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                      Account Type
                    </label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    >
                      <option value="ultra_ai">ULTRA AI</option>
                      <option value="premium">Premium</option>
                      <option value="basic">Basic</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Account Tier (Optional)
                  </label>
                  <input
                    type="text"
                    value={accountTier}
                    onChange={(e) => setAccountTier(e.target.value)}
                    placeholder="e.g., basic, pro, enterprise"
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Additional notes..."
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setIsAddAccountModalOpen(false);
                    resetAddAccountForm();
                  }}
                  className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAccount}
                  disabled={addAccountLoading || !email.trim()}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {addAccountLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-4 h-4" />
                      Add Account
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AccountListView;

