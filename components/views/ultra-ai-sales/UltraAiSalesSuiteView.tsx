import React, { useState } from 'react';
import Tabs, { type Tab } from '../../common/Tabs';
import SuiteLayout from '../../common/SuiteLayout';
import AccountListView from './AccountListView';
import UltraUserListView from './UltraUserListView';
import SalesHistoryView from './SalesHistoryView';
import StatisticsView from './StatisticsView';
import { type User, type Language } from '../../../types';

type UltraAiSalesTabId = 
  | 'accounts' 
  | 'users'
  | 'sales-history' 
  | 'statistics';

interface UltraAiSalesSuiteViewProps {
  currentUser: User;
  language: Language;
}

const UltraAiSalesSuiteView: React.FC<UltraAiSalesSuiteViewProps> = ({ 
  currentUser, 
  language 
}) => {
  const [activeTab, setActiveTab] = useState<UltraAiSalesTabId>('statistics');
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs: Tab<UltraAiSalesTabId>[] = [
    { id: 'statistics', label: 'Statistics' },
    { id: 'accounts', label: 'Account List' },
    { id: 'users', label: 'User List' },
    { id: 'sales-history', label: 'Sales History' },
  ];

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'accounts':
        return <AccountListView language={language} refreshKey={refreshKey} onRefresh={handleRefresh} />;
      case 'users':
        return <UltraUserListView language={language} refreshKey={refreshKey} onRefresh={handleRefresh} />;
      case 'sales-history':
        return <SalesHistoryView language={language} refreshKey={refreshKey} />;
      case 'statistics':
        return <StatisticsView language={language} refreshKey={refreshKey} />;
      default:
        return null;
    }
  };

  return (
    <SuiteLayout title="Google ULTRA AI Sales Management">
      <div className="h-auto lg:h-full flex flex-col">
        <div className="flex-shrink-0 mb-6 flex justify-center">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {renderContent()}
        </div>
      </div>
    </SuiteLayout>
  );
};

export default UltraAiSalesSuiteView;

