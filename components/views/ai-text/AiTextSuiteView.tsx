
import React, { useState, useEffect } from 'react';
import ContentIdeasView from './ContentIdeasView';
import MarketingCopyView from './MarketingCopyView';
import StaffVeolyView from './StaffVeolyView';
import Tabs, { type Tab } from '../../common/Tabs';
import { type User, type Language } from '../../../types';
import { BRAND_CONFIG } from '../../../services/brandConfig';

type TabId = 'staff-veoly' | 'content-ideas' | 'marketing-copy';

interface AiTextSuiteViewProps {
    currentUser: User;
    language: Language;
}

const AiTextSuiteView: React.FC<AiTextSuiteViewProps> = ({ currentUser, language }) => {
    const [activeTab, setActiveTab] = useState<TabId>('staff-veoly');

    const tabs: Tab<TabId>[] = [
        { id: 'staff-veoly', label: `Staff ${BRAND_CONFIG.name}` },
        { id: 'content-ideas', label: "Content Ideas" },
        { id: 'marketing-copy', label: "Marketing Copy" },
    ];

    const renderActiveTabContent = () => {
        switch (activeTab) {
            case 'staff-veoly':
                return <StaffVeolyView language={language} />;
            case 'content-ideas':
                return <ContentIdeasView language={language} />;
            case 'marketing-copy':
                return <MarketingCopyView language={language} />;
            default:
                return <StaffVeolyView language={language} />;
        }
    };

    return (
        <div className="h-auto lg:h-full flex flex-col">
            <div className="flex-shrink-0 mb-2 sm:mb-4 lg:mb-6 flex justify-center">
                <Tabs 
                    tabs={tabs}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    isAdmin={currentUser.role === 'admin'}
                />
            </div>
            <div className="flex-1 min-h-0">
                {renderActiveTabContent()}
            </div>
        </div>
    );
};

export default AiTextSuiteView;
