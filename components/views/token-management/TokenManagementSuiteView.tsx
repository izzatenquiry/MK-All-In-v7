import React, { useState } from 'react';
import Tabs, { type Tab } from '../../common/Tabs';
import SuiteLayout from '../../common/SuiteLayout';
import TokenDashboardView from './TokenDashboardView';
import UserManagementView from './UserManagementView';
import CookieManagementView from './CookieManagementView';
import FlowAccountManagementView from './FlowAccountManagementView';
import ApiRequestsView from './ApiRequestsView';
import GetTokenView from './GetTokenView';
import { type User, type Language } from '../../../types';

type TokenManagementTabId = 
  | 'dashboard' 
  | 'users' 
  | 'cookies' 
  | 'flow-accounts' 
  | 'api-requests' 
  | 'get-token';

interface TokenManagementSuiteViewProps {
  currentUser: User;
  language: Language;
}

const TokenManagementSuiteView: React.FC<TokenManagementSuiteViewProps> = ({ 
  currentUser, 
  language 
}) => {
  const [activeTab, setActiveTab] = useState<TokenManagementTabId>('dashboard');

  const tabs: Tab<TokenManagementTabId>[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'users', label: 'User Management' },
    { id: 'flow-accounts', label: 'Flow Accounts' },
    { id: 'cookies', label: 'Cookie Pool' },
    { id: 'api-requests', label: 'API Requests' },
    { id: 'get-token', label: 'Get Token' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <TokenDashboardView language={language} />;
      case 'users':
        return <UserManagementView language={language} />;
      case 'cookies':
        return <CookieManagementView language={language} />;
      case 'flow-accounts':
        return <FlowAccountManagementView language={language} />;
      case 'api-requests':
        return <ApiRequestsView language={language} />;
      case 'get-token':
        return <GetTokenView language={language} />;
      default:
        return null;
    }
  };

  return (
    <SuiteLayout title="Token Management Suite">
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

export default TokenManagementSuiteView;
