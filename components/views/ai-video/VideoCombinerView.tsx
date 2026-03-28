
import React, { useState, useEffect, useRef } from 'react';
import { getHistory } from '../../../services/historyService';
// FIX: Add missing Language import.
import { type HistoryItem, type Language } from '../../../types';
import Spinner from '../../common/Spinner';
import { FilmIcon, DownloadIcon, CheckCircleIcon, AlertTriangleIcon } from '../../Icons';
import TwoColumnLayout from '../../common/TwoColumnLayout';


type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// FIX: Add language prop to component props.
const VideoCombinerView: React.FC<{ language: Language }> = ({ language }) => {
    const [allVideos, setAllVideos] = useState<HistoryItem[]>([]);
    const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
    const [isCombining, setIsCombining] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    const [outputUrl, setOutputUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map());
    const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
    const loadingAttemptRef = useRef(false);

    // Use server-side video combining (localhost:3001)
    useEffect(() => {
        // Server-side combining doesn't need FFmpeg in browser
        setEngineStatus('ready');
        setError(null);
    }, []);

    // Fetch videos
    useEffect(() => {
        const fetchVideos = async () => {
            const history = await getHistory();
            const videoItems = history.filter(item => item.type === 'Video');
            setAllVideos(videoItems);

            const newUrls = new Map<string, string>();
            videoItems.forEach(item => {
                if (item.result instanceof Blob) {
                    newUrls.set(item.id, URL.createObjectURL(item.result));
                }
            });
            setBlobUrls(newUrls);
        };
        fetchVideos();

        return () => {
            blobUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    // Cleanup output
    useEffect(() => {
        return () => {
            if (outputUrl) URL.revokeObjectURL(outputUrl);
        };
    }, [outputUrl]);

    const toggleVideoSelection = (id: string) => {
        setSelectedVideos(prev => 
            prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
        );
    };

    // Helper function to get selection number based on order
    const getSelectionNumber = (id: string): number | null => {
        const index = selectedVideos.indexOf(id);
        return index !== -1 ? index + 1 : null;
    };

    const handleCombine = async () => {
        if (selectedVideos.length < 2) {
            setError("Please select at least 2 videos to combine.");
            return;
        }

        setIsCombining(true);
        setError(null);
        setProgressMessage('Preparing videos...');
        if (outputUrl) URL.revokeObjectURL(outputUrl);
        setOutputUrl(null);

        try {
            // Map selectedVideos order to actual video items to preserve selection order
            const selectedItems = selectedVideos
                .map(id => allVideos.find(v => v.id === id))
                .filter((item): item is HistoryItem => item !== undefined);
            
            // Prepare FormData with video files
            const formData = new FormData();
            for (let i = 0; i < selectedItems.length; i++) {
                const item = selectedItems[i];
                if (!(item.result instanceof Blob)) {
                    throw new Error(`Video ${i + 1} is invalid`);
                }
                
                setProgressMessage(`Uploading video ${i + 1}/${selectedItems.length}...`);
                formData.append('videos', item.result, `video${i}.mp4`);
            }

            setProgressMessage('Combining videos on server... This may take a moment.');

            // Send to backend server
            const response = await fetch('http://localhost:3001/api/video/combine', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Server error' }));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            setProgressMessage('Finalizing...');
            
            // Get the combined video as blob
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setOutputUrl(url);
            
            setProgressMessage('');

        } catch (err) {
            console.error('❌ Combine error:', err);
            const errorMsg = err instanceof Error ? err.message : 'Combine operation failed';
            setError(errorMsg);
        } finally {
            setIsCombining(false);
            setProgressMessage('');
        }
    };
    
    const handleReset = () => {
        setSelectedVideos([]);
        setOutputUrl(null);
        setError(null);
        setProgressMessage('');
    };

    const leftPanel = (
        <>
            <div>
                <h1 className="text-xl font-bold sm:text-3xl">Video Combiner</h1>
                <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mt-1">Combine multiple clips from your gallery into a single video.</p>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
                <h3 className="text-lg font-semibold mb-2 flex-shrink-0">Select Videos from Your Gallery</h3>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar bg-neutral-100 dark:bg-neutral-800/50 p-3 rounded-lg">
                    {allVideos.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {allVideos.map(video => {
                                const isSelected = selectedVideos.includes(video.id);
                                const selectionNumber = getSelectionNumber(video.id);
                                const url = blobUrls.get(video.id);
                                return (
                                    <div key={video.id} className="relative aspect-square cursor-pointer" onClick={() => toggleVideoSelection(video.id)}>
                                        {url ? <video src={url} className="w-full h-full object-cover rounded-md bg-black" /> : <div className="w-full h-full bg-neutral-200 dark:bg-neutral-700 rounded-md"></div>}
                                        {isSelected && (
                                            <div className="absolute inset-0 bg-primary-500/50 flex items-center justify-center rounded-md ring-4 ring-primary-500">
                                                <div className="flex flex-col items-center justify-center gap-1">
                                                    <CheckCircleIcon className="w-8 h-8 text-white"/>
                                                    {selectionNumber !== null && (
                                                        <div className="bg-white text-primary-600 font-bold text-lg rounded-full w-8 h-8 flex items-center justify-center shadow-lg">
                                                            {selectionNumber}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-center text-sm text-neutral-500">No videos found in your gallery.</p>
                    )}
                </div>
            </div>

            <div className="pt-4 mt-auto flex flex-col gap-4">
                 {engineStatus === 'loading' && (
                    <div className="flex items-center gap-2 p-3 bg-blue-100 dark:bg-blue-900/40 rounded-md">
                        <Spinner />
                        <p className="text-sm text-blue-800 dark:text-blue-300">{progressMessage || 'Loading video engine...'}</p>
                    </div>
                )}
                 {error && engineStatus === 'error' && (
                    <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <AlertTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-red-800 dark:text-red-300">
                            <p className="font-semibold mb-1">Error</p>
                            <p className="text-xs">{error}</p>
                        </div>
                    </div>
                )}
                 <div className="flex gap-4">
                    <button onClick={handleCombine} disabled={isCombining || selectedVideos.length < 2} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {isCombining ? <Spinner/> : 'Combine Videos'}
                    </button>
                    <button onClick={handleReset} disabled={isCombining} className="flex-shrink-0 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-3 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50">
                        Reset
                    </button>
                </div>
            </div>
        </>
    );

    const rightPanel = (
        <>
            {isCombining ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                    <Spinner />
                    <p className="text-neutral-500 dark:text-neutral-400">{progressMessage || 'Processing...'}</p>
                </div>
            ) : error ? (
                <div className="text-center p-6 text-red-500 dark:text-red-400">
                    <AlertTriangleIcon className="w-12 h-12 mx-auto mb-3"/>
                    <p className="font-semibold mb-2">Error</p>
                    <p className="text-sm">{error}</p>
                    {error.includes('FFmpeg is not installed') && (
                        <div className="text-xs text-left bg-red-50 dark:bg-red-900/20 p-3 rounded-lg mt-4">
                            <p className="font-semibold mb-2">Install FFmpeg:</p>
                            <ul className="list-disc list-inside space-y-1 text-left">
                                <li>Windows: <code className="bg-red-100 dark:bg-red-900 px-1 rounded">choco install ffmpeg</code></li>
                                <li>Mac: <code className="bg-red-100 dark:bg-red-900 px-1 rounded">brew install ffmpeg</code></li>
                                <li>Linux: <code className="bg-red-100 dark:bg-red-900 px-1 rounded">apt-get install ffmpeg</code></li>
                            </ul>
                        </div>
                    )}
                </div>
            ) : outputUrl ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                    <video src={outputUrl} controls autoPlay className="max-w-full max-h-[80%] rounded-md"/>
                    <a href={outputUrl} download={`monoklix-combined-${Date.now()}.mp4`} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-green-700 transition-colors">
                        <DownloadIcon className="w-4 h-4"/> Download Combined Video
                    </a>
                </div>
            ) : (
                <div className="text-center text-neutral-500 dark:text-neutral-600">
                    <FilmIcon className="w-16 h-16 mx-auto" />
                    <p>Your combined video will appear here.</p>
                </div>
            )}
        </>
    );
    
    // FIX: Pass the 'language' prop to the TwoColumnLayout component.
    return <TwoColumnLayout leftPanel={leftPanel} rightPanel={rightPanel} language={language} />;
};

// FIX: Change to named export to match the import in AiVideoSuiteView
export { VideoCombinerView };
