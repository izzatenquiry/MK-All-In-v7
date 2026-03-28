import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  getAllUsers,
  updateUser,
  deleteUser,
  type UltraAiUser,
} from '../../../services/ultraAiUserService';
import { getAllAccounts, updateAccount, type UltraAiAccount } from '../../../services/ultraAiSalesService';
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
  ClipboardIcon,
  RefreshCwIcon,
  MailIcon,
} from '../../Icons';

interface UltraUserListViewProps {
  language: Language;
  refreshKey: number;
  onRefresh: () => void;
}

const UltraUserListView: React.FC<UltraUserListViewProps> = ({
  language,
  refreshKey,
  onRefresh,
}) => {
  const [users, setUsers] = useState<UltraAiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isReplaceAccountModalOpen, setIsReplaceAccountModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UltraAiUser | null>(null);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UltraAiUser | null>(null);
  const [selectedUserForReplace, setSelectedUserForReplace] = useState<UltraAiUser | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<UltraAiAccount[]>([]);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [replaceSearchTerm, setReplaceSearchTerm] = useState('');
  
  // Edit form state
  const [editLoading, setEditLoading] = useState(false);
  const [editBuyerName, setEditBuyerName] = useState('');
  const [editBuyerEmail, setEditBuyerEmail] = useState('');
  const [editBuyerContact, setEditBuyerContact] = useState('');
  const [editBuyerNotes, setEditBuyerNotes] = useState('');
  const [editSaleDate, setEditSaleDate] = useState('');
  const [editSalePrice, setEditSalePrice] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState<'pending' | 'paid' | 'refunded'>('pending');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'expired' | 'suspended' | 'transferred'>('active');

  useEffect(() => {
    fetchUsers();
  }, [refreshKey]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
      setStatusMessage({ type: 'error', message: 'Failed to fetch users' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    const result = await deleteUser(selectedUser.id);
    if (result.success) {
      setStatusMessage({ type: 'success', message: 'User deleted successfully' });
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
      onRefresh();
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', message: result.message || 'Failed to delete user' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedUserForEdit) return;

    // Parse buyerContact: format "phone @ telegram"
    let parsedPhone = '';
    let parsedTelegram = '';
    if (editBuyerContact) {
      const parts = editBuyerContact.split('@').map(p => p.trim());
      if (parts.length > 1) {
        parsedPhone = parts[0];
        parsedTelegram = parts.slice(1).join('@');
      } else {
        parsedPhone = editBuyerContact;
      }
    }

    setEditLoading(true);
    try {
      const updates: any = {
        buyer_name: editBuyerName || null,
        buyer_email: editBuyerEmail || null,
        buyer_phone: parsedPhone || null,
        buyer_telegram: parsedTelegram || null,
        buyer_notes: editBuyerNotes || null,
        sale_date: editSaleDate ? new Date(editSaleDate).toISOString() : null,
        sale_price: editSalePrice ? parseFloat(editSalePrice) : null,
        payment_method: editPaymentMethod || null,
        payment_status: editPaymentStatus || null,
        expiry_date: editExpiryDate ? new Date(editExpiryDate).toISOString() : null,
        status: editStatus,
      };

      const result = await updateUser(selectedUserForEdit.id, updates);
      if (result.success) {
        setStatusMessage({ type: 'success', message: 'User information updated successfully' });
        setIsEditModalOpen(false);
        setSelectedUserForEdit(null);
        fetchUsers();
        onRefresh();
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', message: result.message || 'Failed to update user' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while updating user' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setEditLoading(false);
    }
  };

  const formatDate = (date: string | null | undefined): string => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  const formatCurrency = (amount: number | null | undefined): string => {
    if (!amount) return '-';
    return `RM ${amount.toFixed(2)}`;
  };

  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) return <span className="text-neutral-400">-</span>;
    const statusConfig: Record<string, { text: string; color: string }> = {
      active: { text: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
      expired: { text: 'Expired', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300' },
      suspended: { text: 'Suspended', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
      transferred: { text: 'Transferred', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
    };
    const config = statusConfig[status] || { text: status, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const getPaymentStatusBadge = (status: string | null | undefined) => {
    if (!status) return <span className="text-neutral-400">-</span>;
    const statusConfig: Record<string, { text: string; color: string }> = {
      pending: { text: 'Pending', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
      paid: { text: 'Paid', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
      refunded: { text: 'Refunded', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
    };
    const config = statusConfig[status] || { text: status, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setStatusMessage({ type: 'success', message: 'Email copied to clipboard!' });
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  };

  // Fetch available accounts (new_stock) for replacement
  const fetchAvailableAccounts = async () => {
    try {
      const accounts = await getAllAccounts({ status: 'new_stock' });
      setAvailableAccounts(accounts);
    } catch (error) {
      console.error('Error fetching available accounts:', error);
      setStatusMessage({ type: 'error', message: 'Failed to fetch available accounts' });
    }
  };

  // Handle replace account
  const handleReplaceAccount = async (newAccount: UltraAiAccount) => {
    if (!selectedUserForReplace) return;

    setReplaceLoading(true);
    try {
      // 1. Update user's account_email to new account
      const updateUserResult = await updateUser(selectedUserForReplace.id, {
        account_email: newAccount.email,
        account_id: newAccount.id,
        status: 'active', // Change from suspended to active
      });

      if (!updateUserResult.success) {
        setStatusMessage({ type: 'error', message: updateUserResult.message || 'Failed to update user account' });
        setTimeout(() => setStatusMessage(null), 5000);
        return;
      }

      // 2. Update new account status to 'replaced' (replace, bukan jual baru)
      console.log('Updating account status to replaced:', newAccount.id, newAccount.email);
      const updateAccountResult = await updateAccount(newAccount.id, {
        status: 'replaced',
      });

      if (!updateAccountResult.success) {
        console.error('Failed to update account status:', updateAccountResult.message);
        setStatusMessage({ type: 'error', message: `User updated but failed to update account status: ${updateAccountResult.message}. Please check Supabase constraint allows 'replaced' status.` });
        setTimeout(() => setStatusMessage(null), 8000);
        return;
      }

      console.log('Account status updated successfully:', updateAccountResult.account);

      setStatusMessage({ 
        type: 'success', 
        message: `Account replaced successfully. User now has ${newAccount.email}` 
      });
      setIsReplaceAccountModalOpen(false);
      setSelectedUserForReplace(null);
      setReplaceSearchTerm('');
      fetchUsers();
      // Force refresh all tabs including Account List
      onRefresh();
      // Small delay to ensure Supabase update is propagated
      setTimeout(() => {
        onRefresh();
      }, 500);
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (error) {
      console.error('Error replacing account:', error);
      setStatusMessage({ type: 'error', message: 'An error occurred while replacing account' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setReplaceLoading(false);
    }
  };

  // Filter users
  const filteredUsers = useMemo(() => {
    let filtered = users;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(user => user.status === statusFilter);
    }

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.buyer_name?.toLowerCase().includes(search) ||
        user.buyer_email?.toLowerCase().includes(search) ||
        user.account_email.toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [users, statusFilter, searchTerm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
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

      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2 text-neutral-900 dark:text-white">User List</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Total: <strong>{users.length}</strong> users
            </p>
          </div>
          <button
            onClick={fetchUsers}
            className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            <RefreshCwIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by buyer name, buyer email, or account email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
            <option value="transferred">Transferred</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Buyer Name</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Buyer Email</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Account Email</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Status</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Sale Date</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Expiry Date</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Price</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Payment</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className="p-3">
                    <div className="font-medium text-neutral-900 dark:text-white">
                      {user.buyer_name || '-'}
                    </div>
                  </td>
                  <td className="p-3">
                    {user.buyer_email ? (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-900 dark:text-white">{user.buyer_email}</span>
                        <button
                          onClick={() => handleCopyEmail(user.buyer_email!)}
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
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900 dark:text-white">{user.account_email}</span>
                      <button
                        onClick={() => handleCopyEmail(user.account_email)}
                        className="text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
                        title="Copy email"
                      >
                        <ClipboardIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="p-3">{getStatusBadge(user.status)}</td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">{formatDate(user.sale_date)}</td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">{formatDate(user.expiry_date)}</td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">{formatCurrency(user.sale_price)}</td>
                  <td className="p-3">{getPaymentStatusBadge(user.payment_status)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedUserForEdit(user);
                          setEditBuyerName(user.buyer_name || '');
                          setEditBuyerEmail(user.buyer_email || '');
                          const contact = user.buyer_phone && user.buyer_telegram 
                            ? `${user.buyer_phone} @ ${user.buyer_telegram}`
                            : user.buyer_phone || user.buyer_telegram || '';
                          setEditBuyerContact(contact);
                          setEditBuyerNotes(user.buyer_notes || '');
                          setEditSaleDate(user.sale_date ? user.sale_date.split('T')[0] : '');
                          setEditSalePrice(user.sale_price?.toString() || '');
                          setEditPaymentMethod(user.payment_method || '');
                          setEditPaymentStatus(user.payment_status || 'pending');
                          setEditExpiryDate(user.expiry_date ? user.expiry_date.split('T')[0] : '');
                          setEditStatus((user.status || 'active') as any);
                          setIsEditModalOpen(true);
                        }}
                        className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded transition-colors"
                        title="Edit User"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUserForReplace(user);
                          fetchAvailableAccounts();
                          setIsReplaceAccountModalOpen(true);
                        }}
                        className="p-1.5 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/50 rounded transition-colors"
                        title="Replace Account"
                      >
                        <RefreshCwIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUser(user);
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

        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            {searchTerm || statusFilter !== 'all' ? 'No users found matching filters' : 'No users found'}
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {isEditModalOpen && selectedUserForEdit && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Edit User Information</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Buyer Name</label>
                <input
                  type="text"
                  value={editBuyerName}
                  onChange={(e) => setEditBuyerName(e.target.value)}
                  className="w-full px-3 py-2 border rounded bg-white dark:bg-neutral-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Buyer Email</label>
                <input
                  type="email"
                  value={editBuyerEmail}
                  onChange={(e) => setEditBuyerEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded bg-white dark:bg-neutral-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contact (Phone @ Telegram)</label>
                <input
                  type="text"
                  value={editBuyerContact}
                  onChange={(e) => setEditBuyerContact(e.target.value)}
                  placeholder="Phone @ Telegram"
                  className="w-full px-3 py-2 border rounded bg-white dark:bg-neutral-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Buyer Notes</label>
                <textarea
                  value={editBuyerNotes}
                  onChange={(e) => setEditBuyerNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border rounded bg-white dark:bg-neutral-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Sale Date</label>
                  <input
                    type="date"
                    value={editSaleDate}
                    onChange={(e) => setEditSaleDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded bg-white dark:bg-neutral-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={editExpiryDate}
                    onChange={(e) => setEditExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded bg-white dark:bg-neutral-800"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Sale Price</label>
                  <input
                    type="number"
                    value={editSalePrice}
                    onChange={(e) => setEditSalePrice(e.target.value)}
                    className="w-full px-3 py-2 border rounded bg-white dark:bg-neutral-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Payment Status</label>
                  <select
                    value={editPaymentStatus}
                    onChange={(e) => setEditPaymentStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded bg-white dark:bg-neutral-800"
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Payment Method</label>
                <input
                  type="text"
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border rounded bg-white dark:bg-neutral-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded bg-white dark:bg-neutral-800"
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="suspended">Suspended</option>
                  <option value="transferred">Transferred</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editLoading}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded disabled:opacity-50"
              >
                {editLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Replace Account Modal */}
      {isReplaceAccountModalOpen && selectedUserForReplace && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold">Replace Account</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                  Current account: <strong>{selectedUserForReplace.account_email}</strong>
                </p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Buyer: <strong>{selectedUserForReplace.buyer_name}</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setIsReplaceAccountModalOpen(false);
                  setSelectedUserForReplace(null);
                  setReplaceSearchTerm('');
                }}
                className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
                disabled={replaceLoading}
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <input
                type="text"
                placeholder="Search available accounts..."
                value={replaceSearchTerm}
                onChange={(e) => setReplaceSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="mb-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                Select a new account from available stock:
              </p>
              <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg max-h-96 overflow-y-auto">
                {availableAccounts
                  .filter(acc => 
                    replaceSearchTerm === '' || 
                    acc.email.toLowerCase().includes(replaceSearchTerm.toLowerCase())
                  )
                  .length === 0 ? (
                  <div className="p-4 text-center text-neutral-500 dark:text-neutral-400">
                    No available accounts found
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 dark:bg-neutral-800 sticky top-0">
                      <tr>
                        <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Email</th>
                        <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Password</th>
                        <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableAccounts
                        .filter(acc => 
                          replaceSearchTerm === '' || 
                          acc.email.toLowerCase().includes(replaceSearchTerm.toLowerCase())
                        )
                        .map((account) => (
                          <tr 
                            key={account.id} 
                            className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-neutral-900 dark:text-white">{account.email}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(account.email);
                                    setStatusMessage({ type: 'success', message: 'Email copied to clipboard' });
                                    setTimeout(() => setStatusMessage(null), 2000);
                                  }}
                                  className="text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
                                  title="Copy email"
                                >
                                  <ClipboardIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-neutral-600 dark:text-neutral-400 font-mono text-xs">
                              {account.password ? '••••••••' : '-'}
                            </td>
                            <td className="p-3">
                              <button
                                onClick={() => handleReplaceAccount(account)}
                                disabled={replaceLoading}
                                className="px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                              >
                                {replaceLoading ? 'Replacing...' : 'Select'}
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setIsReplaceAccountModalOpen(false);
                  setSelectedUserForReplace(null);
                  setReplaceSearchTerm('');
                }}
                className="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                disabled={replaceLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedUser(null);
        }}
        onConfirm={handleDelete}
        title="Delete User"
        message={`Are you sure you want to delete user ${selectedUser?.buyer_name || selectedUser?.account_email}?`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
        language={language}
      />
    </div>
  );
};

export default UltraUserListView;
