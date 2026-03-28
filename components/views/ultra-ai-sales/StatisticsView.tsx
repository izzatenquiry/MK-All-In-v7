import React, { useState, useEffect } from 'react';
import {
  getSalesStatistics,
} from '../../../services/ultraAiSalesService';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import { ActivityIcon, UsersIcon, CheckCircleIcon, XIcon, TrendingUpIcon, RefreshCwIcon } from '../../Icons';

interface StatisticsViewProps {
  language: Language;
  refreshKey: number;
}

const StatisticsView: React.FC<StatisticsViewProps> = ({
  language,
  refreshKey,
}) => {
  const [stats, setStats] = useState<{
    total_accounts: number;
    available: number;
    sold: number;
    transferred: number;
    reserved: number;
    suspended: number;
    expired: number;
    total_revenue: number;
    monthly_revenue: number;
    average_price: number;
    pending_payments: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatistics();
  }, [refreshKey]);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const data = await getSalesStatistics();
      setStats(data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-neutral-500 dark:text-neutral-400">Failed to load statistics</p>
      </div>
    );
  }

  const soldPercentage = stats.total_accounts > 0 
    ? ((stats.sold / stats.total_accounts) * 100).toFixed(1)
    : '0';

  const availablePercentage = stats.total_accounts > 0 
    ? ((stats.available / stats.total_accounts) * 100).toFixed(1)
    : '0';

  return (
    <div className="bg-white dark:bg-neutral-900 p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2 text-neutral-900 dark:text-white">Statistics Dashboard</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Real-time statistics for Google ULTRA AI account sales
            </p>
          </div>
          <button
            onClick={fetchStatistics}
            className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            <RefreshCwIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <ActivityIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Accounts</h3>
          </div>
          <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{stats.total_accounts}</p>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircleIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
            <h3 className="text-sm font-medium text-green-600 dark:text-green-400">Available</h3>
          </div>
          <p className="text-3xl font-bold text-green-700 dark:text-green-300">{stats.available}</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">{availablePercentage}% of total</p>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <UsersIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <h3 className="text-sm font-medium text-purple-600 dark:text-purple-400">Sold</h3>
          </div>
          <p className="text-3xl font-bold text-purple-700 dark:text-purple-300">{stats.sold}</p>
          <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">{soldPercentage}% of total</p>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSignIcon className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            <h3 className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Total Revenue</h3>
          </div>
          <p className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">RM {stats.total_revenue.toFixed(2)}</p>
        </div>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUpIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Monthly Revenue</h3>
          </div>
          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">RM {stats.monthly_revenue.toFixed(2)}</p>
        </div>

        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <ActivityIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Average Price</h3>
          </div>
          <p className="text-3xl font-bold text-indigo-700 dark:text-indigo-300">RM {stats.average_price.toFixed(2)}</p>
        </div>
      </div>

      {/* Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">Status Distribution</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-neutral-700 dark:text-neutral-300">Available</span>
                <span className="text-sm font-medium text-neutral-900 dark:text-white">{stats.available} ({availablePercentage}%)</span>
              </div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${availablePercentage}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-neutral-700 dark:text-neutral-300">Sold</span>
                <span className="text-sm font-medium text-neutral-900 dark:text-white">{stats.sold} ({soldPercentage}%)</span>
              </div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                <div 
                  className="bg-purple-500 h-2 rounded-full transition-all"
                  style={{ width: `${soldPercentage}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-neutral-700 dark:text-neutral-300">Transferred</span>
                <span className="text-sm font-medium text-neutral-900 dark:text-white">{stats.transferred} ({stats.total_accounts > 0 ? ((stats.transferred / stats.total_accounts) * 100).toFixed(1) : '0'}%)</span>
              </div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                <div 
                  className="bg-orange-500 h-2 rounded-full transition-all"
                  style={{ width: `${stats.total_accounts > 0 ? (stats.transferred / stats.total_accounts) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-neutral-700 dark:text-neutral-300">Reserved</span>
                <span className="text-sm font-medium text-neutral-900 dark:text-white">{stats.reserved} ({stats.total_accounts > 0 ? ((stats.reserved / stats.total_accounts) * 100).toFixed(1) : '0'}%)</span>
              </div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                <div 
                  className="bg-yellow-500 h-2 rounded-full transition-all"
                  style={{ width: `${stats.total_accounts > 0 ? (stats.reserved / stats.total_accounts) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-neutral-700 dark:text-neutral-300">Suspended</span>
                <span className="text-sm font-medium text-neutral-900 dark:text-white">{stats.suspended} ({stats.total_accounts > 0 ? ((stats.suspended / stats.total_accounts) * 100).toFixed(1) : '0'}%)</span>
              </div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                <div 
                  className="bg-red-500 h-2 rounded-full transition-all"
                  style={{ width: `${stats.total_accounts > 0 ? (stats.suspended / stats.total_accounts) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-neutral-700 dark:text-neutral-300">Expired</span>
                <span className="text-sm font-medium text-neutral-900 dark:text-white">{stats.expired} ({stats.total_accounts > 0 ? ((stats.expired / stats.total_accounts) * 100).toFixed(1) : '0'}%)</span>
              </div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                <div 
                  className="bg-gray-500 h-2 rounded-full transition-all"
                  style={{ width: `${stats.total_accounts > 0 ? (stats.expired / stats.total_accounts) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">Quick Stats</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg">
              <span className="text-sm text-neutral-700 dark:text-neutral-300">Total Accounts</span>
              <span className="text-lg font-bold text-neutral-900 dark:text-white">{stats.total_accounts}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg">
              <span className="text-sm text-neutral-700 dark:text-neutral-300">Total Revenue</span>
              <span className="text-lg font-bold text-neutral-900 dark:text-white">RM {stats.total_revenue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg">
              <span className="text-sm text-neutral-700 dark:text-neutral-300">Monthly Revenue</span>
              <span className="text-lg font-bold text-neutral-900 dark:text-white">RM {stats.monthly_revenue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg">
              <span className="text-sm text-neutral-700 dark:text-neutral-300">Average Price</span>
              <span className="text-lg font-bold text-neutral-900 dark:text-white">RM {stats.average_price.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// DollarSignIcon component (simple SVG)
const DollarSignIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default StatisticsView;

