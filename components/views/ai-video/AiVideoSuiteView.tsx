
import React, { useState, useEffect, useMemo } from 'react';
import VideoGenerationView from './VideoGenerationView';
import SeedanceView from './SeedanceView';
import { VideoCombinerView } from './VideoCombinerView';
import VoiceStudioView from './VoiceStudioView';
import ProductReviewView from './ProductReviewView';
import Tabs, { type Tab } from '../../common/Tabs';
import { type BatchProcessorPreset, type User, type Language } from '../../../types';
import BatchProcessorView from './BatchProcessorView';
import { isElectron, isLocalhost } from '../../../services/environment';


type TabId = 'generation' | 'seedance' | 'storyboard' | 'batch' | 'combiner' | 'voice';

interface VideoGenPreset {
  prompt: string;
  image: { base64: string; mimeType: string; };
}

interface ImageEditPreset {
  base64: string;
  mimeType: string;
}

interface AiVideoSuiteViewProps {
  preset: VideoGenPreset | null;
  clearPreset: () => void;
  onReEdit: (preset: ImageEditPreset) => void;
  onCreateVideo: (preset: VideoGenPreset) => void;
  currentUser: User;
  onUserUpdate: (user: User) => void;
  language: Language;
}

const AiVideoSuiteView: React.FC<AiVideoSuiteViewProps> = ({ preset, clearPreset, onReEdit, onCreateVideo, currentUser, onUserUpdate, language }) => {
    const [activeTab, setActiveTab] = useState<TabId>('generation');

    // Check if Video Combiner should be visible (localhost or Electron only)
    const showVideoCombiner = isElectron() || isLocalhost();

    const tabs: Tab<TabId>[] = [
        { id: 'generation', label: "Video Generation" },
        { id: 'seedance', label: "Seedance 2.0" },
        { id: 'storyboard', label: "Video Storyboard" },
        { id: 'batch', label: "Batch Processing", adminOnly: true },
        ...(showVideoCombiner ? [{ id: 'combiner' as TabId, label: "Video Combiner" }] : []),
        { id: 'voice', label: "Voice Studio" }
    ];

    useEffect(() => {
        if (preset) {
            setActiveTab('generation');
        }
    }, [preset]);
    
    useEffect(() => {
        // If user is not admin and tries to access admin-only tabs, redirect
        if (currentUser.role !== 'admin' && activeTab === 'batch') {
            setActiveTab('generation');
        }
        // If Video Combiner is not available and user is on that tab, redirect
        if (!showVideoCombiner && activeTab === 'combiner') {
            setActiveTab('generation');
        }
    }, [currentUser.role, activeTab, showVideoCombiner]);

    const renderActiveTabContent = () => {
        switch (activeTab) {
            case 'generation':
                return <VideoGenerationView 
                            preset={preset} 
                            clearPreset={clearPreset} 
                            currentUser={currentUser}
                            onUserUpdate={onUserUpdate}
                            language={language}
                        />;
            case 'seedance':
                return <SeedanceView currentUser={currentUser} language={language} />;
            case 'storyboard':
                return <ProductReviewView 
                            onReEdit={onReEdit} 
                            onCreateVideo={onCreateVideo} 
                            currentUser={currentUser}
                            onUserUpdate={onUserUpdate}
                            language={language}
                        />;
            case 'batch':
                return <BatchProcessorView preset={null} clearPreset={() => {}} language={language} />;
            case 'combiner':
                return <VideoCombinerView language={language} />;
            case 'voice':
                return <VoiceStudioView language={language} />;
            default:
                return <VideoGenerationView 
                            preset={preset} 
                            clearPreset={clearPreset} 
                            currentUser={currentUser}
                            onUserUpdate={onUserUpdate}
                            language={language}
                        />;
        }
    };

    // 'storyboard' (ProductReviewView) is the only view that is NOT a fixed-height layout and needs external scrolling.
    const isScrollableTab = activeTab === 'storyboard';

    return (
        <div className="h-auto lg:h-full flex flex-col">
            <div className="flex-shrink-0 mb-6 flex justify-center">
                <Tabs 
                    tabs={tabs}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    isAdmin={currentUser.role === 'admin'}
                />
            </div>
            <div className={`flex-1 min-h-0 ${isScrollableTab ? 'overflow-y-auto' : ''}`}>
                {renderActiveTabContent()}
            </div>
        </div>
    );
};

export default AiVideoSuiteView;
