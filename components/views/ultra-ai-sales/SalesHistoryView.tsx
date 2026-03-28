import React, { useState, useEffect, useMemo } from 'react';
import { getAllUsers, type UltraAiUser } from '../../../services/ultraAiUserService';
import { type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import { DownloadIcon, RefreshCwIcon } from '../../Icons';

interface SalesHistoryViewProps {
  language: Language;
  refreshKey: number;
}

const SalesHistoryView: React.FC<SalesHistoryViewProps> = ({
  language,
  refreshKey,
}) => {
  const [users, setUsers] = useState<UltraAiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchSales();
  }, [refreshKey]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (dateFrom) {
        filters.dateFrom = dateFrom;
      }
      if (dateTo) {
        filters.dateTo = dateTo;
      }
      const data = await getAllUsers(filters);
      setUsers(data);
    } catch (error) {
      console.error('Error fetching sales history:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSales = useMemo(() => {
    let filtered = users;
    
    // Filter by date range
    if (dateFrom) {
      filtered = filtered.filter(user => {
        if (!user.sale_date) return false;
        return new Date(user.sale_date) >= new Date(dateFrom);
      });
    }
    if (dateTo) {
      filtered = filtered.filter(user => {
        if (!user.sale_date) return false;
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999); // Include entire day
        return new Date(user.sale_date) <= toDate;
      });
    }
    
    if (paymentStatusFilter !== 'all') {
      filtered = filtered.filter(user => user.payment_status === paymentStatusFilter);
    }

    // Sort by sale date (newest first)
    return filtered.sort((a, b) => {
      if (!a.sale_date && !b.sale_date) return 0;
      if (!a.sale_date) return 1;
      if (!b.sale_date) return -1;
      return new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime();
    });
  }, [users, paymentStatusFilter, dateFrom, dateTo]);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString.substring(0, 10);
    }
  };

  const formatCurrency = (amount?: number | null) => {
    if (!amount) return '-';
    return `RM ${amount.toFixed(2)}`;
  };

  const getPaymentStatusBadge = (status?: string | null) => {
    if (!status) return null;
    const config: Record<string, { text: string; color: string }> = {
      pending: { text: 'Pending', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
      paid: { text: 'Paid', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
      refunded: { text: 'Refunded', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
    };
    const badge = config[status] || { text: status, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  const calculateTotalRevenue = () => {
    return filteredSales
      .filter(user => user.payment_status === 'paid' || !user.payment_status)
      .reduce((sum, user) => sum + (Number(user.sale_price) || 0), 0);
  };

  const calculatePendingRevenue = () => {
    return filteredSales
      .filter(user => user.payment_status === 'pending')
      .reduce((sum, user) => sum + (Number(user.sale_price) || 0), 0);
  };

  const handleExportCSV = () => {
    const headers = ['Account Email', 'Buyer Name', 'Buyer Email', 'Sale Date', 'Sale Price', 'Payment Method', 'Payment Status'];
    const rows = filteredSales.map(user => [
      user.account_email,
      user.buyer_name || '',
      user.buyer_email || '',
      user.sale_date ? formatDate(user.sale_date) : '',
      user.sale_price?.toString() || '',
      user.payment_method || '',
      user.payment_status || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sales-history-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApplyFilters = () => {
    fetchSales();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  const totalRevenue = calculateTotalRevenue();
  const pendingRevenue = calculatePendingRevenue();

  return (
    <div className="bg-white dark:bg-neutral-900 p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2 text-neutral-900 dark:text-white">Sales History</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Total Sales: <strong>{filteredSales.length}</strong> | Total Revenue: <strong>RM {totalRevenue.toFixed(2)}</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              <DownloadIcon className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={fetchSales}
              className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              <RefreshCwIcon className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Revenue Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-600 dark:text-green-400 mb-1">Total Revenue</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">RM {totalRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-1">Pending Payments</p>
            <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">RM {pendingRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Total Sales</p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{filteredSales.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-neutral-700 dark:text-neutral-300">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-neutral-700 dark:text-neutral-300">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-neutral-700 dark:text-neutral-300">Payment Status</label>
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleApplyFilters}
              className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      {filteredSales.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Email</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Buyer</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Sale Date</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Price</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Payment Method</th>
                <th className="text-left p-3 text-neutral-700 dark:text-neutral-300">Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((user) => (
                <tr key={user.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className="p-3 font-medium text-neutral-900 dark:text-white">{user.account_email}</td>
                  <td className="p-3">
                    {user.buyer_name ? (
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-white">{user.buyer_name}</div>
                        {user.buyer_email && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">{user.buyer_email}</div>
                        )}
                        {user.buyer_phone && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">{user.buyer_phone}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">{formatDate(user.sale_date)}</td>
                  <td className="p-3 font-medium text-neutral-900 dark:text-white">{formatCurrency(user.sale_price)}</td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">{user.payment_method || '-'}</td>
                  <td className="p-3">{getPaymentStatusBadge(user.payment_status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-neutral-500 dark:text-neutral-400">No sales found</p>
        </div>
      )}
    </div>
  );
};

export default SalesHistoryView;


