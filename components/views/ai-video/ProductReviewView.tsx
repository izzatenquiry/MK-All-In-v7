
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ImageUpload from '../../common/ImageUpload';
// FIX: Removed invalid import for 'composeImage'.
import { type MultimodalContent, generateMultimodalContent, generateVideo } from '../../../services/geminiService';
import { addHistoryItem } from '../../../services/historyService';
import Spinner from '../../common/Spinner';
// FIX: Added missing UserIcon and TikTokIcon to fix 'Cannot find name' errors.
import { StarIcon, DownloadIcon, ImageIcon, VideoIcon, WandIcon, AlertTriangleIcon, RefreshCwIcon, XIcon, UserIcon, TikTokIcon, UsersIcon, InformationCircleIcon } from '../../Icons';
import { getProductReviewImagePrompt, getProductReviewStoryboardPrompt, getImageEditingPrompt } from '../../../services/promptManager';
import { type User, type Language } from '../../../types';
import { MODELS } from '../../../services/aiConfig';
import {
  incrementVideoUsage,
  incrementImageUsage,
  consumePackageCredits,
  getUserProfile,
} from '../../../services/userService';
import eventBus from '../../../services/eventBus';
import { v4 as uuidv4 } from 'uuid';
import { prepareVeolyNanobanana2UnifiedSession } from '../../../services/apiClient';
import { generateImageWithNanobanana2, mapAspectRatio } from '../../../services/nanobanana2Service';
import { addLogEntry } from '../../../services/aiLogService';
import PreviewModal from '../../common/PreviewModal';
import { handleApiError } from '../../../services/errorHandler';
import { editOrComposeWithNanoBanana } from '../../../services/imagenV3Service';
import CreativeDirectionPanel from '../../common/CreativeDirectionPanel';
import { getInitialCreativeDirectionState, type CreativeDirectionState } from '../../../services/creativeDirectionService';
import { UI_SERVER_LIST } from '../../../services/serverConfig';
import { BRAND_CONFIG } from '../../../services/brandConfig';
import Tabs, { type Tab } from '../../common/Tabs';

// --- CONFIG FOR PARALLEL GENERATION ---
const SERVERS = UI_SERVER_LIST;

/** Package credits per NanoBanana PRO scene image (same RPC as AI Image suite). */
const NANO2_SCENE_CREDIT_COST = 5;

