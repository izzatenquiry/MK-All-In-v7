import React, { useState, useEffect, useMemo } from 'react';
import { getApiRequests, clearApiRequests, type ApiRequestUser } from '../../../services/apiRequestService';
import { getAllUsers } from '../../../services/userService';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import { CheckCircleIcon, XIcon, ActivityIcon, TrashIcon } from '../../Icons';

interface ApiRequestsViewProps {
  language: Language;
}

const ApiRequestsView: React.FC<ApiRequestsViewProps> = ({ language }) => {
  const [apiUsers, setApiUsers] = useState<ApiRequestUser[]>([]);
  const [brandUserEmails, setBrandUserEmails] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const [apiData, brandUsers] = await Promise.all([
        getApiRequests(),
        getAllUsers()
      ]);
      setApiUsers(apiData.users);
      // Get brand users email list for filtering
      if (brandUsers) {
        const emails = new Set(brandUsers.map(u => u.email?.toLowerCase()).filter(Boolean) as string[]);
        setBrandUserEmails(emails);
      }
    } catch (error) {
      console.error('Error fetching API requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    // Confirm before reset
    if (!confirm('Are you sure you want to clear all API requests history? This action cannot be undone.')) {
      return;
    }

    setResetting(true);
    try {
      const result = await clearApiRequests();
      if (result.success) {
        // Refresh the list after clearing
        await fetchRequests();
        alert('API requests history cleared successfully');
      } else {
        alert(result.message || 'Failed to clear API requests history');
      }
    } catch (error) {
      console.error('Error resetting API requests:', error);
      alert('Failed to clear API requests history');
    } finally {
      setResetting(false);
    }
  };

  // Filter users to only show those from the current brand's Supabase
  const filteredUsers = useMemo(() => {
    if (brandUserEmails.size === 0) {
      // If brand users not loaded yet, return empty array (will show loading or no data)
      return [];
    }
    return apiUsers.filter(user => {
      const userEmail = user.email?.toLowerCase();
      return userEmail && brandUserEmails.has(userEmail);
    });
  }, [apiUsers, brandUserEmails]);

  const filteredTotalRequests = useMemo(() => {
    return filteredUsers.reduce((sum, user) => sum + user.total_requests, 0);
  }, [filteredUsers]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-white">API Requests History</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Track token generation requests from brand users. Total: <strong>{filteredTotalRequests}</strong> requests ({filteredUsers.length} users)
          </p>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting || filteredTotalRequests === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Clear all API requests history"
        >
          <TrashIcon className="w-4 h-4" />
          {resetting ? 'Resetting...' : 'Reset History'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Email</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Total Requests</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Success</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Failed</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Last Request</th>
              <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user, index) => (
              <tr
                key={index}
                className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              >
                <td className="p-3 text-neutral-900 dark:text-white">{user.email}</td>
                <td className="p-3 text-neutral-600 dark:text-neutral-400">{user.total_requests}</td>
                <td className="p-3">
                  <span className="text-green-600 dark:text-green-400 font-semibold">
                    {user.success_count}
                  </span>
                </td>
                <td className="p-3">
                  <span className="text-red-600 dark:text-red-400 font-semibold">
                    {user.failed_count}
                  </span>
                </td>
                <td className="p-3 text-neutral-600 dark:text-neutral-400 text-xs">
                  {formatDate(user.last_request_time)}
                </td>
                <td className="p-3">
                  {user.last_request_status === 'success' ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : user.last_request_status === 'failed' ? (
                    <XIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
                  ) : (
                    <ActivityIcon className="w-5 h-5 text-neutral-400" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
            No API requests found for brand users
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiRequestsView;
