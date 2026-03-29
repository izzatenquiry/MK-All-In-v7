
import React, { useState, useCallback, useEffect } from 'react';
import { addHistoryItem } from '../../../services/historyService';
import ImageUpload from '../../common/ImageUpload';
import Spinner from '../../common/Spinner';
import { type MultimodalContent } from '../../../services/geminiService';
import { DownloadIcon, WandIcon, VideoIcon, ScissorsIcon } from '../../Icons';
import TwoColumnLayout from '../../common/TwoColumnLayout';
import { getImageEnhancementPrompt, getBackgroundRemovalPrompt } from '../../../services/promptManager';
import { handleApiError } from '../../../services/errorHandler';
import { editOrComposeWithNanoBanana } from '../../../services/imagenV3Service';
import { incrementImageUsage } from '../../../services/userService';
// FIX: Add missing Language import.
import { type User, type Language } from '../../../types';
import { BRAND_CONFIG } from '../../../services/brandConfig';


interface ImageData extends MultimodalContent {
  previewUrl: string;
}

type EnhancementType = 'upscale' | 'colors' | 'removeBg';

type ResultKind = 'enhance' | 'removeBg';

const triggerDownload = (data: string, fileNameBase: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${data}`;
    link.download = `${fileNameBase}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

interface VideoGenPreset {
  prompt: string;
  image: { base64: string; mimeType: string; };
}

interface ImageEditPreset {
  base64: string;
  mimeType: string;
}

interface ImageEnhancerViewProps {
  onReEdit: (preset: ImageEditPreset) => void;
  onCreateVideo: (preset: VideoGenPreset) => void;
  currentUser: User;
  onUserUpdate: (user: User) => void;
  // FIX: Add 'language' to props interface.
  language: Language;
}

const SESSION_KEY = 'imageEnhancerState';

const ImageEnhancerView: React.FC<ImageEnhancerViewProps> = ({ onReEdit, onCreateVideo, currentUser, onUserUpdate, language }) => {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enhancementType, setEnhancementType] = useState<EnhancementType>('upscale');
  const [resultKind, setResultKind] = useState<ResultKind | null>(null);
  const [imageUploadKey, setImageUploadKey] = useState(Date.now());

  const modeButtonClass = (active: boolean) =>
    `flex-1 min-w-0 px-2 sm:px-3 py-2 rounded-full font-semibold transition-colors text-xs sm:text-sm text-center ${
      active
        ? 'bg-primary-600 text-white'
        : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
    }`;

  useEffect(() => {
    try {
      const savedState = sessionStorage.getItem(SESSION_KEY);
      if (savedState) {
        const { enhancementType } = JSON.parse(savedState);
        // Do not load image data
        // if (imageData) setImageData(imageData);
        // if (resultImage) setResultImage(resultImage);
        if (enhancementType === 'upscale' || enhancementType === 'colors' || enhancementType === 'removeBg') {
          setEnhancementType(enhancementType);
        }
      }
    } catch (e) { console.error("Failed to load state from session storage", e); }
  }, []);

  useEffect(() => {
    try {
      // Only save non-image data to session storage to avoid quota errors.
      const stateToSave = { enhancementType };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateToSave));
    } catch (e: any) {
        if (e.name !== 'QuotaExceededError' && e.code !== 22) {
            console.error("Failed to save state to session storage", e);
        }
    }
  }, [enhancementType]);

  const handleImageUpload = useCallback((base64: string, mimeType: string, file: File) => {
    setImageData({ base64, mimeType, previewUrl: URL.createObjectURL(file) });
    setResultImage(null);
    setResultKind(null);
    setError(null);
  }, []);

  const handleRemoveImage = useCallback(() => {
    setImageData(null);
  }, []);

  const handleEnhance = useCallback(async () => {
    if (!imageData) {
      setError(
        enhancementType === 'removeBg'
          ? 'Please upload an image to remove its background.'
          : 'Please upload an image to enhance.'
      );
      return;
    }

    setIsLoading(true);
    setError(null);
    setResultImage(null);
    setResultKind(null);

    const isRemoveBg = enhancementType === 'removeBg';
    const prompt = isRemoveBg ? getBackgroundRemovalPrompt() : getImageEnhancementPrompt(enhancementType);
    const historyPrompt = isRemoveBg
      ? 'Background Removed'
      : enhancementType === 'upscale'
        ? 'Image Upscaled'
        : 'Image Colors Enhanced';
    const caption = isRemoveBg ? 'image for background removal' : 'image to enhance';

    try {
      const result = await editOrComposeWithNanoBanana({
        prompt,
        images: [{ ...imageData, category: 'MEDIA_CATEGORY_SUBJECT', caption }],
        config: { aspectRatio: '1:1' },
      });
      const imageBase64 = result.imagePanels[0]?.generatedImages[0]?.encodedImage;

      if (imageBase64) {
        setResultImage(imageBase64);
        setResultKind(isRemoveBg ? 'removeBg' : 'enhance');
        await addHistoryItem({
          type: 'Image',
          prompt: historyPrompt,
          result: imageBase64,
        });

        const updateResult = await incrementImageUsage(currentUser);
        if (updateResult.success && updateResult.user) {
          onUserUpdate(updateResult.user);
        }
      } else {
        setError(
          isRemoveBg
            ? 'The AI was unable to remove the background. Please try a different image.'
            : 'The AI was unable to enhance the image. Please try a different image.'
        );
      }
    } catch (e) {
      handleApiError(e);
      setError('Failed');
    } finally {
      setIsLoading(false);
    }
  }, [imageData, enhancementType, currentUser, onUserUpdate]);

  const handleReset = useCallback(() => {
    setImageData(null);
    setResultImage(null);
    setResultKind(null);
    setError(null);
    setEnhancementType('upscale');
    setImageUploadKey(Date.now());
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const leftPanel = (
    <>
      <div>
        <h1 className="text-xl font-bold sm:text-3xl">AI Image Enhancer</h1>
        <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mt-1">
          Upscale, enhance colors, or remove the background in one place.
        </p>
      </div>
      
      <div className="flex-1 flex flex-col justify-center">
          {/* FIX: Add missing 'language' prop to ImageUpload component. */}
          <ImageUpload key={imageUploadKey} id="enhancer-upload" onImageUpload={handleImageUpload} onRemove={handleRemoveImage} title="Upload Image to Enhance" language={language}/>
      </div>
      
      <div className="space-y-4 pt-4 mt-auto">
          <div className="flex flex-row gap-2 w-full" role="group" aria-label="Enhancement mode">
              <button type="button" onClick={() => setEnhancementType('upscale')} className={modeButtonClass(enhancementType === 'upscale')}>
                Upscale &amp; Sharpen
              </button>
              <button type="button" onClick={() => setEnhancementType('colors')} className={modeButtonClass(enhancementType === 'colors')}>
                Enhance Colors
              </button>
              <button type="button" onClick={() => setEnhancementType('removeBg')} className={modeButtonClass(enhancementType === 'removeBg')}>
                Remove Bg
              </button>
          </div>
          <div className="flex gap-4">
            <button
              onClick={handleEnhance}
              disabled={isLoading || !imageData}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Spinner />
              ) : enhancementType === 'removeBg' ? (
                'Remove Bg'
              ) : (
                'Enhance Image'
              )}
            </button>
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="flex-shrink-0 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-3 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50"
            >
              Reset
            </button>
          </div>
          {error && error !== 'Failed' && <p className="text-red-500 dark:text-red-400 mt-2 text-center">{error}</p>}
      </div>
    </>
  );

  const rightPanel = (
    <>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-full gap-4">
            <Spinner />
            <p className="text-neutral-500 dark:text-neutral-400">
              {enhancementType === 'removeBg' ? 'Removing background...' : 'Enhancing image...'}
            </p>
        </div>
      ) : resultImage && imageData && resultKind ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-2xl space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <div>
                        <h4 className="font-semibold text-center mb-2 text-gray-500 dark:text-gray-400">Original</h4>
                        <img src={imageData.previewUrl} alt="Original" className="rounded-lg w-full" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-center mb-2 text-gray-500 dark:text-gray-400">
                          {resultKind === 'removeBg' ? 'Result (Transparent)' : 'Enhanced'}
                        </h4>
                        <div
                          className={`relative group rounded-lg ${resultKind === 'removeBg' ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
                          style={
                            resultKind === 'removeBg'
                              ? {
                                  backgroundImage: 'repeating-conic-gradient(#e5e7eb 0 25%, transparent 0 50%)',
                                  backgroundSize: '16px 16px',
                                }
                              : undefined
                          }
                        >
                            <img
                              src={`data:image/png;base64,${resultImage}`}
                              alt={resultKind === 'removeBg' ? 'Background removed' : 'Enhanced'}
                              className="rounded-lg w-full"
                            />
                            <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                               <button onClick={() => onReEdit({ base64: resultImage, mimeType: 'image/png' })} title="Re-edit this image" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"><WandIcon className="w-4 h-4" /></button>
                               <button
                                 onClick={() =>
                                   onCreateVideo({
                                     prompt:
                                       resultKind === 'removeBg'
                                         ? 'Video of this subject with a transparent background'
                                         : 'Video of this enhanced image',
                                     image: { base64: resultImage, mimeType: 'image/png' },
                                   })
                                 }
                                 title="Create video from this image"
                                 className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
                               >
                                 <VideoIcon className="w-4 h-4" />
                               </button>
                               <button
                                 onClick={() =>
                                   triggerDownload(
                                     resultImage,
                                     resultKind === 'removeBg'
                                       ? `${BRAND_CONFIG.shortName.toLowerCase()}-bg-removed`
                                       : `${BRAND_CONFIG.shortName.toLowerCase()}-enhanced`
                                   )
                                 }
                                 title="Download Image"
                                 className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
                               >
                                 <DownloadIcon className="w-4 h-4" />
                               </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      ) : (
        <div className="text-center text-neutral-500 dark:text-neutral-600">
          {enhancementType === 'removeBg' ? (
            <ScissorsIcon className="w-16 h-16 mx-auto" />
          ) : (
            <WandIcon className="w-16 h-16 mx-auto" />
          )}
          <p className="mt-2">
            {enhancementType === 'removeBg'
              ? 'Your background-removed image will appear here.'
              : 'Your enhanced image will appear here.'}
          </p>
        </div>
      )}
    </>
  );
  
  // FIX: Pass the 'language' prop to TwoColumnLayout to fix type error.
  return <TwoColumnLayout leftPanel={leftPanel} rightPanel={rightPanel} language={language} />;
};

export default ImageEnhancerView;