async function convertNanobanana2UrlToBase64(imageUrl: string): Promise<string> {
  const serverUrl = sessionStorage.getItem('selectedProxyServer') || 'http://localhost:3001';
  const proxyUrl = `${serverUrl}/api/nanobanana/download-image?url=${encodeURIComponent(imageUrl)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function deductNanobananaProSceneCredits(userId: string | undefined): Promise<void> {
  if (!userId) return;
  const ok = await consumePackageCredits(userId, NANO2_SCENE_CREDIT_COST);
  if (!ok) {
    throw new Error(
      'Your package credit balance is insufficient. Please purchase a new Token Ultra Credit package.'
    );
  }
  try {
    const refreshed = await getUserProfile(userId);
    if (refreshed) {
      eventBus.dispatch('userProfileUpdated', refreshed);
    }
  } catch (e) {
    console.warn('[Product Review] Could not refresh profile after Pro credit deduction:', e);
  }
}

const contentTypeOptions = ["None", "Random", "Hard Selling", "Soft Selling", "Storytelling", "Problem/Solution", "ASMR / Sensory", "Unboxing", "Educational", "Testimonial"];
const languages = ["English", "Malay", "Chinese"];

const moodOptions = [
    'Normal', 'Cheerful', 'Energetic', 'Sales', 'Sad', 'Whispering',
    'Angry', 'Calm', 'Formal', 'Excited', 'Storytelling',
    'Authoritative', 'Friendly'
];

const musicStyleOptions = [
    'Pop', 'Ballad', 'Rock', 'Jazz', 'Folk', 'Kids Song',
    'Rap', 'Traditional Malay'
];

const PRODUCT_REVIEW_SCENE_IMAGE_TABS: Tab<'standard' | 'pro'>[] = [
    { id: 'standard', label: 'NanoBanana 2' },
    { id: 'pro', label: 'NanoBanana PRO' },
];

interface VideoGenPreset {
  prompt: string;
  image: { base64: string; mimeType: string; };
}

interface ImageEditPreset {
  base64: string;
  mimeType: string;
}

interface ProductReviewViewProps {
  onReEdit: (preset: ImageEditPreset) => void;
  onCreateVideo: (preset: VideoGenPreset) => void;
  currentUser: User;
  onUserUpdate: (user: User) => void;
  language: Language;
}

const downloadText = (text: string, fileName: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const SESSION_KEY = 'productReviewState';

const ProductReviewView: React.FC<ProductReviewViewProps> = ({ onReEdit, onCreateVideo, currentUser, onUserUpdate, language }) => {
  const isAdmin = currentUser?.role === 'admin';
  const sceneImageModelTabs = useMemo(
    () => (isAdmin ? PRODUCT_REVIEW_SCENE_IMAGE_TABS : PRODUCT_REVIEW_SCENE_IMAGE_TABS.filter(t => t.id !== 'pro')),
    [isAdmin]
  );
  const [productImage, setProductImage] = useState<MultimodalContent | null>(null);
  const [faceImage, setFaceImage] = useState<MultimodalContent | null>(null);
  const [productDesc, setProductDesc] = useState('');
  const [selectedContentType, setSelectedContentType] = useState<string>(contentTypeOptions[0]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("Malay");
  const [storyboard, setStoryboard] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const [includeCaptions, setIncludeCaptions] = useState<'Yes' | 'No'>('No');
  const [includeVoiceover, setIncludeVoiceover] = useState<'Yes' | 'No'>('Yes');
  const [includeModel, setIncludeModel] = useState<'No' | 'Yes'>('No');

  // State for multi-image generation
  const [parsedScenes, setParsedScenes] = useState<string[]>([]);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageLoadingStatus, setImageLoadingStatus] = useState<boolean[]>(Array(4).fill(false));
  const [generatedImages, setGeneratedImages] = useState<(string | null)[]>(Array(4).fill(null));
  const [imageGenerationErrors, setImageGenerationErrors] = useState<(string | null)[]>(Array(4).fill(null));
  const [previewingSceneIndex, setPreviewingSceneIndex] = useState<number | null>(null);
  const [imageGenerationStartedAt, setImageGenerationStartedAt] = useState<(number | null)[]>(Array(4).fill(null));
  const [imageGenerationElapsedSec, setImageGenerationElapsedSec] = useState<number[]>(Array(4).fill(0));
  const [imageGenerationDurationSec, setImageGenerationDurationSec] = useState<(number | null)[]>(Array(4).fill(null));

  // New state for inline editing
  const [editingSceneIndex, setEditingSceneIndex] = useState<number | null>(null);
  const [editPrompt, setEditPrompt] = useState('');

  // State for integrated video generation
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [videoGenerationStatus, setVideoGenerationStatus] = useState<('idle' | 'loading' | 'success' | 'error')[]>(Array(4).fill('idle'));
  const [generatedVideos, setGeneratedVideos] = useState<(string | null)[]>(Array(4).fill(null));
  const [generatedThumbnails, setGeneratedThumbnails] = useState<(string | null)[]>(Array(4).fill(null));
  const [videoFilenames, setVideoFilenames] = useState<(string | null)[]>(Array(4).fill(null));
  // FIX: Add missing videoGenerationErrors state to resolve 'Cannot find name' errors.
  const [videoGenerationErrors, setVideoGenerationErrors] = useState<(string | null)[]>(Array(4).fill(null));
  const [videoGenerationStartedAt, setVideoGenerationStartedAt] = useState<(number | null)[]>(Array(4).fill(null));
  const [videoGenerationElapsedSec, setVideoGenerationElapsedSec] = useState<number[]>(Array(4).fill(0));
  const [videoGenerationDurationSec, setVideoGenerationDurationSec] = useState<(number | null)[]>(Array(4).fill(null));
  const [downloadingVideoIndex, setDownloadingVideoIndex] = useState<number | null>(null);
  const isVideoCancelledRef = useRef(false);
  
  const [productImageUploadKey, setProductImageUploadKey] = useState(Date.now());
  const [faceImageUploadKey, setFaceImageUploadKey] = useState(Date.now() + 1);

  // New creative direction states
  const [creativeState, setCreativeState] = useState<CreativeDirectionState>(getInitialCreativeDirectionState());

  /** Step 2: NanoBanana (whisk recipe) vs NanoBanana PRO (GEM_PIX_2 / nanobanana2). */
  const [sceneImageModel, setSceneImageModel] = useState<'standard' | 'pro'>('standard');

  // New video generation settings state
  const videoModel = MODELS.videoGenerationDefault;
  const [videoAspectRatio, setVideoAspectRatio] = useState('9:16');
  const [videoResolution, setVideoResolution] = useState('720p');
  const [videoLanguage, setVideoLanguage] = useState<string>("Malay");
  
  // New audio settings state
  const [voiceoverMode, setVoiceoverMode] = useState<'speak' | 'sing'>('speak');
  const [voiceoverMood, setVoiceoverMood] = useState('Normal');
  const [musicStyle, setMusicStyle] = useState('Pop');

  const formatDuration = (totalSec: number) => {
    const s = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  // Tick elapsed timer while any image is generating.
  useEffect(() => {
    if (!imageLoadingStatus.some(Boolean)) return;
    const id = window.setInterval(() => {
      setImageGenerationElapsedSec((prev) =>
        prev.map((_, i) => {
          const startedAt = imageGenerationStartedAt[i];
          return startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
        })
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [imageLoadingStatus, imageGenerationStartedAt]);

  // Tick elapsed timer while any video is generating.
  useEffect(() => {
    if (!videoGenerationStatus.some((s) => s === 'loading')) return;
    const id = window.setInterval(() => {
      setVideoGenerationElapsedSec((prev) =>
        prev.map((_, i) => {
          const startedAt = videoGenerationStartedAt[i];
          return startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
        })
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [videoGenerationStatus, videoGenerationStartedAt]);

  useEffect(() => {
    try {
        const savedState = sessionStorage.getItem(SESSION_KEY);
        if (savedState) {
            const state = JSON.parse(savedState);
            if (state.productDesc) setProductDesc(state.productDesc);
            if (state.selectedContentType) setSelectedContentType(state.selectedContentType);
            if (state.selectedLanguage) {
                setSelectedLanguage(state.selectedLanguage === 'Bahasa Malaysia' ? 'Malay' : state.selectedLanguage);
            }
            if (state.storyboard) setStoryboard(state.storyboard);
            if (state.includeCaptions) setIncludeCaptions(state.includeCaptions);
            if (state.includeVoiceover) setIncludeVoiceover(state.includeVoiceover);
            if (state.includeModel) setIncludeModel(state.includeModel);
            if (state.parsedScenes) setParsedScenes(state.parsedScenes);
            if (state.creativeState) setCreativeState(state.creativeState);
            if (state.videoAspectRatio) setVideoAspectRatio(state.videoAspectRatio);
            if (state.videoResolution) setVideoResolution(state.videoResolution);
            if (state.videoLanguage) {
                setVideoLanguage(state.videoLanguage === 'Bahasa Malaysia' ? 'Malay' : state.videoLanguage);
            } else if (state.selectedLanguage) {
                const sl = state.selectedLanguage === 'Bahasa Malaysia' ? 'Malay' : state.selectedLanguage;
                setVideoLanguage(sl);
            }
            if (state.voiceoverMode) setVoiceoverMode(state.voiceoverMode);
            if (state.voiceoverMood) setVoiceoverMood(state.voiceoverMood);
            if (state.musicStyle) setMusicStyle(state.musicStyle);
            if (state.sceneImageModel === 'standard' || state.sceneImageModel === 'pro') {
                setSceneImageModel(isAdmin ? state.sceneImageModel : 'standard');
            }
        }
    } catch (e) { console.error("Failed to load state from session storage", e); }
  }, [isAdmin]);

  // Non-admin users must not access NanoBanana PRO.
  useEffect(() => {
    if (!isAdmin && sceneImageModel === 'pro') setSceneImageModel('standard');
  }, [isAdmin, sceneImageModel]);

  useEffect(() => {
    try {
        const stateToSave = { 
            productDesc,
            selectedContentType, selectedLanguage, storyboard, includeCaptions, includeVoiceover,
            includeModel,
            parsedScenes, 
            creativeState,
            videoAspectRatio, videoResolution, videoLanguage,
            voiceoverMode, voiceoverMood, musicStyle,
            sceneImageModel,
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateToSave));
    } catch (e: any) {
        // Only log if it's not a quota error (to avoid spam)
        if (e.name !== 'QuotaExceededError' && e.code !== 22) {
            console.error("Failed to save state to session storage", e);
        }
    }
  }, [
    productDesc,
    selectedContentType, selectedLanguage, storyboard, includeCaptions, includeVoiceover,
    includeModel,
    parsedScenes, creativeState,
    videoAspectRatio, videoResolution, videoLanguage,
    voiceoverMode, voiceoverMood, musicStyle, sceneImageModel
  ]);

  const generatedVideosRef = useRef(generatedVideos);
  useEffect(() => {
      generatedVideosRef.current = generatedVideos;
  }, [generatedVideos]);

  useEffect(() => {
    return () => {
      generatedVideosRef.current.forEach(url => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, []);

  // Effect to re-parse scenes whenever the storyboard text is edited by the user.
  useEffect(() => {
    if (storyboard) {
      const sceneSplitRegex = /\*\*(?:Scene|Babak)\s+\d+:\s*\*\*/i;
      const parts = storyboard.split(sceneSplitRegex);
      const scenes = parts.length > 1 ? parts.slice(1).map(part => part.trim()) : [];
      setParsedScenes(scenes.slice(0, 4));
    }
  }, [storyboard]);


  const handleProductImageUpload = useCallback((base64: string, mimeType: string) => {
    setProductImage({ base64, mimeType });
  }, []);

  const handleFaceImageUpload = useCallback((base64: string, mimeType: string) => {
    setFaceImage({ base64, mimeType });
  }, []);

  const handleRemoveProductImage = useCallback(() => {
    setProductImage(null);
  }, []);

  const handleRemoveFaceImage = useCallback(() => {
    setFaceImage(null);
  }, []);

  const handleGenerate = async () => {
    if ((includeModel === 'No' && !productImage) || (includeModel === 'Yes' && (!faceImage || !productImage)) || !productDesc) {
      setStoryboardError("Please upload the required images and provide a product description.");
      return;
    }
    setIsLoading(true);
    setStoryboardError(null);
    setStoryboard(null);
    setParsedScenes([]);
    setGeneratedImages(Array(4).fill(null));
    setImageGenerationErrors(Array(4).fill(null));
    
    // Revoke any existing video URLs before resetting state to prevent memory leaks.
    generatedVideosRef.current.forEach(url => { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url) });
    setGeneratedVideos(Array(4).fill(null));

    setGeneratedThumbnails(Array(4).fill(null));
    setVideoFilenames(Array(4).fill(null));
    setVideoGenerationStatus(Array(4).fill('idle'));
    setVideoGenerationErrors(Array(4).fill(null));

    // FIX: Group creative direction properties into a `creativeDirection` object to match the function signature.
    const prompt = getProductReviewStoryboardPrompt({
      productDesc,
      selectedLanguage,
      selectedContentType,
      includeCaptions,
      includeVoiceover,
      includeModel,
      creativeDirection: creativeState
    });

    try {
      const imagesPayload: MultimodalContent[] = [productImage!];
      if (includeModel === 'Yes' && faceImage) {
        imagesPayload.push(faceImage);
      }
      
      const result = await generateMultimodalContent(prompt, imagesPayload);
      setStoryboard(result); // This will trigger the useEffect to parse scenes

      await addHistoryItem({
        type: 'Storyboard',
        prompt: `Product Review: ${productDesc.substring(0, 50)}...`,
        result: result,
      });
      
    } catch (e) {
      const userFriendlyMessage = handleApiError(e);
      setStoryboardError(userFriendlyMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSceneChange = (index: number, newText: string) => {
    // Reconstruct the full storyboard string from the modified scenes
    if (storyboard) {
        // Create a temporary copy of parsedScenes to work with.
        const updatedScenes = [...parsedScenes];
        updatedScenes[index] = newText;

        const sceneTitle = 'Scene';
        
        // This regex will find all scene titles in the original storyboard.
        const titles = storyboard?.match(/\*\*(?:Scene|Babak)\s+\d+:.*?\*\*/gi) || [];
        
        const newStoryboardString = updatedScenes.map((content, i) => {
            // Try to use the original title, otherwise generate a new one.
            const title = titles[i] || `**${sceneTitle} ${i + 1}:**`;
            return `${title}\n${content}`;
        }).join('\n\n');

        setStoryboard(newStoryboardString);
    }
  };

    // New optimized function that uses pre-uploaded media IDs
    const generateSceneImageWithMediaIds = async (
        index: number, 
        serverUrl: string | undefined,
        productMediaId: string | null,
        faceMediaId: string | null,
        authToken: string | undefined,
        mediaServerUrl: string | undefined
    ) => {
        if (!productMediaId || !parsedScenes[index]) return;

        const startedAt = Date.now();
        setImageGenerationStartedAt((prev) => {
          const next = [...prev];
          next[index] = startedAt;
          return next;
        });
        setImageGenerationElapsedSec((prev) => {
          const next = [...prev];
          next[index] = 0;
          return next;
        });
        setImageGenerationDurationSec((prev) => {
          const next = [...prev];
          next[index] = null;
          return next;
        });

        setImageLoadingStatus(prev => {
            const newStatus = [...prev];
            newStatus[index] = true;
            return newStatus;
        });
        setImageGenerationErrors(prev => {
            const newErrors = [...prev];
            newErrors[index] = null;
            return newErrors;
        });

        try {
            const prompt = getProductReviewImagePrompt({
                productDesc,
                sceneDescription: parsedScenes[index],
                includeModel,
                creativeDirection: creativeState
            });

            if (sceneImageModel === 'pro') {
                const flowProjectId = uuidv4();
                const unifiedPack = await prepareVeolyNanobanana2UnifiedSession(flowProjectId);
                const referenceImageMediaIds: string[] = [productMediaId];
                if (includeModel === 'Yes' && faceMediaId) {
                    referenceImageMediaIds.push(faceMediaId);
                }
                const sharedAuth = unifiedPack?.oauthToken ?? authToken ?? currentUser.personalAuthToken;
                const nb2Result = await generateImageWithNanobanana2(
                    {
                        prompt,
                        config: {
                            aspectRatio: mapAspectRatio(videoAspectRatio as '1:1' | '9:16' | '16:9'),
                            sampleCount: 1,
                            referenceImageMediaIds,
                            authToken: sharedAuth,
                            serverUrl: serverUrl || mediaServerUrl,
                            projectId: flowProjectId,
                            ...(unifiedPack ? { unifiedSession: unifiedPack } : {}),
                        },
                    },
                    undefined,
                    false
                );
                const imageUrl = nb2Result.images[0]?.image?.generatedImage?.fifeUrl;
                if (!imageUrl) {
                    throw new Error('The AI did not return an image. Please try a different prompt.');
                }
                const imageBase64 = await convertNanobanana2UrlToBase64(imageUrl);
                await deductNanobananaProSceneCredits(currentUser.id);
                await addHistoryItem({
                    type: 'Image',
                    prompt: `Storyboard Scene ${index + 1}: ${parsedScenes[index].substring(0, 50)}...`,
                    result: imageBase64,
                });
                const updateResult = await incrementImageUsage(currentUser);
                if (updateResult.success && updateResult.user) {
                    onUserUpdate(updateResult.user);
                }
                setGeneratedImages((prev) => {
                    const newImages = [...prev];
                    newImages[index] = imageBase64;
                    return newImages;
                });
                return;
            }
            
            // Build recipe media inputs using pre-uploaded media IDs
            const recipeMediaInputs = [
                {
                    caption: 'product',
                    mediaInput: {
                        mediaCategory: 'MEDIA_CATEGORY_SUBJECT',
                        mediaGenerationId: productMediaId
                    }
                }
            ];
            
            if (includeModel === 'Yes' && faceMediaId) {
                recipeMediaInputs.push({
                    caption: 'model face',
                    mediaInput: {
                        mediaCategory: 'MEDIA_CATEGORY_SUBJECT',
                        mediaGenerationId: faceMediaId
                    }
                });
            }

            // Use runImageRecipe directly with pre-uploaded media IDs
            const { runImageRecipe } = await import('../../../services/imagenV3Service');
            const result = await runImageRecipe({
                userInstruction: prompt,
                recipeMediaInputs,
                config: {
                    aspectRatio: videoAspectRatio as '1:1' | '9:16' | '16:9',
                    authToken: authToken, // Use the token that owns the media IDs
                    serverUrl: serverUrl || mediaServerUrl // Use recipe server or fallback to media server
                }
            });
            const imageBase64 = result.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;

            if (!imageBase64) {
                throw new Error("The AI did not return an image. Please try a different prompt.");
            }
            
            await addHistoryItem({ type: 'Image', prompt: `Storyboard Scene ${index + 1}: ${parsedScenes[index].substring(0, 50)}...`, result: imageBase64 });

            const updateResult = await incrementImageUsage(currentUser);
            if (updateResult.success && updateResult.user) {
                onUserUpdate(updateResult.user);
            }

            setGeneratedImages(prev => {
                const newImages = [...prev];
                newImages[index] = imageBase64;
                return newImages;
            });
        } catch (e) {
            const userFriendlyMessage = handleApiError(e);
            setImageGenerationErrors(prev => {
                const newErrors = [...prev];
                newErrors[index] = userFriendlyMessage;
                return newErrors;
            });
        } finally {
            const end = Date.now();
            setImageGenerationDurationSec((prev) => {
              const next = [...prev];
              next[index] = Math.max(0, Math.floor((end - startedAt) / 1000));
              return next;
            });
            setImageLoadingStatus(prev => {
                const newStatus = [...prev];
                newStatus[index] = false;
                return newStatus;
            });
        }
    };

    const generateSceneImage = async (index: number, serverUrl?: string) => {
        if (!productImage || !parsedScenes[index]) return;

        const startedAt = Date.now();
        setImageGenerationStartedAt((prev) => {
          const next = [...prev];
          next[index] = startedAt;
          return next;
        });
        setImageGenerationElapsedSec((prev) => {
          const next = [...prev];
          next[index] = 0;
          return next;
        });
        setImageGenerationDurationSec((prev) => {
          const next = [...prev];
          next[index] = null;
          return next;
        });

        setImageLoadingStatus(prev => {
            const newStatus = [...prev];
            newStatus[index] = true;
            return newStatus;
        });
        setImageGenerationErrors(prev => {
            const newErrors = [...prev];
            newErrors[index] = null;
            return newErrors;
        });

        try {
            const prompt = getProductReviewImagePrompt({
                productDesc,
                sceneDescription: parsedScenes[index],
                includeModel,
                creativeDirection: creativeState
            });

            if (sceneImageModel === 'pro') {
                const { uploadImageForNanoBanana } = await import('../../../services/imagenV3Service');
                const { cropImageToAspectRatio } = await import('../../../services/imageService');

                let processedProduct = productImage.base64;
                try {
                    processedProduct = await cropImageToAspectRatio(productImage.base64, videoAspectRatio || '1:1');
                } catch (cropError) {
                    console.warn('Failed to process product image, using original', cropError);
                }
                const upProd = await uploadImageForNanoBanana(
                    processedProduct,
                    productImage.mimeType,
                    undefined,
                    undefined,
                    serverUrl
                );
                const referenceImageMediaIds: string[] = [upProd.mediaId];
                let authTok = upProd.successfulToken;
                let srvUrl = upProd.successfulServerUrl;

                if (includeModel === 'Yes' && faceImage) {
                    let processedFace = faceImage.base64;
                    try {
                        processedFace = await cropImageToAspectRatio(faceImage.base64, videoAspectRatio || '1:1');
                    } catch (cropError) {
                        console.warn('Failed to process face image, using original', cropError);
                    }
                    const upFace = await uploadImageForNanoBanana(
                        processedFace,
                        faceImage.mimeType,
                        authTok,
                        undefined,
                        srvUrl
                    );
                    referenceImageMediaIds.push(upFace.mediaId);
                    authTok = upFace.successfulToken;
                    srvUrl = upFace.successfulServerUrl;
                }

                const flowProjectId = uuidv4();
                const unifiedPack = await prepareVeolyNanobanana2UnifiedSession(flowProjectId);
                const sharedAuth = unifiedPack?.oauthToken ?? authTok ?? currentUser.personalAuthToken;

                const nb2Result = await generateImageWithNanobanana2(
                    {
                        prompt,
                        config: {
                            aspectRatio: mapAspectRatio(videoAspectRatio as '1:1' | '9:16' | '16:9'),
                            sampleCount: 1,
                            referenceImageMediaIds,
                            authToken: sharedAuth,
                            serverUrl: serverUrl || srvUrl,
                            projectId: flowProjectId,
                            ...(unifiedPack ? { unifiedSession: unifiedPack } : {}),
                        },
                    },
                    undefined,
                    false
                );
                const imageUrl = nb2Result.images[0]?.image?.generatedImage?.fifeUrl;
                if (!imageUrl) {
                    throw new Error('The AI did not return an image. Please try a different prompt.');
                }
                const imageBase64 = await convertNanobanana2UrlToBase64(imageUrl);
                await deductNanobananaProSceneCredits(currentUser.id);
                await addHistoryItem({
                    type: 'Image',
                    prompt: `Storyboard Scene ${index + 1}: ${parsedScenes[index].substring(0, 50)}...`,
                    result: imageBase64,
                });
                const updateResult = await incrementImageUsage(currentUser);
                if (updateResult.success && updateResult.user) {
                    onUserUpdate(updateResult.user);
                }
                setGeneratedImages((prev) => {
                    const newImages = [...prev];
                    newImages[index] = imageBase64;
                    return newImages;
                });
            } else {
                const imagesToCompose: { base64: string; mimeType: string; category: string; caption: string }[] = [
                    { ...productImage, category: 'MEDIA_CATEGORY_SUBJECT', caption: 'product' },
                ];
                if (includeModel === 'Yes' && faceImage) {
                    imagesToCompose.push({ ...faceImage, category: 'MEDIA_CATEGORY_SUBJECT', caption: 'model face' });
                }

                const result = await editOrComposeWithNanoBanana({
                    prompt,
                    images: imagesToCompose,
                    config: {
                        aspectRatio: videoAspectRatio as '1:1' | '9:16' | '16:9',
                        serverUrl: serverUrl,
                    },
                });
                const imageBase64 = result.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;

                if (!imageBase64) {
                    throw new Error('The AI did not return an image. Please try a different prompt.');
                }

                await addHistoryItem({
                    type: 'Image',
                    prompt: `Storyboard Scene ${index + 1}: ${parsedScenes[index].substring(0, 50)}...`,
                    result: imageBase64,
                });

                const updateResult = await incrementImageUsage(currentUser);
                if (updateResult.success && updateResult.user) {
                    onUserUpdate(updateResult.user);
                }

                setGeneratedImages((prev) => {
                    const newImages = [...prev];
                    newImages[index] = imageBase64;
                    return newImages;
                });
            }
        } catch (e) {
            const userFriendlyMessage = handleApiError(e);
            setImageGenerationErrors(prev => {
                const newErrors = [...prev];
                newErrors[index] = userFriendlyMessage;
                return newErrors;
            });
        } finally {
            const end = Date.now();
            setImageGenerationDurationSec((prev) => {
              const next = [...prev];
              next[index] = Math.max(0, Math.floor((end - startedAt) / 1000));
              return next;
            });
            setImageLoadingStatus(prev => {
                const newStatus = [...prev];
                newStatus[index] = false;
                return newStatus;
            });
        }
    };

  const handleRetryScene = (index: number) => generateSceneImage(index);

  const handleEditScene = async (index: number) => {
    const baseImage = generatedImages[index];
    if (!baseImage || typeof baseImage !== 'string' || !editPrompt.trim()) return;

    const startedAt = Date.now();
    setImageGenerationStartedAt((prev) => {
      const next = [...prev];
      next[index] = startedAt;
      return next;
    });
    setImageGenerationElapsedSec((prev) => {
      const next = [...prev];
      next[index] = 0;
      return next;
    });
    setImageGenerationDurationSec((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });

    setImageLoadingStatus(prev => {
        const newStatus = [...prev];
        newStatus[index] = true;
        return newStatus;
    });
    setImageGenerationErrors(prev => {
        const newErrors = [...prev];
        newErrors[index] = null;
        return newErrors;
    });

    const prompt = getImageEditingPrompt(editPrompt);
    
    try {
        if (sceneImageModel === 'pro') {
            const { uploadImageForNanoBanana } = await import('../../../services/imagenV3Service');
            const up = await uploadImageForNanoBanana(baseImage, 'image/png', undefined, undefined, undefined);
            const flowProjectId = uuidv4();
            const unifiedPack = await prepareVeolyNanobanana2UnifiedSession(flowProjectId);
            const sharedAuth = unifiedPack?.oauthToken ?? up.successfulToken ?? currentUser.personalAuthToken;
            const nb2Result = await generateImageWithNanobanana2(
                {
                    prompt,
                    config: {
                        aspectRatio: mapAspectRatio(videoAspectRatio as '1:1' | '9:16' | '16:9'),
                        sampleCount: 1,
                        referenceImageMediaIds: [up.mediaId],
                        authToken: sharedAuth,
                        serverUrl: up.successfulServerUrl,
                        projectId: flowProjectId,
                        ...(unifiedPack ? { unifiedSession: unifiedPack } : {}),
                    },
                },
                undefined,
                false
            );
            const imageUrl = nb2Result.images[0]?.image?.generatedImage?.fifeUrl;
            if (!imageUrl) {
                throw new Error('The AI did not return an edited image. Please try a different prompt.');
            }
            const imageBase64 = await convertNanobanana2UrlToBase64(imageUrl);
            await deductNanobananaProSceneCredits(currentUser.id);
            await addHistoryItem({
                type: 'Image',
                prompt: `Edited Storyboard Scene ${index + 1}: ${editPrompt}`,
                result: imageBase64,
            });
            const updateResult = await incrementImageUsage(currentUser);
            if (updateResult.success && updateResult.user) {
                onUserUpdate(updateResult.user);
            }
            setGeneratedImages((prev) => {
                const newImages = [...prev];
                newImages[index] = imageBase64;
                return newImages;
            });
        } else {
            const result = await editOrComposeWithNanoBanana({
                prompt,
                images: [{
                    base64: baseImage,
                    mimeType: 'image/png',
                    category: 'MEDIA_CATEGORY_SUBJECT',
                    caption: 'image to edit',
                }],
                config: { aspectRatio: '1:1' },
            });
            const imageBase64 = result.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;

            if (!imageBase64) {
                throw new Error('The AI did not return an edited image. Please try a different prompt.');
            }

            await addHistoryItem({
                type: 'Image',
                prompt: `Edited Storyboard Scene ${index + 1}: ${editPrompt}`,
                result: imageBase64,
            });

            const updateResult = await incrementImageUsage(currentUser);
            if (updateResult.success && updateResult.user) {
                onUserUpdate(updateResult.user);
            }

            setGeneratedImages((prev) => {
                const newImages = [...prev];
                newImages[index] = imageBase64;
                return newImages;
            });
        }

        setEditingSceneIndex(null);
        setEditPrompt('');

    } catch (e) {
        const userFriendlyMessage = handleApiError(e);
        setImageGenerationErrors(prev => {
            const newErrors = [...prev];
            newErrors[index] = userFriendlyMessage;
            return newErrors;
        });
    } finally {
        const end = Date.now();
        setImageGenerationDurationSec((prev) => {
          const next = [...prev];
          next[index] = Math.max(0, Math.floor((end - startedAt) / 1000));
          return next;
        });
        setImageLoadingStatus(prev => {
            const newStatus = [...prev];
            newStatus[index] = false;
            return newStatus;
        });
    }
  };

  const handleGenerateAllImages = async () => {
    setIsGeneratingImages(true);
    
    // Check if user selected localhost server
    const selectedServer = sessionStorage.getItem('selectedProxyServer');
    const isLocalhost = selectedServer?.includes('localhost');
    
    // OPTIMIZATION: Upload shared images (product + face) ONCE and reuse media IDs for all scenes
    // This reduces uploads from 8 (4 scenes × 2 images) to just 2 (1 product + 1 face)
    let sharedProductMediaId: string | null = null;
    let sharedFaceMediaId: string | null = null;
    let sharedToken: string | undefined;
    let sharedServerUrl: string | undefined;
    
    try {
        // Upload product image once
        if (productImage) {
            const { uploadImageForNanoBanana } = await import('../../../services/imagenV3Service');
            const { cropImageToAspectRatio } = await import('../../../services/imageService');
            
            let processedBase64 = productImage.base64;
            try {
                processedBase64 = await cropImageToAspectRatio(productImage.base64, videoAspectRatio || '1:1');
            } catch (cropError) {
                console.warn('Failed to process product image, using original', cropError);
            }
            
            const uploadResult = await uploadImageForNanoBanana(
                processedBase64,
                productImage.mimeType,
                undefined,
                undefined,
                isLocalhost ? selectedServer : undefined
            );
            sharedProductMediaId = uploadResult.mediaId;
            sharedToken = uploadResult.successfulToken;
            sharedServerUrl = uploadResult.successfulServerUrl;
            console.log(`📤 [Optimization] Uploaded product image once. MediaId: ${sharedProductMediaId.substring(0, 20)}...`);
        }
        
        // Upload face image once (if model is included)
        if (includeModel === 'Yes' && faceImage) {
            const { uploadImageForNanoBanana } = await import('../../../services/imagenV3Service');
            const { cropImageToAspectRatio } = await import('../../../services/imageService');
            
            let processedBase64 = faceImage.base64;
            try {
                processedBase64 = await cropImageToAspectRatio(faceImage.base64, videoAspectRatio || '1:1');
            } catch (cropError) {
                console.warn('Failed to process face image, using original', cropError);
            }
            
            const uploadResult = await uploadImageForNanoBanana(
                processedBase64,
                faceImage.mimeType,
                sharedToken, // Use same token
                undefined,
                sharedServerUrl // Use same server
            );
            sharedFaceMediaId = uploadResult.mediaId;
            console.log(`📤 [Optimization] Uploaded face image once. MediaId: ${sharedFaceMediaId.substring(0, 20)}...`);
        }
    } catch (uploadError) {
        console.error('Failed to upload shared images:', uploadError);
        setIsGeneratingImages(false);
        return;
    }
    
    // Multi-Server Distribution: Randomly distribute 4 recipe requests across different servers
    // If user selected localhost, use localhost for all requests (no distribution)
    const serverUrls: (string | undefined)[] = [];
    
    if (isLocalhost) {
        // User selected localhost - use localhost for all requests
        for (let i = 0; i < 4; i++) {
            serverUrls.push(selectedServer);
        }
        console.log(`🚀 [Localhost] Using localhost server for all 4 recipe requests`);
    } else {
        // Filter out localhost server for production multi-server distribution
        const availableServers = SERVERS
            .map(s => s.url)
            .filter(url => !url.includes('localhost'));
        
        // Random distribution for better load balancing
        if (availableServers.length > 0) {
            for (let i = 0; i < 4; i++) {
                // Randomly select a server for each scene
                const randomIndex = Math.floor(Math.random() * availableServers.length);
                serverUrls.push(availableServers[randomIndex]);
            }
        } else {
            // Fallback: no server override (use default)
            for (let i = 0; i < 4; i++) {
                serverUrls.push(undefined);
            }
        }
        console.log(`🚀 [Multi-Server] Randomly distributing 4 recipe requests across ${availableServers.length} servers:`, serverUrls);
    }
    
    // Fire parallel recipe requests with shared media IDs
    const promises = [];
    for (let i = 0; i < 4; i++) {
        if (parsedScenes[i]) {
            promises.push(new Promise<void>(resolve => {
                setTimeout(async () => {
                    await generateSceneImageWithMediaIds(i, serverUrls[i], sharedProductMediaId, sharedFaceMediaId, sharedToken, sharedServerUrl);
                    resolve();
                }, i * 500);
            }));
        }
    }
    
    await Promise.all(promises);
    setIsGeneratingImages(false);
  };
  
  const handleGenerateVideo = async (index: number, suppressAlert = false) => {
    const imageBase64 = generatedImages[index];
    if (!imageBase64 || !parsedScenes[index]) return;

    const startedAt = Date.now();
    setVideoGenerationStartedAt((prev) => {
      const next = [...prev];
      next[index] = startedAt;
      return next;
    });
    setVideoGenerationElapsedSec((prev) => {
      const next = [...prev];
      next[index] = 0;
      return next;
    });
    setVideoGenerationDurationSec((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });

    setVideoGenerationStatus(prev => {
        const newStatus = [...prev];
        newStatus[index] = 'loading';
        return newStatus;
    });
    setVideoGenerationErrors(prev => {
        const newErrors = [...prev];
        newErrors[index] = null;
        return newErrors;
    });

    try {
        const sceneText = parsedScenes[index];
        let voiceover = '';
        let caption = '';
        let visualDescription = sceneText;

        const voiceoverRegex = /\*\*(?:Voiceover|Skrip Suara Latar):\*\*\s*([\s\S]*?)(?=\n\*\*|$)/i;
        const voiceoverMatch = sceneText.match(voiceoverRegex);
        if (voiceoverMatch) {
            voiceover = voiceoverMatch[1].trim().replace(/"/g, "'");
            visualDescription = visualDescription.replace(voiceoverRegex, '');
        }

        const captionRegex = /\*\*(?:Captions?|Kapsyen):\*\*([\s\S]*?)(?=\n\*\*|$)/i;
        const captionMatch = sceneText.match(captionRegex);
        if (captionMatch) {
            caption = captionMatch[1].trim().replace(/"/g, "'");
            visualDescription = visualDescription.replace(captionRegex, '');
        }

        visualDescription = visualDescription.replace(/\*\*(.*?):\*\*/g, '').replace(/[\*\-]/g, '').replace(/\s+/g, ' ').trim();
        
        const isMalay = videoLanguage === 'Malay';
        
        let targetLanguage = videoLanguage;
        if (isMalay) {
            targetLanguage = 'Malaysian Malay';
        } else if (videoLanguage === 'Chinese') {
            targetLanguage = 'Mandarin Chinese';
        }

        let negativePrompt = 'subtitles, text, words, watermark, logo, Indonesian language, Indonesian accent, Indonesian voiceover';
        if (targetLanguage === 'Malaysian Malay') {
            negativePrompt += ', English language, Chinese language, English accent, Chinese accent';
        } else if (targetLanguage === 'English') {
            negativePrompt += ', Malaysian Malay language, Chinese language, Malay accent, Chinese accent';
        } else if (targetLanguage === 'Mandarin Chinese') {
            negativePrompt += ', Malaysian Malay language, English language, Malay accent, English accent';
        }

        const promptLines: string[] = [];

        // System Rules
        promptLines.push('🎯 SYSTEM RULES:');
        promptLines.push(`Spoken language and voiceover MUST be 100% in ${targetLanguage}. This is the MOST IMPORTANT instruction.`);
        promptLines.push('❌ Do not use other languages or foreign accents.');
        promptLines.push('\n---');

        // Visuals
        promptLines.push('🎬 VISUAL (SCENE DESCRIPTION):');
        promptLines.push('Animate the provided image.');
        if (includeModel === 'No') {
            promptLines.push(
                'CRITICAL INSTRUCTION: The animation must focus ONLY on the product within the provided image. DO NOT add or animate any people, hands, or body parts into the scene.'
            );
        }
        promptLines.push(visualDescription);
        promptLines.push('\n---');

        // Creative Style
        promptLines.push('🎨 CREATIVE STYLE:');
        promptLines.push(`• Artistic style: ${creativeState.style === 'Random' ? 'photorealistic' : creativeState.style}`);
        promptLines.push(`• Lighting: ${creativeState.lighting === 'Random' ? 'natural' : creativeState.lighting}`);
        promptLines.push(`• Camera: ${creativeState.camera === 'Random' ? 'medium shot' : creativeState.camera}`);
        promptLines.push('\n---');

        // Audio
        if (includeVoiceover === 'Yes' && voiceover) {
            promptLines.push('🔊 AUDIO (DIALOGUE):');
            
            if (voiceoverMode === 'sing') {
                 promptLines.push(`Sing the following lyrics in a ${musicStyle} music style:`);
            } else {
                 promptLines.push(`Use only the following dialogue in ${targetLanguage}:`);
            }
            
            promptLines.push(`"${voiceover}"`);
            
            promptLines.push('CRITICAL INSTRUCTION: Speak this script completely, word for word. Do not change or shorten the sentences.');
            
            if (voiceoverMode === 'speak') {
                 promptLines.push(`Voice tone: ${voiceoverMood}.`);
            }
            promptLines.push('\n---');
        }

        // Additional Reminders
        promptLines.push('🚫 ADDITIONAL REMINDERS:');
        if (includeCaptions === 'Yes' && caption) {
            promptLines.push(`• Display this exact on-screen text: "${caption}".`);
        } else {
            promptLines.push('• Do not include any on-screen text, captions, or subtitles.');
        }
        promptLines.push('• Do not change the language.');

        const fullPrompt = promptLines.join('\n');
        
        const image = { imageBytes: imageBase64, mimeType: 'image/png' };
        
        const { videoFile, thumbnailUrl } = await generateVideo(
            fullPrompt, 
            videoModel, 
            videoAspectRatio, 
            videoResolution, 
            negativePrompt,
            image
        );

        if (videoFile) {
            const objectUrl = URL.createObjectURL(videoFile);

            setGeneratedVideos(prev => {
                const newVideos = [...prev];
                if (newVideos[index] && newVideos[index]?.startsWith('blob:')) {
                    URL.revokeObjectURL(newVideos[index]!);
                }
                newVideos[index] = objectUrl;
                return newVideos;
            });
             setGeneratedThumbnails(prev => {
                const newThumbs = [...prev];
                newThumbs[index] = thumbnailUrl;
                return newThumbs;
            });

            setVideoGenerationStatus(prev => {
                const newStatus = [...prev];
                newStatus[index] = 'success';
                return newStatus;
            });
            setVideoFilenames(prev => {
                const newNames = [...prev];
                newNames[index] = videoFile.name;
                return newNames;
            });

            addHistoryItem({ type: 'Video', prompt: `Scene ${index + 1} Video`, result: videoFile }).then(async () => {
                const updateResult = await incrementVideoUsage(currentUser);
                if (updateResult.success && updateResult.user) {
                    onUserUpdate(updateResult.user);
                }
            }).catch(err => {
                console.error("Background video processing failed:", err);
                addLogEntry({
                    model: videoModel,
                    prompt: `Background save for Scene ${index + 1}`,
                    output: `Failed to save video to history/gallery. Error: ${err.message}`,
                    tokenCount: 0,
                    status: 'Error',
                    error: err.message
                });
            });
        }

    } catch (e) {
        const userFriendlyMessage = handleApiError(e);
        setVideoGenerationErrors(prev => {
            const newErrors = [...prev];
            newErrors[index] = userFriendlyMessage;
            return newErrors;
        });
        setVideoGenerationStatus(prev => {
            const newStatus = [...prev];
            newStatus[index] = 'error';
            return newStatus;
        });
    } finally {
        const end = Date.now();
        setVideoGenerationDurationSec((prev) => {
          const next = [...prev];
          next[index] = Math.max(0, Math.floor((end - startedAt) / 1000));
          return next;
        });
    }
  };
  
  const handleGenerateAllVideos = async () => {
    setIsGeneratingVideos(true);
    isVideoCancelledRef.current = false;
    for (let i = 0; i < 4; i++) {
        if (isVideoCancelledRef.current) {
            break;
        }
        if (generatedImages[i] && parsedScenes[i]) {
            await handleGenerateVideo(i, true);
        }
    }
    setIsGeneratingVideos(false);
  };
  
  const handleCancelVideos = () => {
      isVideoCancelledRef.current = true;
      setIsGeneratingVideos(false); // Immediately update UI
  };

  const handleDownloadVideo = async (url: string | null, filename: string, index: number) => {
    if (!url) return;
    setDownloadingVideoIndex(index);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
    } catch (error) {
        console.error("Download error:", error);
        alert("Failed to download video.");
    } finally {
        setDownloadingVideoIndex(null);
    }
  };

  const handleReset = useCallback(() => {
    setProductImage(null);
    setFaceImage(null);
    setProductDesc('');
    setSelectedContentType(contentTypeOptions[0]);
    setSelectedLanguage("English");
    setStoryboard(null);
    setStoryboardError(null);
    setIncludeCaptions('No');
    setIncludeVoiceover('Yes');
    setIncludeModel('No');
    setParsedScenes([]);
    setIsGeneratingImages(false);
    setGeneratedImages(Array(4).fill(null));
    setImageGenerationErrors(Array(4).fill(null));
    setProductImageUploadKey(Date.now());
    setFaceImageUploadKey(Date.now() + 1);
    setCreativeState(getInitialCreativeDirectionState());

    setIsGeneratingVideos(false);
    setVideoGenerationStatus(Array(4).fill('idle'));
    // Use the ref to ensure we're revoking the latest URLs
    generatedVideosRef.current.forEach(url => { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url) });
    setGeneratedVideos(Array(4).fill(null));
    setGeneratedThumbnails(Array(4).fill(null));
    setVideoFilenames(Array(4).fill(null));
    setVideoGenerationErrors(Array(4).fill(null));
    isVideoCancelledRef.current = false;
    
    setVoiceoverMode('speak');
    setVoiceoverMood('Normal');
    setMusicStyle('Pop');
    setVideoResolution('1080p');
    
    sessionStorage.removeItem(SESSION_KEY);
  }, []);
  
  const step2Disabled = parsedScenes.length === 0;
  const step3Disabled = !generatedImages.some(img => img);
  
  // Logic for Preview Modal
    const validGeneratedImages = useMemo(() => 
        generatedImages
            .map((img, index) => ({ img, index }))
            .filter((item): item is { img: string; index: number } => typeof item.img === 'string'),
        [generatedImages]
    );

    const currentPreviewItemInFilteredList = useMemo(() => {
        if (previewingSceneIndex === null) return null;
        const index = validGeneratedImages.findIndex(item => item.index === previewingSceneIndex);
        return index !== -1 ? { item: validGeneratedImages[index], filteredIndex: index } : null;
    }, [previewingSceneIndex, validGeneratedImages]);

    const itemToPreview = useMemo(() => {
        if (!currentPreviewItemInFilteredList) return null;
        
        return {
            id: `scene-${currentPreviewItemInFilteredList.item.index}`,
            type: 'Image' as const,
            prompt: parsedScenes[currentPreviewItemInFilteredList.item.index] || `Scene ${currentPreviewItemInFilteredList.item.index + 1}`,
            result: currentPreviewItemInFilteredList.item.img,
            timestamp: Date.now()
        };
    }, [currentPreviewItemInFilteredList, parsedScenes]);

    const handleNextPreview = () => {
        if (!currentPreviewItemInFilteredList) return;
        const { filteredIndex } = currentPreviewItemInFilteredList;
        if (filteredIndex < validGeneratedImages.length - 1) {
            setPreviewingSceneIndex(validGeneratedImages[filteredIndex + 1].index);
        }
    };
    const handlePreviousPreview = () => {
        if (!currentPreviewItemInFilteredList) return;
        const { filteredIndex } = currentPreviewItemInFilteredList;
        if (filteredIndex > 0) {
            setPreviewingSceneIndex(validGeneratedImages[filteredIndex - 1].index);
        }
    };

    const hasNextPreview = currentPreviewItemInFilteredList ? currentPreviewItemInFilteredList.filteredIndex < validGeneratedImages.length - 1 : false;
    const hasPreviousPreview = currentPreviewItemInFilteredList ? currentPreviewItemInFilteredList.filteredIndex > 0 : false;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">AI Video Storyboard</h1>
        <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mt-1">A powerful 3-step workflow to generate a complete 4-scene product review video, from script to final clips.</p>
        <div className="flex gap-2 mt-2">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-medium border border-blue-100 dark:border-blue-800">
                <UsersIcon className="w-3 h-3" />
                Multi-Server Parallel Processing Enabled
            </div>
        </div>
      </div>

      {/* Step 1: Inputs and Storyboard Generation */}
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm">
        <h2 className="text-lg sm:text-xl font-semibold mb-1">Step 1: Generate Script & Storyboard</h2>
        <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mb-6">Provide product details and creative direction to generate a 4-scene video script.</p>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Inputs */}
          <div className="space-y-4">
            <div>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Include a Model?</h3>
                <select 
                    value={includeModel} 
                    onChange={e => {
                        const value = e.target.value as 'Yes' | 'No';
                        setIncludeModel(value);
                        if (value === 'No') {
                            setFaceImage(null);
                            setFaceImageUploadKey(Date.now());
                        }
                    }} 
                    className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-3"
                >
                    <option value="No">No, Product Only</option>
                    <option value="Yes">Yes, With a Model</option>
                </select>
            </div>
            <div>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Upload Your Assets</h3>
                <div className={`grid grid-cols-1 ${includeModel === 'Yes' ? 'sm:grid-cols-2' : ''} gap-4`}>
                    <ImageUpload key={productImageUploadKey} id="review-product-upload" onImageUpload={handleProductImageUpload} onRemove={handleRemoveProductImage} title="Product Photo" description="Clear, front-facing" language={language}/>
                    {includeModel === 'Yes' && (
                        <ImageUpload key={faceImageUploadKey} id="review-face-upload" onImageUpload={handleFaceImageUpload} onRemove={handleRemoveFaceImage} title="Model's Face Photo" description="Clear, front-facing" language={language}/>
                    )}
                </div>
            </div>
             <div>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Product Description & Key Selling Points</h3>
                <textarea value={productDesc} onChange={e => setProductDesc(e.target.value)} placeholder='e.g., "This is a new anti-aging serum. Key points: reduces wrinkles in 7 days, contains hyaluronic acid, suitable for sensitive skin..."' rows={4} className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none transition" />
            </div>
             <div>
                <h3 className="text-base sm:text-lg font-semibold mb-2">Creative Direction</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">Content Type</label><select value={selectedContentType} onChange={e => setSelectedContentType(e.target.value)} className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm">{contentTypeOptions.map(o=><option key={o}>{o}</option>)}</select></div>
                    <div><label className="block text-sm font-medium mb-1">Output Language</label><select value={selectedLanguage} onChange={e => { const newLang = e.target.value; setSelectedLanguage(newLang); setVideoLanguage(newLang); }} className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm">{languages.map(o=><option key={o}>{o}</option>)}</select></div>
                    <div><label className="block text-sm font-medium mb-1">Include Voiceover Script?</label><select value={includeVoiceover} onChange={e => setIncludeVoiceover(e.target.value as any)} className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm"><option>Yes</option><option>No</option></select></div>
                    <div><label className="block text-sm font-medium mb-1">Include On-Screen Captions?</label><select value={includeCaptions} onChange={e => setIncludeCaptions(e.target.value as any)} className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm"><option>Yes</option><option>No</option></select></div>
                    
                    {/* ADDED: Aspect Ratio Selection for both Image and Video Steps */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Aspect Ratio</label>
                        <select value={videoAspectRatio} onChange={e => setVideoAspectRatio(e.target.value)} className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm">
                            <option value="9:16">9:16 (Portrait)</option>
                            <option value="16:9">16:9 (Landscape)</option>
                        </select>
                    </div>
                </div>
                <div className="mt-4">
                    <CreativeDirectionPanel
                      state={creativeState}
                      setState={setCreativeState}
                      language={language}
                      showPose={false}
                      showEffect={true}
                    />
                </div>
            </div>
            <div className="flex gap-4 items-center">
                <button onClick={handleGenerate} disabled={isLoading} className="w-full bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex-grow">
                    {isLoading ? <Spinner /> : "Generate Storyboard"}
                </button>
                 <button onClick={handleReset} disabled={isLoading} className="bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold py-3 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors">
                    Reset
                </button>
            </div>
            {storyboardError && <p className="text-red-500 text-center mt-2">{storyboardError}</p>}
          </div>
          {/* Right Column: Storyboard Output */}
          <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-4 relative min-h-[300px] flex flex-col">
            <h3 className="text-base sm:text-lg font-semibold mb-2 flex-shrink-0">Generated Storyboard</h3>
            {storyboard && (
                 <button onClick={() => downloadText(storyboard, `veoly-storyboard-${Date.now()}.txt`)} className="absolute top-4 right-4 text-xs bg-neutral-200 dark:bg-neutral-700 py-1 px-3 rounded-full flex items-center gap-1 z-10">
                    <DownloadIcon className="w-3 h-3"/> Download Text
                </button>
            )}
            {isLoading ? <div className="flex-1 flex h-full items-center justify-center"><Spinner /></div> : (
                storyboard ? (
                    <div className="flex-1 w-full h-full overflow-y-auto custom-scrollbar space-y-3 pr-2">
                        {parsedScenes.map((scene, index) => (
                            <div key={index} className="bg-white dark:bg-neutral-800/60 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700/50">
                                <h4 className="font-semibold text-sm mb-2 text-neutral-800 dark:text-neutral-200">Scene {index + 1}</h4>
                                <textarea
                                    value={scene}
                                    onChange={(e) => handleSceneChange(index, e.target.value)}
                                    rows={6}
                                    readOnly={false}
                                    className="w-full bg-transparent text-sm font-sans whitespace-pre-wrap custom-scrollbar resize-y focus:outline-none focus:ring-1 focus:ring-primary-500 rounded-md p-2 -m-1 cursor-text"
                                    placeholder="Edit scene content here..."
                                />
                            </div>
                        ))}
                    </div>
                )
                : <div className="flex-1 flex h-full items-center justify-center text-center text-sm text-neutral-500">Your generated storyboard will appear here.</div>
            )}
          </div>
        </div>
      </div>

      {/* Step 2: Image Generation */}
      <div className={`bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm transition-opacity duration-500 ${step2Disabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex justify-between items-center mb-1">
            <h2 className="text-lg sm:text-xl font-semibold">Step 2: Generate Scene Images</h2>
            <span className="text-xs bg-neutral-200 dark:bg-neutral-700 px-2 py-1 rounded font-mono">Aspect Ratio: {videoAspectRatio}</span>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">Create a unique AI-generated image for each scene from your storyboard.</p>

        <div className="mb-6 space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 shrink-0">
              Image generation model
            </p>
            <div
              className={`flex justify-center sm:justify-end ${isGeneratingImages ? 'pointer-events-none opacity-50' : ''}`}
            >
              <Tabs
                tabs={sceneImageModelTabs}
                activeTab={sceneImageModel}
                setActiveTab={setSceneImageModel}
              />
            </div>
          </div>
          {sceneImageModel === 'pro' && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 sm:text-right">
              PRO uses GEM_PIX_2 (nanobanana2). Each successful scene image deducts {NANO2_SCENE_CREDIT_COST}{' '}
              package credits (generate, retry, or edit).
            </p>
          )}
        </div>

        <button onClick={handleGenerateAllImages} disabled={isGeneratingImages || step2Disabled} className="w-full mb-6 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
            {isGeneratingImages ? <Spinner/> : 'Create All 4 Images'}
        </button>
        {isGeneratingImages && <p className="text-center text-sm text-neutral-500 -mt-4 mb-4">This may take a minute...</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={`image-scene-${i}`} className="bg-neutral-100 dark:bg-neutral-800/50 p-3 rounded-lg flex flex-col gap-3">
                    <p className="font-bold text-sm">Scene {i+1}</p>
                    <div
                        onClick={() => {
                            if (generatedImages[i] && typeof generatedImages[i] === 'string') {
                                setPreviewingSceneIndex(i);
                            }
                        }}
                        className={`overflow-hidden bg-neutral-200 dark:bg-neutral-700/50 rounded-md flex items-center justify-center relative group w-full p-0 border-0 ${generatedImages[i] && typeof generatedImages[i] === 'string' ? 'cursor-pointer' : ''}`}
                        style={{ aspectRatio: videoAspectRatio.replace(':', ' / ') }}
                        role="button"
                        tabIndex={generatedImages[i] && typeof generatedImages[i] === 'string' ? 0 : -1}
                        aria-label={`Preview scene ${i + 1}`}
                    >
                        {/* background layer (video-like) */}
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(74,108,247,0.28),transparent_60%),radial-gradient(circle_at_80%_30%,rgba(160,91,255,0.22),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.0))] dark:bg-[radial-gradient(circle_at_25%_20%,rgba(74,108,247,0.18),transparent_60%),radial-gradient(circle_at_80%_30%,rgba(160,91,255,0.16),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.0))]" />
                        {/* timer badge */}
                        {imageLoadingStatus[i] ? (
                          <div className="absolute bottom-2 right-2 z-10 rounded-lg bg-red-600/80 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
                            Time: <span className="font-mono">{formatDuration(imageGenerationElapsedSec[i] || 0)}</span>
                          </div>
                        ) : imageGenerationDurationSec[i] !== null ? (
                          <div className="absolute bottom-2 right-2 z-10 rounded-lg bg-red-600/70 px-2.5 py-1 text-[11px] font-bold text-white/95 backdrop-blur">
                            Time: <span className="font-mono">{formatDuration(imageGenerationDurationSec[i] || 0)}</span>
                          </div>
                        ) : null}
                        {step2Disabled ? (
                            <div className="flex flex-col items-center justify-center text-center text-xs text-neutral-500 p-2">
                                <ImageIcon className="w-8 h-8 mb-2"/>
                                <p>Waiting for storyboard</p>
                            </div>
                        ) : imageLoadingStatus[i] ? <Spinner/> : imageGenerationErrors[i] ? (
                            <div className="text-center text-red-500 p-2">
                                <AlertTriangleIcon className="w-8 h-8 mx-auto mb-2"/>
                                <p className="text-xs">{imageGenerationErrors[i]}</p>
                            </div>
                        ) : generatedImages[i] && typeof generatedImages[i] === 'string' ? (
                            <>
                                <img src={`data:image/png;base64,${generatedImages[i]}`} alt={`Scene ${i+1}`} className="w-full h-full object-cover rounded-md"/>
                                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => {e.stopPropagation(); onReEdit({ base64: generatedImages[i]!, mimeType: 'image/png' })}} title="Re-edit" className="p-1.5 bg-black/60 text-white rounded-full"><WandIcon className="w-4 h-4"/></button>
                                    <button onClick={(e) => {e.stopPropagation(); onCreateVideo({ prompt: parsedScenes[i], image: { base64: generatedImages[i]!, mimeType: 'image/png' } })}} title="Recreate Video" className="p-1.5 bg-black/60 text-white rounded-full"><VideoIcon className="w-4 h-4"/></button>
                                </div>
                            </>
                        ) : null}
                    </div>
                    {editingSceneIndex === i ? (
                        <div className="space-y-2 animate-zoomIn">
                            <textarea
                                value={editPrompt}
                                onChange={(e) => setEditPrompt(e.target.value)}
                                placeholder="e.g., make it black and white..."
                                rows={3}
                                className="w-full text-sm bg-white dark:bg-neutral-700 p-2 rounded-md resize-y focus:ring-1 focus:ring-primary-500 focus:outline-none custom-scrollbar"
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleEditScene(i)} 
                                    disabled={imageLoadingStatus[i] || !editPrompt.trim()} 
                                    className="w-full text-sm bg-primary-600 text-white font-semibold py-2 px-3 rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                                >
                                    {imageLoadingStatus[i] ? <Spinner/> : 'Submit Edit'}
                                </button>
                                <button 
                                    onClick={() => setEditingSceneIndex(null)} 
                                    className="flex-shrink-0 text-sm bg-neutral-200 dark:bg-neutral-600 font-semibold py-2 px-3 rounded-md hover:bg-neutral-300 dark:hover:bg-neutral-500 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            <button 
                                onClick={() => handleRetryScene(i)} 
                                disabled={imageLoadingStatus[i] || !parsedScenes[i]} 
                                className="w-full text-sm bg-white dark:bg-neutral-700 font-semibold py-2 px-3 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {imageLoadingStatus[i] ? <Spinner/> : <><ImageIcon className="w-4 h-4"/> Recreate Image</>}
                            </button>
                            <button 
                                onClick={() => { setEditingSceneIndex(i); setEditPrompt(''); }} 
                                disabled={!generatedImages[i] || typeof generatedImages[i] !== 'string' || imageLoadingStatus[i]} 
                                className="w-full text-sm bg-white dark:bg-neutral-700 font-semibold py-2 px-3 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <WandIcon className="w-4 h-4"/> Edit This Image
                            </button>
                            <a
                                href={generatedImages[i] && typeof generatedImages[i] === 'string' ? `data:image/png;base64,${generatedImages[i]}` : undefined}
                                download={generatedImages[i] && typeof generatedImages[i] === 'string' ? `${BRAND_CONFIG.shortName.toLowerCase()}-scene-${i + 1}.png` : undefined}
                                className={`w-full text-sm bg-green-600 text-white font-semibold py-2 px-3 rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2 ${!generatedImages[i] || typeof generatedImages[i] !== 'string' ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                                onClick={(e) => { if (!generatedImages[i] || typeof generatedImages[i] !== 'string') e.preventDefault(); }}
                                aria-disabled={!generatedImages[i] || typeof generatedImages[i] !== 'string'}
                                role="button"
                            >
                                <DownloadIcon className="w-4 h-4"/> Download
                            </a>
                        </div>
                    )}
                </div>
            ))}
        </div>
      </div>
      
       {/* Step 3: Video Generation */}
      <div className={`bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm transition-opacity duration-500 ${step3Disabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        <h2 className="text-lg sm:text-xl font-semibold mb-1">Step 3: Generate Scene Videos</h2>
        <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mb-6">Animate your generated scene images into video clips.</p>
        
        <div className="mb-6 p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
            <h3 className="text-base sm:text-lg font-semibold mb-2">Video Generation Settings</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                 <div>
                    <label className="block text-sm font-medium mb-1">Aspect Ratio</label>
                    <select value={videoAspectRatio} onChange={e=>setVideoAspectRatio(e.target.value)} className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm">
                        <option value="9:16">9:16 (Portrait)</option>
                        <option value="16:9">16:9 (Landscape)</option>
                    </select>
                 </div>
                 <div><label className="block text-sm font-medium mb-1">Resolution</label><select value={videoResolution} onChange={e=>setVideoResolution(e.target.value)} className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm">{["720p", "1080p"].map(o=><option key={o}>{o}</option>)}</select></div>
                 <div>
                    <label className="block text-sm font-medium mb-1">Voiceover Language</label>
                    <select value={videoLanguage} onChange={e=>setVideoLanguage(e.target.value)} className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm">
                        {languages.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Voiceover Mode</label>
                    <div className="flex gap-2 p-1 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg">
                        <button
                            onClick={() => setVoiceoverMode('speak')}
                            className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                                voiceoverMode === 'speak' 
                                ? 'bg-white dark:bg-neutral-700 shadow-sm text-primary-600 dark:text-primary-400' 
                                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                            }`}
                        >
                            Speak
                        </button>
                        <button
                            onClick={() => setVoiceoverMode('sing')}
                            className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                                voiceoverMode === 'sing' 
                                ? 'bg-white dark:bg-neutral-700 shadow-sm text-primary-600 dark:text-primary-400' 
                                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                            }`}
                        >
                            Sing
                        </button>
                    </div>
                </div>
                
                {voiceoverMode === 'speak' ? (
                    <div>
                        <label className="block text-sm font-medium mb-1">Voiceover Mood</label>
                        <select 
                            value={voiceoverMood} 
                            onChange={e => setVoiceoverMood(e.target.value)} 
                            className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm"
                        >
                            {moodOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm font-medium mb-1">Music Style</label>
                        <select 
                            value={musicStyle} 
                            onChange={e => setMusicStyle(e.target.value)} 
                            className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-sm"
                        >
                            {musicStyleOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                )}
            </div>
        </div>

        <div className="flex gap-4 mb-4">
            <button onClick={handleGenerateAllVideos} disabled={isGeneratingVideos || step3Disabled} className="w-full bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
                {isGeneratingVideos ? <Spinner variant="success" /> : 'Create All 4 Videos'}
            </button>
            {isGeneratingVideos && (
                <button onClick={handleCancelVideos} className="bg-red-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors">
                    Cancel
                </button>
            )}
        </div>
         <div className="p-3 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700/50 mb-6 text-sm text-neutral-600 dark:text-neutral-400">
            <div className="flex gap-3">
                <div className="bg-primary-100 dark:bg-primary-900/30 p-2 h-fit rounded-full text-primary-600 dark:text-primary-400 shrink-0">
                    <InformationCircleIcon className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                    <p>This process can take several minutes.</p>
                    <p><strong>Note:</strong> Voiceover language may be inconsistent. If you are not satisfied, you can regenerate the video individually using the 'Recreate Video' button on each scene.</p>
                </div>
            </div>
         </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
                 <div key={`video-scene-${i}`} className="bg-neutral-100 dark:bg-neutral-800/50 p-3 rounded-lg flex flex-col gap-3">
                    <p className="font-bold text-sm">Scene {i+1}</p>
                    <div className="bg-neutral-200 dark:bg-neutral-700/50 rounded-md flex items-center justify-center relative group overflow-hidden" style={{ aspectRatio: videoAspectRatio.replace(':', ' / ') }}>
                        {/* background layer (video-like) */}
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(74,108,247,0.28),transparent_60%),radial-gradient(circle_at_80%_30%,rgba(160,91,255,0.22),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.0))] dark:bg-[radial-gradient(circle_at_25%_20%,rgba(74,108,247,0.18),transparent_60%),radial-gradient(circle_at_80%_30%,rgba(160,91,255,0.16),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.0))]" />
                        {/* timer badge */}
                        {videoGenerationStatus[i] === 'loading' ? (
                          <div className="absolute bottom-2 right-2 z-10 rounded-lg bg-red-600/80 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
                            Time: <span className="font-mono">{formatDuration(videoGenerationElapsedSec[i] || 0)}</span>
                          </div>
                        ) : videoGenerationStatus[i] === 'success' && videoGenerationDurationSec[i] !== null ? (
                          <div className="absolute bottom-2 right-2 z-10 rounded-lg bg-red-600/70 px-2.5 py-1 text-[11px] font-bold text-white/95 backdrop-blur">
                            Time: <span className="font-mono">{formatDuration(videoGenerationDurationSec[i] || 0)}</span>
                          </div>
                        ) : null}
                        {step3Disabled || !generatedImages[i] ? (
                            <div className="flex flex-col items-center justify-center text-center text-xs text-neutral-500 p-2">
                                <VideoIcon className="w-8 h-8 mb-2"/>
                                <p>Waiting for image</p>
                            </div>
                        ) : videoGenerationStatus[i] === 'loading' ? <Spinner variant="success" /> : videoGenerationStatus[i] === 'error' ? (
                            <div className="text-center text-red-500 p-2"><AlertTriangleIcon className="w-8 h-8 mx-auto mb-2"/><p className="text-xs">{videoGenerationErrors[i]}</p></div>
                        ) : videoGenerationStatus[i] === 'success' && generatedVideos[i] ? (
                            <video
                                key={generatedVideos[i]}
                                src={generatedVideos[i]!} 
                                poster={generatedThumbnails[i] || `data:image/png;base64,${generatedImages[i]}`} 
                                controls 
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover rounded-md"
                            />
                        ) : (
                            <img src={`data:image/png;base64,${generatedImages[i]}`} alt={`Scene ${i+1} preview`} className="w-full h-full object-cover rounded-md"/>
                        )}
                    </div>
                    <button onClick={() => handleGenerateVideo(i)} disabled={!generatedImages[i] || videoGenerationStatus[i] === 'loading' || isGeneratingVideos} className="w-full text-sm bg-white dark:bg-neutral-700 font-semibold py-2 px-3 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                       {videoGenerationStatus[i] === 'loading' ? <Spinner variant="success" /> : <><VideoIcon className="w-4 h-4"/> Recreate Video</>}
                    </button>
                    <button
                        onClick={() => handleDownloadVideo(generatedVideos[i], videoFilenames[i] || `veoly-scene-${i+1}.mp4`, i)}
                        disabled={!generatedVideos[i] || downloadingVideoIndex !== null}
                        className="w-full text-sm bg-green-600 text-white font-semibold py-2 px-3 rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2 text-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {downloadingVideoIndex === i ? <Spinner variant="success" /> : <DownloadIcon className="w-4 h-4"/>}
                        {downloadingVideoIndex === i ? 'Downloading...' : 'Download'}
                    </button>
                </div>
            ))}
        </div>
      </div>

      {itemToPreview && (
          <PreviewModal
              item={itemToPreview}
              onClose={() => setPreviewingSceneIndex(null)}
              getDisplayUrl={(item) => `data:image/png;base64,${item.result}`}
              onNext={handleNextPreview}
              onPrevious={handlePreviousPreview}
              hasNext={hasNextPreview}
              hasPrevious={hasPreviousPreview}
              language={language}
          />
      )}
    </div>
  );
};

export default ProductReviewView;
