
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { generateText } from '../../../services/geminiService';
import { addHistoryItem } from '../../../services/historyService';
import Spinner from '../../common/Spinner';
import MarkdownRenderer from '../../common/MarkdownRenderer';
import {
    UserIcon, SmileyIcon, LightbulbIcon, FileTextIcon, ClipboardListIcon, TrendingUpIcon, StoreIcon, MegaphoneIcon, FilmIcon, UsersIcon, ImageIcon, GalleryIcon, DownloadIcon, ClipboardIcon, CheckCircleIcon, AIAgentIcon
} from '../../Icons';
import TwoColumnLayout from '../../common/TwoColumnLayout';
import { getStaffVeolyPrompt } from '../../../services/promptManager';
import { type Language } from '../../../types';
import { getTranslations } from '../../../services/translations';
import { BRAND_CONFIG } from '../../../services/brandConfig';
import { handleApiError } from '../../../services/errorHandler';

interface AiAgent {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
}

const aiAgents: AiAgent[] = [
    { id: 'wan', name: 'Wan', description: 'Ideal Customer Persona', icon: UserIcon, placeholder: 'Describe your product or service...' },
    { id: 'tina', name: 'Tina', description: 'Fear & Desire', icon: SmileyIcon, placeholder: 'Describe your product or service...' },
    { id: 'jamil', name: 'Jamil', description: 'Marketing Angle', icon: LightbulbIcon, placeholder: 'Describe your product or service...' },
    { id: 'najwa', name: 'Najwa', description: 'Copywriter', icon: FileTextIcon, placeholder: 'Describe your product or service...' },
    { id: 'saifuz', name: 'Saifuz', description: 'Copy variations', icon: ClipboardListIcon, placeholder: 'Enter your original sales copy...' },
    { id: 'mieya', name: 'Mieya', description: 'Formula Copywriting (AIDA)', icon: TrendingUpIcon, placeholder: 'Describe your product or service...' },
    { id: 'afiq', name: 'Afiq', description: 'Sales Page Creator', icon: StoreIcon, placeholder: 'Describe your product or service...' },
    { id: 'julia', name: 'Julia', description: 'Headline Brainstormer', icon: MegaphoneIcon, placeholder: 'Describe your product or service...' },
    { id: 'mazrul', name: 'Mazrul', description: 'Script Writer', icon: FilmIcon, placeholder: 'Describe your product or service...' },
    { id: 'musa', name: 'Musa', description: 'LinkedIn Personal Branding', icon: UsersIcon, placeholder: 'State platform and topic. E.g. LinkedIn, Topic: Why personal branding matters' },
    { id: 'joe_davinci', name: 'Joe', description: 'Image Prompter', icon: ImageIcon, placeholder: 'E.g. Theme: Cute cat, Style: Realistic, Element: Cat sleeping on a sofa.' },
    { id: 'zaki', name: 'Zaki', description: 'Poster Prompter', icon: GalleryIcon, placeholder: 'E.g. Purpose: Event ad, Style: Modern, Text: Big Sale, Color: Red.' }
];

const languages = ["English", "Malay"];
const SESSION_KEY = 'staffVeolyState';

