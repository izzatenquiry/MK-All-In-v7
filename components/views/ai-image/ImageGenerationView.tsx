
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { addHistoryItem } from '../../../services/historyService';
import Spinner from '../../common/Spinner';
import { UploadIcon, TrashIcon, DownloadIcon, VideoIcon, StarIcon, WandIcon, AlertTriangleIcon, RefreshCwIcon, UsersIcon, CheckCircleIcon } from '../../Icons';
import { type MultimodalContent } from '../../../services/geminiService';
import TwoColumnLayout from '../../common/TwoColumnLayout';
import { getImageEditingPrompt } from '../../../services/promptManager';
import { handleApiError } from '../../../services/errorHandler';
import { generateImageWithNanoBanana, editOrComposeWithNanoBanana } from '../../../services/imagenV3Service';
import { incrementImageUsage } from '../../../services/userService';
import { type User, type Language } from '../../../types';
import CreativeDirectionPanel from '../../common/CreativeDirectionPanel';
import { getInitialCreativeDirectionState, type CreativeDirectionState } from '../../../services/creativeDirectionService';
import { UI_SERVER_LIST } from '../../../services/serverConfig';
import { BRAND_CONFIG } from '../../../services/brandConfig';

// --- CONFIG FOR PARALLEL GENERATION ---
const SERVERS = UI_SERVER_LIST;

interface ImageData extends MultimodalContent {
  id: string;
  previewUrl: string;
}

type ImageSlot = string | { error: string } | null;

