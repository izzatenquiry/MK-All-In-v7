import React, { useState, useCallback } from 'react';
import TwoColumnLayout from '../../common/TwoColumnLayout';
import Spinner from '../../common/Spinner';
import ImageUpload from '../../common/ImageUpload';
import { DownloadIcon, RefreshCwIcon, KeyIcon, TrashIcon } from '../../Icons';
import { type User, type Language } from '../../../types';
import {
  generateSeedanceVideo,
  uploadImageForSeedance,
  type SeedanceCreateParams,
  type SeedanceFunctionMode,
  type SeedanceRatio,
  type SeedanceSpeedMode,
} from '../../../services/seedanceService';
import { getServerUrl } from '../../../services/serverConfig';
import { handleApiError } from '../../../services/errorHandler';

const SEEDANCE_STORAGE_KEY_PREFIX = 'seedance_api_key_';

const RATIOS: { value: SeedanceRatio; label: string }[] = [
  { value: '21:9', label: '21:9' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16 (Portrait)' },
];

const DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

interface SeedanceViewProps {
  currentUser: User;
  language: Language;
}

const SeedanceView: React.FC<SeedanceViewProps> = ({ currentUser, language }) => {
  const [apiKeyInput, setApiKeyInput] = useState(() => {
    try {
      return localStorage.getItem(`${SEEDANCE_STORAGE_KEY_PREFIX}${currentUser?.id}`) || '';
    } catch {
      return '';
    }
  });
  const [prompt, setPrompt] = useState('');
  const [functionMode, setFunctionMode] = useState<SeedanceFunctionMode>('first_last_frames');
  const [ratio, setRatio] = useState<SeedanceRatio>('16:9');
  const [duration, setDuration] = useState(5);
  const [speedMode, setSpeedMode] = useState<SeedanceSpeedMode>('seedance_2.0_fast');
  const [imageUrl, setImageUrl] = useState(''); // first frame or omni ref (from upload or paste)
  const [secondImageUrl, setSecondImageUrl] = useState(''); // last frame (from upload or paste)
  const [firstUploading, setFirstUploading] = useState(false);
  const [secondUploading, setSecondUploading] = useState(false);
  const [firstPreviewUrl, setFirstPreviewUrl] = useState<string | null>(null);
  const [secondPreviewUrl, setSecondPreviewUrl] = useState<string | null>(null);
  const [imageUploadKey, setImageUploadKey] = useState({ first: 0, second: 0 });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const apiKey = apiKeyInput.trim();

  const saveApiKey = useCallback(() => {
    if (!currentUser?.id || !apiKey) return;
    try {
      localStorage.setItem(`${SEEDANCE_STORAGE_KEY_PREFIX}${currentUser.id}`, apiKey);
    } catch (e) {
      console.error('Failed to save Seedance API key', e);
    }
  }, [currentUser?.id, apiKey]);

  const handleFirstFrameUpload = useCallback(async (base64: string, mimeType: string) => {
    setFirstUploading(true);
    setError(null);
    try {
      const serverUrl = getServerUrl();
      const { url } = await uploadImageForSeedance(serverUrl, base64, mimeType);
      setImageUrl(url);
      setFirstPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'First frame upload failed');
    } finally {
      setFirstUploading(false);
    }
  }, []);

  const handleSecondFrameUpload = useCallback(async (base64: string, mimeType: string) => {
    setSecondUploading(true);
    setError(null);
    try {
      const serverUrl = getServerUrl();
      const { url } = await uploadImageForSeedance(serverUrl, base64, mimeType);
      setSecondImageUrl(url);
      setSecondPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Last frame upload failed');
    } finally {
      setSecondUploading(false);
    }
  }, []);

  const handleOmniRefUpload = useCallback(async (base64: string, mimeType: string) => {
    setFirstUploading(true);
    setError(null);
    try {
      const serverUrl = getServerUrl();
      const { url } = await uploadImageForSeedance(serverUrl, base64, mimeType);
      setImageUrl(url);
      setFirstPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reference image upload failed');
    } finally {
      setFirstUploading(false);
    }
  }, []);

  const removeFirstFrame = useCallback(() => {
    setImageUrl('');
    setFirstPreviewUrl(null);
    setImageUploadKey((k) => ({ ...k, first: k.first + 1 }));
  }, []);

  const removeSecondFrame = useCallback(() => {
    setSecondImageUrl('');
    setSecondPreviewUrl(null);
    setImageUploadKey((k) => ({ ...k, second: k.second + 1 }));
  }, []);

  const removeOmniRef = useCallback(() => {
    setImageUrl('');
    setFirstPreviewUrl(null);
    setImageUploadKey((k) => ({ ...k, first: k.first + 1 }));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!apiKey) {
      setError('Please enter your Seedance API key.');
      return;
    }
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }
    setError(null);
    setVideoUrl(null);
    setIsLoading(true);
    setStatusMessage('Starting...');

    const params: SeedanceCreateParams = {
      prompt: prompt.trim(),
      functionMode,
      ratio,
      duration,
      speedMode,
    };

    if (functionMode === 'first_last_frames') {
      const urls: string[] = [];
      if (imageUrl.trim()) urls.push(imageUrl.trim());
      if (secondImageUrl.trim()) urls.push(secondImageUrl.trim());
      if (urls.length) params.filePaths = urls;
    } else {
      if (imageUrl.trim()) params.image_files = [imageUrl.trim()];
    }

    try {
      const url = await generateSeedanceVideo(params, apiKey, setStatusMessage);
      setVideoUrl(url);
      saveApiKey();
    } catch (e) {
      setError(handleApiError(e));
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  }, [apiKey, prompt, functionMode, ratio, duration, speedMode, imageUrl, secondImageUrl, saveApiKey]);

  const handleDownload = useCallback(async () => {
    if (!videoUrl) return;
    setIsDownloading(true);
    try {
      const res = await fetch(videoUrl);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `seedance-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  }, [videoUrl]);

  const leftPanel = (
    <>
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Seedance 2.0 — Testing mode</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          ByteDance AI video. Use your own API key from the official provider.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
          <KeyIcon className="w-4 h-4 inline mr-1" />
          Seedance API Key
        </label>
        <input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder="sk-your-api-key"
          className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono text-sm"
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Get your key from the official Seedance / Xskill AI API key page. Stored locally only.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-2">Mode</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setFunctionMode('first_last_frames')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              functionMode === 'first_last_frames'
                ? 'bg-primary-600 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            First/Last Frames
          </button>
          <button
            type="button"
            onClick={() => setFunctionMode('omni_reference')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              functionMode === 'omni_reference'
                ? 'bg-primary-600 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            Omni Reference
          </button>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          First/Last: upload 1–2 images (temp URL, deleted after 3 min). Omni: upload reference image, use @image_file_1 in prompt.
        </p>
      </div>

      {functionMode === 'first_last_frames' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">First frame (optional)</label>
            {firstPreviewUrl ? (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                <img src={firstPreviewUrl} alt="First frame" className="w-full h-full object-contain" />
                <button type="button" onClick={removeFirstFrame} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600">
                  <TrashIcon className="w-4 h-4" />
                </button>
                {firstUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Spinner /></div>}
              </div>
            ) : (
              <ImageUpload
                id="seedance-first"
                key={`first-${imageUploadKey.first}`}
                onImageUpload={handleFirstFrameUpload}
                title={firstUploading ? 'Uploading...' : 'Upload image'}
                language={language}
              />
            )}
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Or paste URL below. File is stored temporarily (3 min).</p>
            <input
              type="url"
              value={imageUrl && imageUrl.startsWith('http') && !imageUrl.includes('/api/seedance/') ? imageUrl : ''}
              onChange={(e) => { const v = e.target.value.trim(); setImageUrl(v); setFirstPreviewUrl(v || null); }}
              placeholder="Or paste image URL"
              className="mt-1 w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Last frame (optional)</label>
            {secondPreviewUrl ? (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                <img src={secondPreviewUrl} alt="Last frame" className="w-full h-full object-contain" />
                <button type="button" onClick={removeSecondFrame} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600">
                  <TrashIcon className="w-4 h-4" />
                </button>
                {secondUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Spinner /></div>}
              </div>
            ) : (
              <ImageUpload
                id="seedance-second"
                key={`second-${imageUploadKey.second}`}
                onImageUpload={handleSecondFrameUpload}
                title={secondUploading ? 'Uploading...' : 'Upload image'}
                language={language}
              />
            )}
            <input
              type="url"
              value={secondImageUrl && secondImageUrl.startsWith('http') && !secondImageUrl.includes('/api/seedance/') ? secondImageUrl : ''}
              onChange={(e) => { const v = e.target.value.trim(); setSecondImageUrl(v); setSecondPreviewUrl(v || null); }}
              placeholder="Or paste image URL"
              className="mt-1 w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm"
            />
          </div>
        </div>
      )}
      {functionMode === 'omni_reference' && (
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Reference image (optional). Use @image_file_1 in prompt.</label>
          {firstPreviewUrl ? (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800">
              <img src={firstPreviewUrl} alt="Reference" className="w-full h-full object-contain" />
              <button type="button" onClick={removeOmniRef} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600">
                <TrashIcon className="w-4 h-4" />
              </button>
              {firstUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Spinner /></div>}
            </div>
          ) : (
            <ImageUpload
              id="seedance-omni"
              key={`omni-${imageUploadKey.first}`}
              onImageUpload={handleOmniRefUpload}
              title={firstUploading ? 'Uploading...' : 'Upload reference image'}
              language={language}
            />
          )}
          <input
            type="url"
            value={imageUrl && imageUrl.startsWith('http') && !imageUrl.includes('/api/seedance/') ? imageUrl : ''}
            onChange={(e) => { const v = e.target.value.trim(); setImageUrl(v); setFirstPreviewUrl(v || null); }}
            placeholder="Or paste image URL"
            className="mt-1 w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm"
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Aspect Ratio</label>
          <select
            value={ratio}
            onChange={(e) => setRatio(e.target.value as SeedanceRatio)}
            className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none"
          >
            {RATIOS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Duration (sec)</label>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Speed</label>
        <select
          value={speedMode}
          onChange={(e) => setSpeedMode(e.target.value as SeedanceSpeedMode)}
          className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none"
        >
          <option value="seedance_2.0_fast">Fast</option>
          <option value="seedance_2.0">Standard</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A sunset over the ocean, waves gently crashing. Or use @image_file_1 for Omni Reference."
          rows={4}
          className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleGenerate}
          disabled={isLoading || !apiKey || !prompt.trim()}
          className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? <Spinner /> : 'Generate Video'}
        </button>
        <button
          onClick={saveApiKey}
          disabled={!apiKey}
          className="px-4 py-3 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50"
        >
          Save Key
        </button>
      </div>
      {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}
    </>
  );

  const rightPanel = (
    <>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-2">
          <Spinner />
          <p className="text-neutral-500 dark:text-neutral-400">{statusMessage || 'Generating...'}</p>
        </div>
      ) : videoUrl ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4">
          <video
            src={videoUrl}
            controls
            autoPlay
            playsInline
            muted
            className="max-h-full max-w-full rounded-md"
          />
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center justify-center gap-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50"
          >
            {isDownloading ? <Spinner /> : <DownloadIcon className="w-4 h-4" />}
            {isDownloading ? 'Downloading...' : 'Download Video'}
          </button>
        </div>
      ) : error && !videoUrl ? (
        <div className="text-center text-red-500 dark:text-red-400 p-4">
          <p className="font-semibold">{error}</p>
          <button
            onClick={handleGenerate}
            className="mt-4 flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 mx-auto"
          >
            <RefreshCwIcon className="w-4 h-4" />
            Try Again
          </button>
        </div>
      ) : (
        <div className="text-center text-neutral-500 dark:text-neutral-400">
          <p>Your Seedance 2.0 video will appear here.</p>
          <p className="text-sm mt-2">Enter API key and prompt, then click Generate Video.</p>
        </div>
      )}
    </>
  );

  return <TwoColumnLayout leftPanel={leftPanel} rightPanel={rightPanel} language={language} />;
};

export default SeedanceView;