const downloadText = (text: string, fileName: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

interface StaffVeolyViewProps {
    language: Language;
}

const StaffVeolyView: React.FC<StaffVeolyViewProps> = ({ language }) => {
    const [selectedAgentId, setSelectedAgentId] = useState<string>('wan');
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedCopy, setGeneratedCopy] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState("Malay");

    // FIX: Remove 'language' argument from getTranslations calls.
    const T = getTranslations().staffVeolyView;
    const commonT = getTranslations();

    const selectedAgent = useMemo(() => aiAgents.find(agent => agent.id === selectedAgentId)!, [selectedAgentId]);

    useEffect(() => {
        try {
            const savedState = sessionStorage.getItem(SESSION_KEY);
            if (savedState) {
                const state = JSON.parse(savedState);
                if (state.selectedAgentId) setSelectedAgentId(state.selectedAgentId);
                if (state.userInput) setUserInput(state.userInput);
                if (state.generatedCopy) setGeneratedCopy(state.generatedCopy);
                if (state.selectedLanguage) {
                    setSelectedLanguage(state.selectedLanguage === 'Bahasa Malaysia' ? 'Malay' : state.selectedLanguage);
                }
            }
        } catch (e) { console.error("Failed to load state from session storage", e); }
    }, []);

    useEffect(() => {
        try {
            const stateToSave = { selectedAgentId, userInput, generatedCopy, selectedLanguage };
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateToSave));
        } catch (e: any) {
            if (e.name !== 'QuotaExceededError' && e.code !== 22) {
                console.error("Failed to save state to session storage", e);
            }
        }
    }, [selectedAgentId, userInput, generatedCopy, selectedLanguage]);

    const handleGenerate = useCallback(async () => {
        if (!userInput.trim()) {
            setError(`Please provide input for ${selectedAgent.name}.`);
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedCopy('');
        setCopied(false);

        const finalPrompt = getStaffVeolyPrompt({
            agentId: selectedAgent.id,
            userInput: userInput,
            language: selectedLanguage,
        });

        try {
            const result = await generateText(finalPrompt);
            setGeneratedCopy(result);
            await addHistoryItem({
                type: 'Copy',
                prompt: `Staff ${BRAND_CONFIG.name} (${selectedAgent.name}): ${userInput.substring(0, 50)}... (Lang: ${selectedLanguage})`,
                result: result,
            });
        } catch (e) {
            handleApiError(e);
            setError("Failed");
        } finally {
            setIsLoading(false);
        }
    }, [userInput, selectedAgent, selectedLanguage]);

    const handleCopy = () => {
        if (!generatedCopy) return;
        navigator.clipboard.writeText(generatedCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    const handleReset = useCallback(() => {
        setSelectedAgentId('wan');
        setUserInput('');
        setGeneratedCopy('');
        setError(null);
        setSelectedLanguage(language === 'ms' ? "Malay" : "English");
        sessionStorage.removeItem(SESSION_KEY);
    }, [language]);

    const leftPanel = (
        <>
            <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">{T.title}</h1>
                <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mt-1">{T.subtitle}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                {aiAgents.map(agent => {
                    const isSelected = agent.id === selectedAgentId;
                    return (
                        <button
                            key={agent.id}
                            onClick={() => {
                                setSelectedAgentId(agent.id);
                                setUserInput('');
                            }}
                            className={`p-2 sm:p-3 rounded-lg text-center border-[0.5px] transition-all duration-200 ${
                                isSelected 
                                ? 'border-primary-500/80 bg-primary-50 dark:bg-primary-900/20 shadow-md transform scale-105' 
                                : 'border-neutral-200/80 dark:border-neutral-700/80 bg-white dark:bg-neutral-800/50 hover:border-neutral-400/80 dark:hover:border-neutral-500/80'
                            }`}
                        >
                            <agent.icon className={`w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1 sm:mb-2 ${isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-500'}`} />
                            <p className={`font-bold text-xs sm:text-sm ${isSelected ? 'text-primary-700 dark:text-white' : 'text-neutral-800 dark:text-neutral-200'}`}>{agent.name}</p>
                            <p className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 leading-tight">{agent.description}</p>
                        </button>
                    )
                })}
            </div>

            <div className="flex flex-col gap-4">
                <div>
                    <label htmlFor="agent-input" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                        {T.inputFor} {selectedAgent.name}
                    </label>
                    <textarea
                        id="agent-input"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder={selectedAgent.placeholder}
                        rows={4}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none transition"
                    />
                </div>

                <div>
                    <label htmlFor="agent-language" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                        {T.outputLanguage}
                    </label>
                    <select
                        id="agent-language"
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none transition"
                    >
                        {languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                    </select>
                </div>
            </div>

            <div className="pt-4 mt-auto">
                <div className="flex gap-4">
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                        {isLoading ? <Spinner /> : T.generateButton}
                    </button>
                    <button
                        onClick={handleReset}
                        disabled={isLoading}
                        className="flex-shrink-0 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-3 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50 text-sm"
                    >
                        {T.resetButton}
                    </button>
                </div>
                {error && error !== 'Failed' && <p className="text-red-500 dark:text-red-400 mt-2 text-center text-sm">{error}</p>}
            </div>
        </>
    );

     const rightPanel = (
        <>
             {generatedCopy && !isLoading && (
                <div className="absolute top-3 right-3 flex gap-2 z-10">
                    <button 
                      onClick={handleCopy}
                      className="flex items-center gap-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-semibold py-1.5 px-3 rounded-full hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                    >
                      {copied ? <CheckCircleIcon className="w-4 h-4 text-green-500"/> : <ClipboardIcon className="w-4 h-4"/>}
                      {/* FIX: Correctly access translation keys from the 'common' object. */}
                      {copied ? commonT.common.copied : commonT.common.copy}
                    </button>
                    <button
                        onClick={() => downloadText(generatedCopy, `${BRAND_CONFIG.shortName.toLowerCase()}-staff-${selectedAgent.id}.txt`)}
                        className="flex items-center gap-1.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold py-1.5 px-3 rounded-full hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                    >
                        <DownloadIcon className="w-4 h-4" /> {T.download}
                    </button>
                </div>
            )}
             {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                    <Spinner />
                    <p className="text-neutral-500 dark:text-neutral-400">Generating...</p>
                </div>
            ) : generatedCopy ? (
                <div className="w-full h-full overflow-y-auto pr-2 custom-scrollbar">
                     {/* FIX: Pass missing 'language' prop to MarkdownRenderer. */}
                     <MarkdownRenderer content={generatedCopy} language={language} />
                </div>
            ) : (
                 <div className="flex items-center justify-center h-full text-center text-neutral-500 dark:text-neutral-600 p-4">
                    <div>
                        <AIAgentIcon className="w-16 h-16 mx-auto" />
                        <p>{T.outputPlaceholder}</p>
                    </div>
                </div>
            )}
        </>
    );

    // FIX: Pass missing 'language' prop to TwoColumnLayout.
    return <TwoColumnLayout leftPanel={leftPanel} rightPanel={rightPanel} language={language} />;
};

export default StaffVeolyView;