const downloadImage = (base64Image: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${base64Image}`;
  link.download = fileName;
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

interface ImageGenerationViewProps {
  onCreateVideo: (preset: VideoGenPreset) => void;
  onReEdit: (preset: ImageEditPreset) => void;
  imageToReEdit: ImageEditPreset | null;
  clearReEdit: () => void;
  presetPrompt: string | null;
  clearPresetPrompt: () => void;
  currentUser: User;
  onUserUpdate: (user: User) => void;
  language: Language;
}

const SESSION_KEY = 'imageGenerationState';

const ImageGenerationView: React.FC<ImageGenerationViewProps> = ({ onCreateVideo, onReEdit, imageToReEdit, clearReEdit, presetPrompt, clearPresetPrompt, currentUser, onUserUpdate, language }) => {
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<ImageSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<ImageData[]>([]);
  const [numberOfImages, setNumberOfImages] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);

  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9'>('9:16');
  const [creativeState, setCreativeState] = useState<CreativeDirectionState>(getInitialCreativeDirectionState());
  const [promptMode, setPromptMode] = useState<'template' | 'raw'>('template');
  const [imageGenerationStartedAt, setImageGenerationStartedAt] = useState<(number | null)[]>([]);
  const [imageGenerationElapsedSec, setImageGenerationElapsedSec] = useState<number[]>([]);
  const [imageGenerationDurationSec, setImageGenerationDurationSec] = useState<(number | null)[]>([]);

  const isEditing = referenceImages.length > 0;

  const formatDuration = (totalSec: number) => {
    const s = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  // Tick elapsed timer while generating any slot.
  useEffect(() => {
    if (!isLoading) return;
    if (!imageGenerationStartedAt.some(Boolean)) return;
    const id = window.setInterval(() => {
      setImageGenerationElapsedSec((prev) => {
        const now = Date.now();
        return prev.map((_, i) => {
          const startedAt = imageGenerationStartedAt[i];
          return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
        });
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isLoading, imageGenerationStartedAt]);

  const markSlotStart = useCallback((index: number) => {
    const startedAt = Date.now();
    setImageGenerationStartedAt((prev) => {
      const next = prev.length ? [...prev] : Array(Math.max(numberOfImages, index + 1)).fill(null);
      next[index] = startedAt;
      return next;
    });
    setImageGenerationElapsedSec((prev) => {
      const next = prev.length ? [...prev] : Array(Math.max(numberOfImages, index + 1)).fill(0);
      next[index] = 0;
      return next;
    });
    setImageGenerationDurationSec((prev) => {
      const next = prev.length ? [...prev] : Array(Math.max(numberOfImages, index + 1)).fill(null);
      next[index] = null;
      return next;
    });
    return startedAt;
  }, [numberOfImages]);

  const markSlotEnd = useCallback((index: number, startedAt: number) => {
    const end = Date.now();
    setImageGenerationDurationSec((prev) => {
      const next = prev.length ? [...prev] : Array(Math.max(numberOfImages, index + 1)).fill(null);
      next[index] = Math.max(0, Math.floor((end - startedAt) / 1000));
      return next;
    });
  }, [numberOfImages]);

  useEffect(() => {
    try {
      const savedState = sessionStorage.getItem(SESSION_KEY);
      if (savedState) {
        const state = JSON.parse(savedState);
        if (state.prompt) setPrompt(state.prompt);
        if (state.numberOfImages) setNumberOfImages(state.numberOfImages);
        if (state.selectedImageIndex) setSelectedImageIndex(state.selectedImageIndex);
        if (state.negativePrompt) setNegativePrompt(state.negativePrompt);
        if (state.aspectRatio) setAspectRatio(state.aspectRatio);
        if (state.creativeState) setCreativeState(state.creativeState);
        if (state.promptMode === 'template' || state.promptMode === 'raw') setPromptMode(state.promptMode);
      }
    } catch (e) { console.error("Failed to load state from session storage", e); }
  }, []);

  useEffect(() => {
    try {
      const stateToSave = { prompt, numberOfImages, selectedImageIndex, negativePrompt, aspectRatio, creativeState, promptMode };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateToSave));
    } catch (e: any) {
        if (e.name !== 'QuotaExceededError' && e.code !== 22) {
            console.error("Failed to save state to session storage", e);
        }
    }
  }, [prompt, numberOfImages, selectedImageIndex, negativePrompt, aspectRatio, creativeState, promptMode]);

  useEffect(() => {
    if (imageToReEdit) {
      const newImage: ImageData = {
        id: `re-edit-${Date.now()}`,
        previewUrl: `data:${imageToReEdit.mimeType};base64,${imageToReEdit.base64}`,
        base64: imageToReEdit.base64,
        mimeType: imageToReEdit.mimeType,
      };
      setReferenceImages([newImage]);
      setImages([]);
      setPrompt('');
      clearReEdit();
    }
  }, [imageToReEdit, clearReEdit]);

  useEffect(() => {
    if (presetPrompt) {
      setPrompt(presetPrompt);
      window.scrollTo(0, 0);
      clearPresetPrompt();
    }
  }, [presetPrompt, clearPresetPrompt]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    // Limit to 4 images max
    const filesToProcess = Array.from(files).slice(0, 4 - referenceImages.length);
    
    const validFiles = filesToProcess.filter((file: File) => {
      if (!acceptedTypes.includes(file.type)) {
        alert(`Unsupported file type: ${file.name}. Please upload a PNG or JPG file.`);
        return false;
      }
      return true;
    });

    validFiles.forEach((file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                const base64String = reader.result.split(',')[1];
                const newImage: ImageData = {
                    id: `${file.name}-${Date.now()}`,
                    previewUrl: reader.result as string,
                    base64: base64String,
                    mimeType: file.type,
                };
                setReferenceImages(prevImages => [...prevImages, newImage]);
                setImages([]);
            }
        };
        reader.readAsDataURL(file);
    });

    if(event.target) {
        event.target.value = '';
    }
  };

  const removeImage = (id: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== id));
  };
  
  const performGeneration = useCallback(async (serverUrl?: string) => {
      let resultImage: string | undefined;
      
      if (isEditing) {
          const creativeDetails = Object.entries(creativeState)
            .filter(([key, value]) => key !== 'creativityLevel' && value !== 'Random' && value !== 'None')
            .map(([, value]) => value)
            .join(', ');
          
          const promptWithCreativity = [prompt, creativeDetails].filter(Boolean).join(', ');
          const fullPrompt = negativePrompt ? `${promptWithCreativity}, negative prompt: ${negativePrompt}` : promptWithCreativity;
          const finalPrompt = promptMode === 'raw' ? fullPrompt : getImageEditingPrompt(fullPrompt);

          const result = await editOrComposeWithNanoBanana({
              prompt: finalPrompt,
              images: referenceImages.map((img, i) => ({ ...img, category: 'MEDIA_CATEGORY_SUBJECT', caption: `Image ${i + 1}` })),
              config: { aspectRatio, serverUrl }
          });
          resultImage = result.imagePanels[0]?.generatedImages[0]?.encodedImage;
      } else {
          const creativeDetails = Object.entries(creativeState)
            .filter(([key, value]) => key !== 'creativityLevel' && value !== 'Random' && value !== 'None')
            .map(([, value]) => value)
            .join(', ');
          
          const fullPrompt = [prompt, creativeDetails].filter(Boolean).join(', ');

          const result = await generateImageWithNanoBanana({
              prompt: fullPrompt,
              config: {
                  sampleCount: 1,
                  aspectRatio,
                  negativePrompt,
                  serverUrl
              }
          });
          resultImage = result.imagePanels[0]?.generatedImages[0]?.encodedImage;
      }

      if (!resultImage) {
          throw new Error("The AI did not return an image.");
      }
      
      return resultImage;
  }, [isEditing, prompt, referenceImages, negativePrompt, aspectRatio, creativeState, promptMode]);

  // Optimized function that uses pre-uploaded media IDs
  const generateOneImageWithMediaIds = useCallback(async (
      index: number,
      serverUrl: string | undefined,
      mediaIds: string[],
      authToken: string | undefined,
      mediaServerUrl: string | undefined
  ) => {
      const startedAt = markSlotStart(index);
      try {
          const creativeDetails = Object.entries(creativeState)
            .filter(([key, value]) => key !== 'creativityLevel' && value !== 'Random' && value !== 'None')
            .map(([, value]) => value)
            .join(', ');
          
          const promptWithCreativity = [prompt, creativeDetails].filter(Boolean).join(', ');
          const fullPrompt = negativePrompt ? `${promptWithCreativity}, negative prompt: ${negativePrompt}` : promptWithCreativity;
          const finalPrompt = promptMode === 'raw' ? fullPrompt : getImageEditingPrompt(fullPrompt);

          // Build recipe media inputs using pre-uploaded media IDs
          const recipeMediaInputs = mediaIds.map((mediaId, i) => ({
              caption: `Image ${i + 1}`,
              mediaInput: {
                  mediaCategory: 'MEDIA_CATEGORY_SUBJECT',
                  mediaGenerationId: mediaId
              }
          }));

          // Use runImageRecipe directly with pre-uploaded media IDs
          const { runImageRecipe } = await import('../../../services/imagenV3Service');
          const result = await runImageRecipe({
              userInstruction: finalPrompt,
              recipeMediaInputs,
              config: {
                  aspectRatio,
                  authToken: authToken, // Use the token that owns the media IDs
                  serverUrl: serverUrl || mediaServerUrl // Use recipe server or fallback to media server
              }
          });
          
          const resultImage = result.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;

          if (!resultImage) {
              throw new Error("The AI did not return an image.");
          }
          
          await addHistoryItem({
              type: 'Image',
              prompt: isEditing ? `Image Edit: ${prompt}` : `Image Generation: ${prompt}`,
              result: resultImage
          });

          const updateResult = await incrementImageUsage(currentUser);
          if (updateResult.success && updateResult.user) {
              onUserUpdate(updateResult.user);
          }

          setImages(prev => {
              const newImages = [...prev];
              newImages[index] = resultImage;
              return newImages;
          });
          setProgress(prev => prev + 1);

      } catch (e) {
          const userFriendlyMessage = handleApiError(e);
          setImages(prev => {
              const newImages = [...prev];
              newImages[index] = { error: userFriendlyMessage };
              return newImages;
          });
          setProgress(prev => prev + 1);
      }
      finally {
          markSlotEnd(index, startedAt);
      }
  }, [isEditing, prompt, negativePrompt, aspectRatio, creativeState, promptMode, currentUser, onUserUpdate, markSlotStart, markSlotEnd]);

  const generateOneImage = useCallback(async (index: number, serverUrl?: string) => {
      const startedAt = markSlotStart(index);
      try {
          const resultImage = await performGeneration(serverUrl);
          
          await addHistoryItem({
              type: 'Image',
              prompt: isEditing ? `Image Edit: ${prompt}` : `Image Generation: ${prompt}`,
              result: resultImage
          });

          const updateResult = await incrementImageUsage(currentUser);
          if (updateResult.success && updateResult.user) {
              onUserUpdate(updateResult.user);
          }

          setImages(prev => {
              const newImages = [...prev];
              newImages[index] = resultImage!;
              return newImages;
          });
          setProgress(prev => prev + 1);

      } catch (e) {
          const userFriendlyMessage = handleApiError(e);
          setImages(prev => {
              const newImages = [...prev];
              newImages[index] = { error: userFriendlyMessage };
              return newImages;
          });
          setProgress(prev => prev + 1);
      }
      finally {
          markSlotEnd(index, startedAt);
      }
  }, [performGeneration, isEditing, prompt, currentUser, onUserUpdate, markSlotStart, markSlotEnd]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && !isEditing) {
      setError("Please enter a prompt to describe the image you want to create.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStatusMessage(numberOfImages > 1 ? 'Initializing parallel generation...' : 'Preparing request...');
    setImages(Array(numberOfImages).fill(null));
    setImageGenerationStartedAt(Array(numberOfImages).fill(null));
    setImageGenerationElapsedSec(Array(numberOfImages).fill(0));
    setImageGenerationDurationSec(Array(numberOfImages).fill(null));
    setSelectedImageIndex(0);
    setProgress(0);

    // OPTIMIZATION: Upload reference images ONCE and reuse media IDs for all output images
    // This reduces uploads from (referenceImages.length × numberOfImages) to just referenceImages.length
    let sharedMediaIds: string[] = [];
    let sharedToken: string | undefined;
    let sharedServerUrl: string | undefined;
    
    if (isEditing && referenceImages.length > 0 && (numberOfImages > 1 || referenceImages.length > 1)) {
        try {
            const { uploadImageForNanoBanana } = await import('../../../services/imagenV3Service');
            const { cropImageToAspectRatio } = await import('../../../services/imageService');
            
            // Upload all reference images once
            for (let i = 0; i < referenceImages.length; i++) {
                const img = referenceImages[i];
                let processedBase64 = img.base64;
                try {
                    processedBase64 = await cropImageToAspectRatio(img.base64, aspectRatio || '1:1');
                } catch (cropError) {
                    console.warn(`Failed to process reference image ${i + 1}, using original`, cropError);
                }
                
                const uploadResult = await uploadImageForNanoBanana(
                    processedBase64,
                    img.mimeType,
                    sharedToken, // Use same token for all uploads
                    undefined,
                    sharedServerUrl // Use same server for all uploads
                );
                
                sharedMediaIds.push(uploadResult.mediaId);
                if (!sharedToken) {
                    sharedToken = uploadResult.successfulToken;
                    sharedServerUrl = uploadResult.successfulServerUrl;
                }
            }
            console.log(`📤 [Optimization] Uploaded ${referenceImages.length} reference images once. Will reuse for ${numberOfImages} output images.`);
        } catch (uploadError) {
            console.error('Failed to upload shared reference images:', uploadError);
            // Fallback to original method
            sharedMediaIds = [];
        }
    }

    // Check if user selected localhost server
    const selectedServer = sessionStorage.getItem('selectedProxyServer');
    const isLocalhost = selectedServer?.includes('localhost');
    
    // Multi-Server Distribution: 
    // - If 1 image: Use user's selected server
    // - If multiple images: Randomly distribute for load balancing
    // - If localhost: Always use localhost for all requests
    const serverUrls: (string | undefined)[] = [];
    
    if (isLocalhost) {
        // User selected localhost - use localhost for all requests
        for (let i = 0; i < numberOfImages; i++) {
            serverUrls.push(selectedServer);
        }
        console.log(`🚀 [Localhost] Using localhost server for all ${numberOfImages} image generation requests`);
    } else if (numberOfImages === 1) {
        // Single image: Use user's selected server
        serverUrls.push(selectedServer || undefined);
        console.log(`🚀 [Single Image] Using user-selected server: ${selectedServer}`);
    } else {
        // Multiple images: Randomly distribute for load balancing
        const availableServers = UI_SERVER_LIST
            .map(s => s.url)
            .filter(url => !url.includes('localhost'));
        
        if (availableServers.length > 0) {
            for (let i = 0; i < numberOfImages; i++) {
                // Randomly select a server for each image
                const randomIndex = Math.floor(Math.random() * availableServers.length);
                serverUrls.push(availableServers[randomIndex]);
            }
        } else {
            for (let i = 0; i < numberOfImages; i++) {
                serverUrls.push(undefined);
            }
        }
        console.log(`🚀 [Multi-Server] Randomly distributing ${numberOfImages} image generation requests across ${availableServers.length} servers:`, serverUrls);
    }
    
    const promises = [];
    for (let i = 0; i < numberOfImages; i++) {
        promises.push(new Promise<void>(resolve => {
            // Keep a small stagger to avoid flooding the client's network
            setTimeout(async () => {
                // Use optimized method if media IDs are available, otherwise use original
                if (sharedMediaIds.length > 0 && (numberOfImages > 1 || referenceImages.length > 1)) {
                    await generateOneImageWithMediaIds(i, serverUrls[i], sharedMediaIds, sharedToken, sharedServerUrl);
                } else {
                    await generateOneImage(i, serverUrls[i]);
                }
                resolve();
            }, i * 500);
        }));
    }

    await Promise.all(promises);

    setIsLoading(false);
    setStatusMessage('');
  }, [numberOfImages, isEditing, prompt, generateOneImage, referenceImages, aspectRatio]);
  
  const handleRetry = useCallback(async (index: number) => {
    setImages(prev => {
        const newImages = [...prev];
        newImages[index] = null;
        return newImages;
    });
    await generateOneImage(index);
  }, [generateOneImage]);

  const handleLocalReEdit = (base64: string, mimeType: string) => {
      const newImage: ImageData = { id: `re-edit-${Date.now()}`, previewUrl: `data:${mimeType};base64,${base64}`, base64, mimeType };
      setReferenceImages([newImage]);
      setImages([]);
      setPrompt('');
  };

  const handleReset = useCallback(() => {
    setPrompt('');
    setImages([]);
    setError(null);
    setReferenceImages([]);
    setNumberOfImages(1);
    setSelectedImageIndex(0);
    if(fileInputRef.current) fileInputRef.current.value = '';
    setNegativePrompt('');
    setProgress(0);
    setStatusMessage('');
    setAspectRatio('9:16');
    setCreativeState(getInitialCreativeDirectionState());
    setPromptMode('template');
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const leftPanel = (
    <>
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">{isEditing ? 'AI Image Editor' : 'AI Image Generation'}</h1>
        <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mt-1">{isEditing ? <>Edit your images with simple text commands. <span className="font-bold text-neutral-800 dark:text-neutral-200">Not recommended for fashion and clothing.</span></> : 'Create stunning images using Google\'s NanoBanana model.'}</p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Reference Images (up to 4)</label>
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 min-h-[116px]">
              <div className="flex items-center gap-3 flex-wrap">
                  {referenceImages.map((img, i) => (
                      <div key={img.id} className="relative flex flex-col items-center">
                          <div className="relative w-20 h-20">
                              <img src={img.previewUrl} alt={`Image ${i + 1}`} className="w-full h-full object-cover rounded-md"/>
                              <button onClick={() => removeImage(img.id)} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 text-white hover:bg-red-600 transition-colors">
                                  <TrashIcon className="w-3 h-3"/>
                              </button>
                          </div>
                          <span className="text-[10px] font-medium text-primary-600 dark:text-primary-400 mt-1">Image {i + 1}</span>
                      </div>
                  ))}
                  {referenceImages.length < 4 && (
                      <button onClick={() => fileInputRef.current?.click()} className="w-20 h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md flex flex-col items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                          <UploadIcon className="w-6 h-6"/>
                          <span className="text-xs mt-1">Upload</span>
                      </button>
                  )}
                  <input type="file" accept="image/png, image/jpeg, image/jpg" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              </div>
               {isEditing ? (
                  <div className="text-xs text-primary-600 dark:text-primary-400 mt-2 p-2 bg-primary-500/10 rounded-md space-y-1">
                    <p dangerouslySetInnerHTML={{ __html: 'You are in <strong>Image Editing Mode</strong>. The prompt will be used as instructions to edit the source image.' }} />
                    {referenceImages.length > 1 && (
                      <p className="mt-1">Upload order = Image 1, 2, 3... Ensure your prompt references match this order.</p>
                    )}
                  </div>
              ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Upload an image to edit it or combine it with your prompt.</p>
              )}
          </div>
      </div>

      <div>
        <label htmlFor="prompt" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Prompt</label>
        <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={isEditing ? 'e.g., Change the background to a beach...' : 'e.g., A cute cat wearing sunglasses...'} rows={4} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none transition" />
        {isEditing && (
          <div className="mt-2 flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setPromptMode('template')}
              className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
                promptMode === 'template'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Template
            </button>
            <button
              type="button"
              onClick={() => setPromptMode('raw')}
              className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
                promptMode === 'raw'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Raw
            </button>
          </div>
        )}
      </div>

      <CreativeDirectionPanel
        state={creativeState}
        setState={setCreativeState}
        language={language}
        showPose={false}
        numberOfImages={numberOfImages}
        setNumberOfImages={setNumberOfImages}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
      />
      
      <div className="space-y-4 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-2">Advanced Settings</h2>
          <div>
            <label htmlFor="negative-prompt" className={`block text-sm font-medium mb-2 transition-colors text-gray-600 dark:text-gray-400`}>Negative Prompt (What to avoid)</label>
            <textarea id="negative-prompt" value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="e.g., text, watermarks, blurry, ugly" rows={2} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none transition" />
          </div>
      </div>

      <div className="pt-4 mt-auto">
        <div className="flex gap-4">
          <button onClick={handleGenerate} disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isLoading ? <Spinner /> : isEditing ? 'Apply Edit' : 'Generate Image'}
          </button>
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="flex-shrink-0 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-3 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50"
          >
            Reset
          </button>
        </div>
        {error && !isLoading && <p className="text-red-500 dark:text-red-400 mt-2 text-center">{error}</p>}
      </div>
    </>
  );

  const ActionButtons: React.FC<{ imageBase64: string; mimeType: string }> = ({ imageBase64, mimeType }) => (
    <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
      <button onClick={() => handleLocalReEdit(imageBase64, mimeType)} title="Re-edit" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"><WandIcon className="w-4 h-4" /></button>
      <button onClick={() => onCreateVideo({ prompt, image: { base64: imageBase64, mimeType } })} title="Create Video" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"><VideoIcon className="w-4 h-4" /></button>
      <button onClick={() => downloadImage(imageBase64, `${BRAND_CONFIG.shortName.toLowerCase()}-image-${Date.now()}.png`)} title="Download" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"><DownloadIcon className="w-4 h-4" /></button>
    </div>
  );

  const rightPanel = (
    <>
      {images.length > 0 ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
            <div className="flex-1 flex items-center justify-center min-h-0 w-full relative group overflow-hidden rounded-xl bg-neutral-200/60 dark:bg-neutral-800/40">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(74,108,247,0.22),transparent_60%),radial-gradient(circle_at_82%_26%,rgba(160,91,255,0.18),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.0))] dark:bg-[radial-gradient(circle_at_22%_18%,rgba(74,108,247,0.14),transparent_60%),radial-gradient(circle_at_82%_26%,rgba(160,91,255,0.12),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.0))]" />
                {(() => {
                    const elapsed = imageGenerationElapsedSec[selectedImageIndex] ?? 0;
                    const dur = imageGenerationDurationSec[selectedImageIndex];
                    const isSlotLoading = images[selectedImageIndex] == null && isLoading;
                    if (isSlotLoading) {
                        return (
                            <div className="absolute bottom-2 right-2 z-10 rounded-lg bg-red-600/80 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
                                Time: <span className="font-mono">{formatDuration(elapsed)}</span>
                            </div>
                        );
                    }
                    if (dur != null) {
                        return (
                            <div className="absolute bottom-2 right-2 z-10 rounded-lg bg-red-600/70 px-2.5 py-1 text-[11px] font-bold text-white/95 backdrop-blur">
                                Time: <span className="font-mono">{formatDuration(dur)}</span>
                            </div>
                        );
                    }
                    return null;
                })()}
                {(() => {
                    const selectedImage = images[selectedImageIndex];
                    if (typeof selectedImage === 'string') {
                        return (
                            <>
                                <img src={`data:image/png;base64,${selectedImage}`} alt={`Generated image ${selectedImageIndex + 1}`} className="rounded-md max-h-full max-w-full object-contain" />
                                <ActionButtons imageBase64={selectedImage} mimeType="image/png" />
                            </>
                        );
                    } else if (selectedImage && typeof selectedImage === 'object') {
                        // Check if it's a token authentication error
                        const errorObj = selectedImage as { error?: string };
                        const errorMessage = errorObj.error || '';
                        const isTokenError = errorMessage.includes('ERROR 401') || 
                                           errorMessage.includes('token is invalid') ||
                                           errorMessage.includes('has expired') ||
                                           errorMessage.includes('401') ||
                                           errorMessage.includes('UNAUTHENTICATED') ||
                                           errorMessage.toLowerCase().includes('unauthorized');
                        
                        return (
                            <div className="text-center text-red-500 dark:text-red-400 p-4">
                                <AlertTriangleIcon className="w-12 h-12 mx-auto mb-4" />
                                {isTokenError ? (
                                    <>
                                        <p className="font-semibold">ERROR 401 - Your token is invalid or has expired.</p>
                                        <p className="text-sm mt-2 max-w-md mx-auto text-neutral-500 dark:text-neutral-400">
                                            Please go to Settings &gt; Token Setting to generate a new token.
                                        </p>
                                        <button
                                            onClick={() => {
                                                // Navigate to settings
                                                window.location.hash = '#/settings';
                                            }}
                                            className="mt-6 flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 transition-colors mx-auto"
                                        >
                                            Go to Settings
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <p className="font-semibold">Generation Failed - Try Again @ Check Console Log.</p>
                                        <p className="text-sm mt-2 max-w-md mx-auto text-neutral-500 dark:text-neutral-400">All attempts failed. Please try again.</p>
                                        <button
                                            onClick={() => handleRetry(selectedImageIndex)}
                                            className="mt-6 flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 transition-colors mx-auto"
                                        >
                                            <RefreshCwIcon className="w-4 h-4" />
                                            Try Again
                                        </button>
                                    </>
                                )}
                            </div>
                        );
                    }
                    return (
                        <div className="flex flex-col items-center justify-center h-full gap-2">
                            <Spinner />
                            <p className="text-sm text-neutral-500">{statusMessage}</p>
                            {isLoading && numberOfImages > 1 && (
                                <p className="text-sm text-neutral-500">
                                    {`Completed: ${progress} / ${numberOfImages}`}
                                </p>
                            )}
                        </div>
                    );
                })()}
            </div>
             {images.length > 1 && (
                <div className="flex-shrink-0 w-full flex justify-center">
                <div className="flex gap-2 overflow-x-auto p-2">
                    {images.map((img, index) => (
                    <button key={index} onClick={() => setSelectedImageIndex(index)} className={`w-16 h-16 md:w-20 md:h-20 rounded-md overflow-hidden flex-shrink-0 transition-all duration-200 flex items-center justify-center bg-neutral-200 dark:bg-neutral-800 ${selectedImageIndex === index ? 'ring-4 ring-primary-500' : 'ring-2 ring-transparent hover:ring-primary-300'}`}>
                        {typeof img === 'string' ? (
                            <img src={`data:image/png;base64,${img}`} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                        ) : img && typeof img === 'object' ? (
                            <AlertTriangleIcon className="w-6 h-6 text-red-500" />
                        ) : (
                            <div className="flex flex-col items-center justify-center">
                                <Spinner />
                                <span className="text-[10px] mt-1 text-neutral-500">Slot {index + 1}</span>
                            </div>
                        )}
                    </button>
                    ))}
                </div>
                </div>
            )}
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center h-full gap-2">
            <Spinner />
            <p className="text-sm text-neutral-500">{statusMessage}</p>
            <p className="text-sm text-neutral-500">
                {`Completed: ${progress} / ${numberOfImages}`}
            </p>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-center text-neutral-500 dark:text-neutral-600">
            <div><StarIcon className="w-16 h-16 mx-auto" /><p>Your generated images will appear here.</p></div>
        </div>
      )}
    </>
  );

  return <TwoColumnLayout leftPanel={leftPanel} rightPanel={rightPanel} language={language} />;
};

export default ImageGenerationView;
