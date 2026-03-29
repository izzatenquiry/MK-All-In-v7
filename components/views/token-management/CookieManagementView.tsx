import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getBackendCookies, uploadCookie, deleteCookie, grabCookie, viewCookie, bulkDeleteCookies, type BackendCookie } from '../../../services/tokenBackendService';
import { getCookieUsageStatistics, mergeCookieStatsWithBackendData, type CookieStatistics } from '../../../services/cookieUsageService';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import { UploadIcon, TrashIcon, CheckCircleIcon, AlertTriangleIcon, XIcon, KeyIcon, EyeIcon, RefreshCwIcon, ActivityIcon } from '../../Icons';
import ConfirmationModal from '../../common/ConfirmationModal';
import { BRAND_CONFIG } from '../../../services/brandConfig';

interface CookieManagementViewProps {
  language: Language;
}

const CookieManagementView: React.FC<CookieManagementViewProps> = ({ language }) => {
  const [cookiesByFolder, setCookiesByFolder] = useState<Record<string, BackendCookie[]>>({});
  const [cookieStats, setCookieStats] = useState<CookieStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'good' | 'warning' | 'expired' | 'none'>('all');
  const [usedByFilter, setUsedByFilter] = useState<'all' | 'used' | 'not-used' | 'pool'>('all');
  const [selectedCookies, setSelectedCookies] = useState<Set<string>>(new Set());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [selectedCookie, setSelectedCookie] = useState<BackendCookie | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [grabModalOpen, setGrabModalOpen] = useState(false);
  const [viewCookieModalOpen, setViewCookieModalOpen] = useState(false);
  const [viewCookieContent, setViewCookieContent] = useState<string>('');
  const [viewCookieFilename, setViewCookieFilename] = useState<string>('');
  const [grabCookieName, setGrabCookieName] = useState('');
  const [grabCookieEmail, setGrabCookieEmail] = useState('');
  const [grabLoading, setGrabLoading] = useState(false);
  const [regenerateLoading, setRegenerateLoading] = useState<Record<string, boolean>>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [customUploadName, setCustomUploadName] = useState('');

  useEffect(() => {
    fetchCookies();
  }, []);

  const fetchCookies = async () => {
    setLoading(true);
    setStatsLoading(true);
    try {
      // Fetch both backend cookie metadata and Supabase usage stats
      const [cookiesData, supabaseStats] = await Promise.all([
        getBackendCookies(),
        getCookieUsageStatistics().catch(() => null) // Gracefully handle if stats fail
      ]);
      
      // Merge Supabase usage stats with backend cookie metadata
      const mergedStats = mergeCookieStatsWithBackendData(supabaseStats, cookiesData);
      
      setCookiesByFolder(cookiesData);
      setCookieStats(mergedStats);
    } catch (error) {
      console.error('Error fetching cookies:', error);
    } finally {
      setLoading(false);
      setStatsLoading(false);
    }
  };

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

  const allCookies = useMemo(() => {
    const cookies: Array<BackendCookie & { folder: string }> = [];
    Object.entries(filteredCookiesByFolder).forEach(([folder, folderCookies]) => {
      folderCookies.forEach(cookie => {
        cookies.push({ ...cookie, folder });
      });
    });
    return cookies;
  }, [filteredCookiesByFolder]);

  const filteredCookies = useMemo(() => {
    return allCookies.filter(cookie => {
      const status = cookie.status || 'none';
      const usedBy = cookie.is_pool_cookie ? 'pool' : (cookie.used_by && cookie.used_by.length > 0 ? 'used' : 'not-used');
      
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesUsedBy = usedByFilter === 'all' || usedBy === usedByFilter;
      
      return matchesStatus && matchesUsedBy;
    });
  }, [allCookies, statusFilter, usedByFilter]);

  // Calculate usage statistics from filtered cookies
  const usageStatistics = useMemo(() => {
    if (!cookieStats) {
      // Fallback: calculate from current cookies if stats not available
      const total = allCookies.length;
      const totalUsage = allCookies.reduce((sum, cookie) => {
        const usage = (cookie as any).usage_count || 0;
        return sum + usage;
      }, 0);
      const average = total > 0 ? totalUsage / total : 0;
      return { total_cookies: total, total_usage: totalUsage, average_usage: average, filtered_cookies: [] };
    }
    
    const filtered = cookieStats.all_cookies?.filter(cookie => {
      if (!cookie.flow_account || cookie.flow_account === 'Personal') return true;
      const flowAccount = String(cookie.flow_account).toUpperCase();
      return /^G\d+$/.test(flowAccount);
    }) || [];
    
    const total_cookies = filtered.length;
    const total_usage = filtered.reduce((sum, c) => sum + (c?.usage_count || 0), 0);
    const average_usage = total_cookies > 0 ? total_usage / total_cookies : 0;
    
    return { total_cookies, total_usage, average_usage, filtered_cookies: filtered };
  }, [cookieStats, allCookies]);

  // Most used cookie
  const mostUsedCookie = useMemo(() => {
    if (!usageStatistics.filtered_cookies || usageStatistics.filtered_cookies.length === 0) {
      return null;
    }
    const sorted = [...usageStatistics.filtered_cookies].sort((a, b) => 
      (b.usage_count || 0) - (a.usage_count || 0)
    );
    return sorted[0] || null;
  }, [usageStatistics]);

  // Create usage map for quick lookup
  const usageCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (cookieStats?.all_cookies) {
      cookieStats.all_cookies.forEach(cookie => {
        map.set(cookie.filename, cookie.usage_count || 0);
      });
    }
    return map;
  }, [cookieStats]);

  const handleUpload = async () => {
    if (!uploadFile) {
      alert('Please select a file to upload');
      return;
    }
    const result = await uploadCookie(uploadFile, customUploadName || undefined);
    if (result.success) {
      fetchCookies();
      setUploadModalOpen(false);
      setUploadFile(null);
      setCustomUploadName('');
    } else {
      alert(result.error || 'Upload failed');
    }
  };

  const handleDelete = async () => {
    if (!selectedCookie) return;
    const result = await deleteCookie(selectedCookie.path);
    if (result.success) {
      fetchCookies();
      setDeleteModalOpen(false);
      setSelectedCookie(null);
    } else {
      alert(result.error || 'Delete failed');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCookies.size === 0) return;
    const filenames = Array.from(selectedCookies);
    const result = await bulkDeleteCookies(filenames);
    if (result.success) {
      fetchCookies();
      setBulkDeleteModalOpen(false);
      setSelectedCookies(new Set());
    } else {
      alert(result.error || 'Bulk delete failed');
    }
  };

  const handleGrab = async () => {
    if (!grabCookieName.trim()) {
      alert('Please enter a cookie name');
      return;
    }
    setGrabLoading(true);
    const result = await grabCookie(grabCookieName.trim(), grabCookieEmail || undefined);
    setGrabLoading(false);
    if (result.success) {
      fetchCookies();
      setGrabModalOpen(false);
      setGrabCookieName('');
      setGrabCookieEmail('');
    } else {
      alert(result.error || 'Failed to grab cookie');
    }
  };

  const handleViewCookie = async (cookie: BackendCookie) => {
    setViewCookieFilename(cookie.filename);
    setViewCookieContent('Loading...');
    setViewCookieModalOpen(true);
    const result = await viewCookie(cookie.path);
    if (result.success && result.content) {
      setViewCookieContent(JSON.stringify(result.content, null, 2));
    } else {
      setViewCookieContent(`Error: ${result.error || 'Failed to load cookie'}`);
    }
  };

  const handleRegenerateCookie = async (cookie: BackendCookie) => {
    // Extract cookie name from filename (e.g., "flow_g1_c1.json" -> "flow_g1_c1")
    const cookieName = cookie.filename.replace(/\.json$/, '');
    
    setRegenerateLoading(prev => ({ ...prev, [cookie.path]: true }));
    try {
      const result = await grabCookie(cookieName, undefined);
      if (result.success) {
        // Refresh cookies list after successful regeneration
        await fetchCookies();
      } else {
        alert(result.error || 'Failed to regenerate cookie');
      }
    } catch (error) {
      console.error('Error regenerating cookie:', error);
      alert('Failed to regenerate cookie');
    } finally {
      setRegenerateLoading(prev => ({ ...prev, [cookie.path]: false }));
    }
  };

  const toggleSelectAll = () => {
    if (selectedCookies.size === filteredCookies.length) {
      setSelectedCookies(new Set());
    } else {
      setSelectedCookies(new Set(filteredCookies.map(c => c.path)));
    }
  };

  const toggleSelectCookie = (path: string) => {
    const newSelected = new Set(selectedCookies);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedCookies(newSelected);
  };

  const totalCookies = Object.values(filteredCookiesByFolder).reduce((sum, cookies) => sum + cookies.length, 0);

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
            <h2 className="text-2xl font-bold mb-2 text-neutral-900 dark:text-white">Cookie Pool Management</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Total: <strong>{totalCookies}</strong> cookie files in <strong>{Object.keys(filteredCookiesByFolder).length}</strong> folder(s)
              {' (G folders only)'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setBulkDeleteModalOpen(true)}
              disabled={selectedCookies.size === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrashIcon className="w-4 h-4" />
              Delete ({selectedCookies.size})
            </button>
            <button
              onClick={() => setGrabModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
            >
              <KeyIcon className="w-4 h-4" />
              Grab Cookie
            </button>
            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
            >
              <UploadIcon className="w-4 h-4" />
              Upload Cookie
            </button>
          </div>
        </div>
      </div>

      {/* Usage Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-100 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-2">
            <ActivityIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-blue-900 dark:text-blue-200">Total Cookies</h3>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {usageStatistics.total_cookies}
          </p>
        </div>
        <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="font-semibold text-green-900 dark:text-green-200">Total Usage</h3>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {usageStatistics.total_usage}
          </p>
        </div>
        <div className="bg-purple-100 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-2 mb-2">
            <ActivityIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className="font-semibold text-purple-900 dark:text-purple-200">Average Usage</h3>
          </div>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {usageStatistics.average_usage.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Most Used Cookie */}
      {mostUsedCookie && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-neutral-800 dark:text-neutral-200">Most Used Cookie</h3>
          <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold text-green-900 dark:text-green-200">{mostUsedCookie.filename}</p>
                <p className="text-sm text-green-700 dark:text-green-300">{mostUsedCookie.flow_account || 'Personal'}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{mostUsedCookie.usage_count || 0}</p>
                <p className="text-xs text-green-700 dark:text-green-300">uses</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cookies Table */}
      {Object.keys(filteredCookiesByFolder).length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="text-left p-3">
                  <input
                    type="checkbox"
                    checked={filteredCookies.length > 0 && selectedCookies.size === filteredCookies.length}
                    onChange={toggleSelectAll}
                    className="cursor-pointer"
                  />
                </th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">File Name</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">
                  <div className="flex flex-col gap-1">
                    <span>Status</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="text-xs px-2 py-1 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    >
                      <option value="all">All</option>
                      <option value="good">Good</option>
                      <option value="warning">Warning</option>
                      <option value="expired">Expired</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Age (Days)</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Cookie Count</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Usage Count</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">
                  <div className="flex flex-col gap-1">
                    <span>Used By</span>
                    <select
                      value={usedByFilter}
                      onChange={(e) => setUsedByFilter(e.target.value as any)}
                      className="text-xs px-2 py-1 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    >
                      <option value="all">All</option>
                      <option value="used">Used</option>
                      <option value="not-used">Not Used</option>
                      <option value="pool">Pool Cookies</option>
                    </select>
                  </div>
                </th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(filteredCookiesByFolder).map(([folderName, cookies]) => {
                const folderCookies = cookies.filter(cookie => {
                  const status = cookie.status || 'none';
                  const usedBy = cookie.is_pool_cookie ? 'pool' : (cookie.used_by && cookie.used_by.length > 0 ? 'used' : 'not-used');
                  const matchesStatus = statusFilter === 'all' || status === statusFilter;
                  const matchesUsedBy = usedByFilter === 'all' || usedBy === usedByFilter;
                  return matchesStatus && matchesUsedBy;
                });

                if (folderCookies.length === 0) return null;

                return (
                  <React.Fragment key={folderName}>
                    {folderName !== 'Root' && (
                      <tr className="bg-neutral-100 dark:bg-neutral-800">
                        <td colSpan={8} className="p-3 font-semibold">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600 dark:text-blue-400">📁</span>
                            Flow Account: <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-xs font-semibold">{folderName}</span>
                            <span className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded text-xs">{folderCookies.length} cookie(s)</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {folderCookies.map((cookie) => (
                      <tr
                        key={cookie.path}
                        className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedCookies.has(cookie.path)}
                            onChange={() => toggleSelectCookie(cookie.path)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600 dark:text-blue-400">📄</span>
                            <code className="text-sm text-neutral-900 dark:text-white">{cookie.filename}</code>
                          </div>
                          {folderName !== 'Root' && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{cookie.path}</div>
                          )}
                        </td>
                        <td className="p-3">
                          {cookie.status === 'good' && (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Good</span>
                          )}
                          {cookie.status === 'warning' && (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300">Needs Attention</span>
                          )}
                          {cookie.status === 'expired' && (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">Expired</span>
                          )}
                          {!cookie.status || cookie.status === 'none' && (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300">Unknown</span>
                          )}
                        </td>
                        <td className="p-3 text-neutral-600 dark:text-neutral-400">{cookie.age_days}</td>
                        <td className="p-3">
                          <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-xs font-semibold">
                            {cookie.cookies_count}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                            {usageCountMap.get(cookie.filename) || 0}
                          </span>
                        </td>
                        <td className="p-3">
                          {cookie.is_pool_cookie ? (
                            <div>
                              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-xs font-semibold">Pool Cookie</span>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                Available for all users in {folderName}
                              </div>
                            </div>
                          ) : cookie.used_by && cookie.used_by.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {cookie.used_by.map((user, idx) => (
                                <span key={idx} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-xs">
                                  {user}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-neutral-400 text-sm">Not used</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleViewCookie(cookie)}
                              className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded text-xs font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/70"
                              title="View Cookie"
                            >
                              <EyeIcon className="w-4 h-4 inline" />
                            </button>
                            <button
                              onClick={() => handleRegenerateCookie(cookie)}
                              disabled={regenerateLoading[cookie.path]}
                              className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded text-xs font-semibold hover:bg-green-200 dark:hover:bg-green-900/70 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Regenerate Cookie"
                            >
                              {regenerateLoading[cookie.path] ? (
                                <RefreshCwIcon className="w-4 h-4 inline animate-spin" />
                              ) : (
                                <RefreshCwIcon className="w-4 h-4 inline" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedCookie(cookie);
                                setDeleteModalOpen(true);
                              }}
                              className="px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 rounded text-xs font-semibold hover:bg-red-200 dark:hover:bg-red-900/70"
                              title="Delete Cookie"
                            >
                              <TrashIcon className="w-4 h-4 inline" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
          <div className="text-4xl mb-4">📄</div>
          <h5 className="text-lg font-semibold mb-2">No Cookies</h5>
          <p className="mb-4">No cookie files in the system yet.</p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setGrabModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
            >
              <KeyIcon className="w-4 h-4" />
              Grab Cookie from Google
            </button>
            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
            >
              <UploadIcon className="w-4 h-4" />
              Upload Cookie
            </button>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border-[0.5px] border-neutral-200/80 dark:border-neutral-800/80">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">Upload Cookie File</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">Select .json Cookie File</label>
              <input
                type="file"
                accept=".json"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-neutral-900 dark:text-neutral-200 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">Custom Filename (Optional)</label>
              <input
                type="text"
                value={customUploadName}
                onChange={(e) => setCustomUploadName(e.target.value)}
                placeholder="e.g., my_cookie.json"
                className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setUploadModalOpen(false);
                  setUploadFile(null);
                  setCustomUploadName('');
                }}
                className="px-4 py-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!uploadFile}
                className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grab Cookie Modal */}
      {grabModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border-[0.5px] border-neutral-200/80 dark:border-neutral-800/80">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">Grab New Cookie</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">
                Cookie Filename (e.g., flow_g1_c1)
              </label>
              <input
                type="text"
                value={grabCookieName}
                onChange={(e) => setGrabCookieName(e.target.value)}
                placeholder="e.g., flow_g1_c1"
                className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">Associated Email (Optional)</label>
              <input
                type="email"
                value={grabCookieEmail}
                onChange={(e) => setGrabCookieEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setGrabModalOpen(false);
                  setGrabCookieName('');
                  setGrabCookieEmail('');
                }}
                className="px-4 py-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGrab}
                disabled={!grabCookieName.trim() || grabLoading}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {grabLoading ? 'Grabbing...' : 'Grab Cookie'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Cookie Modal */}
      {viewCookieModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-4xl p-6 border-[0.5px] border-neutral-200/80 dark:border-neutral-800/80">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                📄 Cookie Content: {viewCookieFilename}
              </h3>
              <button
                onClick={() => {
                  setViewCookieModalOpen(false);
                  setViewCookieContent('');
                  setViewCookieFilename('');
                }}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[500px] overflow-auto bg-neutral-50 dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <pre className="text-xs text-neutral-900 dark:text-white whitespace-pre-wrap font-mono">
                {viewCookieContent}
              </pre>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Cookie Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedCookie(null);
        }}
        onConfirm={handleDelete}
        title="Delete Cookie"
        message={`Are you sure you want to delete cookie ${selectedCookie?.filename}?${selectedCookie?.used_by && selectedCookie.used_by.length > 0 ? `\n\nThis cookie is being used by ${selectedCookie.used_by.length} user(s)!` : ''}`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
      />

      {/* Bulk Delete Modal */}
      <ConfirmationModal
        isOpen={bulkDeleteModalOpen}
        onClose={() => {
          setBulkDeleteModalOpen(false);
        }}
        onConfirm={handleBulkDelete}
        title="Bulk Delete Cookies"
        message={`Are you sure you want to delete ${selectedCookies.size} cookie(s)?\n\n${Array.from(selectedCookies).slice(0, 5).join('\n')}${selectedCookies.size > 5 ? `\n... and ${selectedCookies.size - 5} more` : ''}`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmColor="red"
      />
    </div>
  );
};

export default CookieManagementView;
