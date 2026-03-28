import React, { useState } from 'react';
import {
  addAccount,
  bulkImportAccounts,
  type UltraAiAccount,
} from '../../../services/ultraAiSalesService';
import { type Language } from '../../../types';
import {
  CheckCircleIcon,
  XIcon,
  PlusIcon,
  UploadIcon,
  EyeIcon,
  EyeOffIcon,
  AlertTriangleIcon,
} from '../../Icons';

interface AddAccountViewProps {
  language: Language;
  onSuccess: () => void;
}

const AddAccountView: React.FC<AddAccountViewProps> = ({
  language,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isBulkImport, setIsBulkImport] = useState(false);
  
  // Single account form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'available' | 'reserved' | 'suspended' | 'expired'>('available');
  const [accountType, setAccountType] = useState('ultra_ai');
  const [accountTier, setAccountTier] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  
  // Bulk import
  const [csvData, setCsvData] = useState('');
  const [bulkImportResults, setBulkImportResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const handleAddAccount = async () => {
    if (!email.trim()) {
      setStatusMessage({ type: 'error', message: 'Email is required' });
      return;
    }

    setLoading(true);
    try {
      const result = await addAccount({
        email: email.trim(),
        password: password.trim() || null,
        status,
        account_type: accountType,
        account_tier: accountTier || null,
        notes: notes.trim() || null,
        tags: tags.length > 0 ? tags : null,
      });

      if (result.success) {
        setStatusMessage({ type: 'success', message: 'Account added successfully' });
        resetForm();
        onSuccess();
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: 'error', message: result.message || 'Failed to add account' });
        setTimeout(() => setStatusMessage(null), 5000);
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while adding account' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkImport = async () => {
    if (!csvData.trim()) {
      setStatusMessage({ type: 'error', message: 'Please paste CSV data' });
      return;
    }

    setLoading(true);
    try {
      // Parse CSV
      const lines = csvData.trim().split('\n');
      const accounts: Array<{
        email: string;
        password?: string;
        status?: string;
        account_type?: string;
        account_tier?: string;
        notes?: string;
      }> = [];

      // Skip header if present
      const startIndex = lines[0]?.toLowerCase().includes('email') ? 1 : 0;
      
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Simple CSV parsing (assuming comma-separated)
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        if (parts.length > 0 && parts[0]) {
          accounts.push({
            email: parts[0],
            password: parts[1] || undefined,
            status: parts[2] || undefined,
            account_type: parts[3] || undefined,
            account_tier: parts[4] || undefined,
            notes: parts[5] || undefined,
          });
        }
      }

      if (accounts.length === 0) {
        setStatusMessage({ type: 'error', message: 'No valid accounts found in CSV data' });
        return;
      }

      const results = await bulkImportAccounts(accounts);
      setBulkImportResults(results);
      
      if (results.failed === 0) {
        setStatusMessage({ type: 'success', message: `Successfully imported ${results.success} account(s)` });
        setCsvData('');
        onSuccess();
      } else {
        setStatusMessage({ 
          type: 'error', 
          message: `Imported ${results.success} account(s), ${results.failed} failed. Check errors below.` 
        });
      }
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'An error occurred while importing accounts' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setStatus('available');
    setAccountType('ultra_ai');
    setAccountTier('');
    setNotes('');
    setTags([]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvData(text);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-white dark:bg-neutral-900 p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl sm:text-2xl font-bold mb-6 text-neutral-900 dark:text-white">Add Account</h2>

        {/* Toggle between single and bulk */}
        <div className="mb-6">
          <div className="flex gap-4 border-b border-neutral-200 dark:border-neutral-800">
            <button
              onClick={() => setIsBulkImport(false)}
              className={`px-4 py-2 font-medium transition-colors ${
                !isBulkImport
                  ? 'border-b-2 border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              Single Account
            </button>
            <button
              onClick={() => setIsBulkImport(true)}
              className={`px-4 py-2 font-medium transition-colors ${
                isBulkImport
                  ? 'border-b-2 border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              Bulk Import (CSV)
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

        {!isBulkImport ? (
          /* Single Account Form */
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
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-4 py-2 pr-10 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
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
                  className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={handleAddAccount}
              disabled={loading || !email.trim()}
              className="w-full bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <PlusIcon className="w-5 h-5" />
                  Add Account
                </>
              )}
            </button>
          </div>
        ) : (
          /* Bulk Import Form */
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex gap-2 mb-2">
                <AlertTriangleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">CSV Format:</p>
                  <p className="text-xs">email,password,status,account_type,account_tier,notes</p>
                  <p className="text-xs mt-2">Example:</p>
                  <code className="text-xs block mt-1 bg-white dark:bg-neutral-800 p-2 rounded">
                    example1@gmail.com,password123,available,ultra_ai,pro,First account
                  </code>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                Upload CSV File
              </label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-600 file:text-white hover:file:bg-primary-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">
                Or Paste CSV Data
              </label>
              <textarea
                value={csvData}
                onChange={(e) => setCsvData(e.target.value)}
                rows={10}
                placeholder="email,password,status,account_type,account_tier,notes&#10;example1@gmail.com,password123,available,ultra_ai,pro,First account&#10;example2@gmail.com,password456,available,ultra_ai,basic,Second account"
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
              />
            </div>

            {bulkImportResults && bulkImportResults.errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="font-medium text-red-800 dark:text-red-200 mb-2">Import Errors:</p>
                <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 max-h-40 overflow-y-auto">
                  {bulkImportResults.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleBulkImport}
              disabled={loading || !csvData.trim()}
              className="w-full bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <UploadIcon className="w-5 h-5" />
                  Import Accounts
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddAccountView;


