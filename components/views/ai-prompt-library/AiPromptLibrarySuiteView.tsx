
import React, { useState, useEffect } from 'react';
import LibraryView from './LibraryView';
import PromptViralMyView from './PromptViralMyView';
import Tabs, { type Tab } from '../../common/Tabs';
import { type Language } from '../../../types';
import { BRAND_CONFIG } from '../../../services/brandConfig';

interface AiPromptLibrarySuiteViewProps {
    onUsePrompt: (prompt: string) => void;
    language: Language;
}

type TabId = 'library' | 'viral-my';

const AiPromptLibrarySuiteView: React.FC<AiPromptLibrarySuiteViewProps> = ({ onUsePrompt, language }) => {
    const isEsaie = BRAND_CONFIG.name === 'ESAIE';
    const [activeTab, setActiveTab] = useState<TabId>('library');

    // Filter tabs based on brand - hide "Viral Prompts (MY)" for ESAIE
    const allTabs: Tab<TabId>[] = [
        { id: 'library', label: "Prompt Library" },
        { id: 'viral-my', label: "Viral Prompts (MY)" },
    ];
    
    const tabs: Tab<TabId>[] = isEsaie 
        ? allTabs.filter(tab => tab.id !== 'viral-my')
        : allTabs;

    // Ensure activeTab is valid - if ESAIE and somehow on viral-my, switch to library
    useEffect(() => {
        if (isEsaie && activeTab === 'viral-my') {
            setActiveTab('library');
        }
    }, [isEsaie, activeTab]);

    const renderActiveTabContent = () => {
        switch (activeTab) {
            case 'library':
                return <LibraryView onUsePrompt={onUsePrompt} language={language} />;
            case 'viral-my':
                // PromptViralMyView does not require a language prop as its content is curated.
                return <PromptViralMyView onUsePrompt={onUsePrompt} />;
            default:
                return <LibraryView onUsePrompt={onUsePrompt} language={language} />;
        }
    };

    return (
        <div className="h-auto lg:h-full flex flex-col">
            <div className="flex-shrink-0 mb-6 flex justify-center">
                <Tabs 
                    tabs={tabs}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
                {renderActiveTabContent()}
            </div>
        </div>
    );
};

export default AiPromptLibrarySuiteView;
