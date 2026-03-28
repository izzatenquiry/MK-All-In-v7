
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { addHistoryItem } from '../../../services/historyService';
import Spinner from '../../common/Spinner';
import { UploadIcon, TrashIcon, DownloadIcon, VideoIcon, StarIcon, WandIcon, AlertTriangleIcon, RefreshCwIcon, EyeIcon, EyeOffIcon, CheckCircleIcon, InformationCircleIcon, XIcon, KeyIcon } from '../../Icons';
import TwoColumnLayout from '../../common/TwoColumnLayout';
import { handleApiError } from '../../../services/errorHandler';
import { generateImageWithNanobanana2, mapAspectRatio } from '../../../services/nanobanana2Service';
import { incrementImageUsage, saveUserRecaptchaToken, hasActiveTokenUltraWithRegistration, getMasterRecaptchaToken } from '../../../services/userService';
import { type User, type Language } from '../../../types';
import CreativeDirectionPanel from '../../common/CreativeDirectionPanel';
import { getInitialCreativeDirectionState, type CreativeDirectionState } from '../../../services/creativeDirectionService';
import { UI_SERVER_LIST } from '../../../services/serverConfig';
import { BRAND_CONFIG } from '../../../services/brandConfig';

// Note: NANOBANANA 2 returns signed URLs, not base64
interface ImageData {
  id: string;
  previewUrl: string;
  base64?: string; // For reference images (uploaded)
  mimeType?: string;
}

type ImageSlot = string | { url: string; base64: string; mediaGenerationId?: string } | { error: string } | null;

// Download image from base64 (same as NanoBanana)
const downloadImage = (base64Image: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${base64Image}`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Convert URL to base64 using proxy (bypasses CORS)
const convertUrlToBase64 = async (imageUrl: string): Promise<string> => {
  try {
    // Use server proxy to fetch image (bypasses CORS)
    const serverUrl = sessionStorage.getItem('selectedProxyServer') || 'http://localhost:3001';
    const proxyUrl = `${serverUrl}/api/nanobanana/download-image?url=${encodeURIComponent(imageUrl)}`;
    
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const blob = await response.blob();
    const reader = new FileReader();
    return new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to convert image URL to base64:', error);
    throw error; // Don't fallback to URL - throw error instead
  }
};

interface VideoGenPreset {
  prompt: string;
  image: { base64: string; mimeType: string; };
}

interface ImageEditPreset {
  base64: string;
  mimeType: string;
}

interface Nanobanana2GenerationViewProps {
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

const SESSION_KEY = 'nanobanana2GenerationState';

const Nanobanana2GenerationView: React.FC<Nanobanana2GenerationViewProps> = ({ 
  onCreateVideo, 
  onReEdit, 
  imageToReEdit, 
  clearReEdit, 
  presetPrompt, 
  clearPresetPrompt, 
  currentUser, 
  onUserUpdate, 
  language 
}) => {
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
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9'>('9:16');
  const [creativeState, setCreativeState] = useState<CreativeDirectionState>(getInitialCreativeDirectionState());
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [selectedImageForDownload, setSelectedImageForDownload] = useState<{ url: string; base64: string; mediaGenerationId?: string } | null>(null);
  // Store original generation parameters for regeneration with different sizes
  const [lastGenerationParams, setLastGenerationParams] = useState<{
    prompt: string;
    aspectRatio: '1:1' | '9:16' | '16:9';
    referenceImageMediaIds?: string[];
    creativeState: CreativeDirectionState;
  } | null>(null);

  // Personal Anti-Captcha Key state
  const [showPersonalKeyForm, setShowPersonalKeyForm] = useState(false);
  const [personalKeyInput, setPersonalKeyInput] = useState('');
  const [showPersonalKey, setShowPersonalKey] = useState(false);
  const [isSavingPersonalKey, setIsSavingPersonalKey] = useState(false);
  const [saveKeyStatus, setSaveKeyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // IP and Block Status
  const [userIP, setUserIP] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  const isEditing = referenceImages.length > 0;

  useEffect(() => {
    try {
      const savedState = sessionStorage.getItem(SESSION_KEY);
      if (savedState) {
        const state = JSON.parse(savedState);
        if (state.prompt) setPrompt(state.prompt);
        if (state.numberOfImages) setNumberOfImages(state.numberOfImages);
        if (state.selectedImageIndex) setSelectedImageIndex(state.selectedImageIndex);
        if (state.aspectRatio) setAspectRatio(state.aspectRatio);
        if (state.creativeState) setCreativeState(state.creativeState);
      }
    } catch (e) { console.error("Failed to load state from session storage", e); }
  }, []);

  useEffect(() => {
    try {
      const stateToSave = { prompt, numberOfImages, selectedImageIndex, aspectRatio, creativeState };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateToSave));
    } catch (e: any) {
        if (e.name !== 'QuotaExceededError' && e.code !== 22) {
            console.error("Failed to save state to session storage", e);
        }
    }
  }, [prompt, numberOfImages, selectedImageIndex, aspectRatio, creativeState]);

  // Check IP and block status for MONOKLIX users
  useEffect(() => {
    const checkIPAndBlock = async () => {
      if (BRAND_CONFIG.name === 'MONOKLIX') {
        // Check feature flag - admin can enable/disable blocking modal via brandConfig.ts
        const showBlockingModal = BRAND_CONFIG.featureFlags?.showNanobananaBlockingModal ?? false;
        
        if (!showBlockingModal) {
          // Modal disabled by default - skip blocking check
          setIsBlocked(false);
          return;
        }
        
        try {
          // Get user IP address
          const ipResponse = await fetch('https://api.ipify.org?format=json');
          const ipData = await ipResponse.json();
          setUserIP(ipData.ip);
          
          // Block all MONOKLIX users if feature flag is enabled
          setIsBlocked(true);
        } catch (error) {
          console.error('Failed to check IP:', error);
          // Default to blocked for MONOKLIX if IP check fails (only if flag enabled)
          setIsBlocked(true);
        }
      }
    };
    
    checkIPAndBlock();
  }, []);

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

  // Check if user has personal key on mount and when currentUser changes
  // For ESAIE, skip personal key requirement (uses master token)
  useEffect(() => {
    // ESAIE users don't need personal key - always hide form
    if (BRAND_CONFIG.name === 'ESAIE') {
      setShowPersonalKeyForm(false);
      return;
    }
    
    // MONOKLIX: Show form if no personal key
    if (!(currentUser.recaptchaToken && currentUser.recaptchaToken.trim())) {
      setShowPersonalKeyForm(true);
    } else {
      setShowPersonalKeyForm(false);
    }
  }, [currentUser.recaptchaToken]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
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

  const generateOneImage = useCallback(async (index: number, serverUrl?: string) => {
    try {
      const creativeDetails = Object.entries(creativeState)
        .filter(([key, value]) => key !== 'creativityLevel' && value !== 'Random' && value !== 'None')
        .map(([, value]) => value)
        .join(', ');
      
      const fullPrompt = [prompt, creativeDetails].filter(Boolean).join(', ');

      // For image-to-image, need to upload reference images first to get mediaId
      let referenceImageMediaIds: string[] = [];
      let sharedToken: string | undefined = currentUser.personalAuthToken || undefined;
      let sharedServerUrl: string | undefined = serverUrl;

      if (isEditing && referenceImages.length > 0) {
        try {
          const { uploadImageForNanoBanana } = await import('../../../services/imagenV3Service');
          const { cropImageToAspectRatio } = await import('../../../services/imageService');
          
          setStatusMessage(`Uploading ${referenceImages.length} reference image(s)...`);
          
          // Upload all reference images
          for (let i = 0; i < referenceImages.length; i++) {
            const img = referenceImages[i];
            let processedBase64 = img.base64;
            
            // Crop image to match aspect ratio if needed
            try {
              processedBase64 = await cropImageToAspectRatio(img.base64, aspectRatio);
            } catch (cropError) {
              console.warn(`Failed to crop reference image ${i + 1}, using original`, cropError);
            }
            
            const uploadResult = await uploadImageForNanoBanana(
              processedBase64,
              img.mimeType,
              sharedToken,
              (status) => setStatusMessage(`Uploading image ${i + 1}/${referenceImages.length}: ${status}`),
              sharedServerUrl
            );
            
            referenceImageMediaIds.push(uploadResult.mediaId);
            if (!sharedToken) {
              sharedToken = uploadResult.successfulToken;
              sharedServerUrl = uploadResult.successfulServerUrl;
            }
          }
          
          console.log(`📤 [NANOBANANA 2] Uploaded ${referenceImages.length} reference image(s). Media IDs:`, referenceImageMediaIds);
        } catch (uploadError) {
          console.error('Failed to upload reference images:', uploadError);
          throw new Error(`Failed to upload reference images: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
        }
      }

      const result = await generateImageWithNanobanana2({
        prompt: fullPrompt,
        config: {
          aspectRatio: mapAspectRatio(aspectRatio),
          sampleCount: 1,
          referenceImageMediaIds: referenceImageMediaIds.length > 0 ? referenceImageMediaIds : undefined,
          authToken: sharedToken,
          serverUrl: sharedServerUrl
        }
      }, (status) => {
        setStatusMessage(status);
      });

      // Extract URLs from response
      const imageUrls = result.images.map(img => img.image.generatedImage.fifeUrl);
      
      if (imageUrls.length === 0) {
        throw new Error("The AI did not return an image.");
      }

      const imageUrl = imageUrls[0]; // Get first image
      
      // Convert URL to base64 using proxy (bypass CORS)
      let imageBase64: string;
      try {
        imageBase64 = await convertUrlToBase64(imageUrl);
      } catch (error) {
        // If conversion fails, skip history but still show image
        console.error('Failed to convert to base64, skipping history:', error);
        // Still store URL for display, but don't add to history
        setImages(prev => {
          const newImages = [...prev];
          newImages[index] = { url: imageUrl, base64: '' }; // Empty base64 means no download/gallery
          return newImages;
        });
        setProgress(prev => prev + 1);
        return; // Exit early if conversion fails
      }
      
      await addHistoryItem({
        type: 'Image',
        prompt: `NANOBANANA 2: ${prompt}`,
        result: imageBase64 // Store proper base64
      });

      const updateResult = await incrementImageUsage(currentUser);
      if (updateResult.success && updateResult.user) {
        onUserUpdate(updateResult.user);
      }

      // Store both URL (for display) and base64 (for download/gallery)
      // Also store mediaGenerationId if available for potential regeneration
      const mediaGenerationId = result.images[0]?.image?.generatedImage?.mediaGenerationId;
      setImages(prev => {
        const newImages = [...prev];
        newImages[index] = { url: imageUrl, base64: imageBase64, mediaGenerationId };
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
  }, [prompt, aspectRatio, creativeState, currentUser, onUserUpdate, referenceImages, isEditing]);

  const handleSavePersonalKey = async () => {
    // ESAIE users don't need personal key - this function should not be called for ESAIE
    // But add check for safety
    if (BRAND_CONFIG.name === 'ESAIE') {
      console.warn('[Nanobanana2] ESAIE users should not need to save personal key');
      return;
    }

    // Frontend validation: Check if input key matches master key - for MONOKLIX users only
    if (personalKeyInput.trim()) {
      try {
        // Get master token from cache or fetch - check for MONOKLIX users (not just Token Ultra active)
        let masterKey: string | null = null;
        
        // Check cache first
        const cachedMasterToken = sessionStorage.getItem('master_recaptcha_token');
        if (cachedMasterToken && cachedMasterToken.trim()) {
          masterKey = cachedMasterToken;
        } else {
          // Fetch if not cached
          const masterTokenResult = await getMasterRecaptchaToken();
          if (masterTokenResult.success && masterTokenResult.apiKey) {
            masterKey = masterTokenResult.apiKey;
          }
        }

        // Compare if master key exists - Block master key for MONOKLIX users
        if (masterKey && masterKey.trim() === personalKeyInput.trim()) {
          setSaveKeyStatus('error');
          setError('You cannot use the master Anti-Captcha API key. Please use your own personal Anti-Captcha API key.');
          return;
        }
      } catch (validationError) {
        console.error('Error validating key:', validationError);
        // Continue with save if validation fails
      }
    }

    setIsSavingPersonalKey(true);
    setSaveKeyStatus('saving');
    try {
      const result = await saveUserRecaptchaToken(currentUser.id, personalKeyInput.trim() || null);
      if (result.success) {
        onUserUpdate(result.user);
        setSaveKeyStatus('success');
        setShowPersonalKeyForm(false);
        setPersonalKeyInput('');
        setError(null); // Clear any previous errors
        setTimeout(() => {
          setSaveKeyStatus('idle');
        }, 2000);
      } else {
        setSaveKeyStatus('error');
        // Check for master key error message
        if (result.message.includes('MASTER_KEY_NOT_ALLOWED')) {
          setError('You cannot use the master Anti-Captcha API key. Please use your own personal Anti-Captcha API key.');
        } else {
          setError(result.message || 'Failed to save key. Please try again.');
        }
      }
    } catch (err) {
      console.error('Failed to save personal key:', err);
      setSaveKeyStatus('error');
      setError('Failed to save key. Please try again.');
    } finally {
      setIsSavingPersonalKey(false);
    }
  };

  const handleGenerate = useCallback(async () => {
    // For ESAIE, skip personal key check (uses master token automatically)
    // For MONOKLIX, NANOBANANA PRO requires personal anti-captcha key
    if (BRAND_CONFIG.name !== 'ESAIE') {
      if (!(currentUser.recaptchaToken && currentUser.recaptchaToken.trim())) {
        setError('Personal Anti-Captcha API key is required for NANOBANANA PRO. Please enter your key above.');
        setShowPersonalKeyForm(true);
        return;
      }
    }

    if (!prompt.trim() && !isEditing) {
      setError("Please enter a prompt to describe the image you want to create.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStatusMessage(numberOfImages > 1 ? 'Initializing parallel generation...' : 'Preparing request...');
    setImages(Array(numberOfImages).fill(null));
    setSelectedImageIndex(0);
    setProgress(0);

    // Check if user selected localhost server
    const selectedServer = sessionStorage.getItem('selectedProxyServer');
    const isLocalhost = selectedServer?.includes('localhost');
    
    // Multi-Server Distribution: 
    // - If 1 image: Use user's selected server
    // - If multiple images: Randomly distribute for load balancing
    // - If localhost: Always use localhost for all requests
    const serverUrls: (string | undefined)[] = [];
    
    if (isLocalhost) {
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
                const randomIndex = Math.floor(Math.random() * availableServers.length);
                serverUrls.push(availableServers[randomIndex]);
            }
        } else {
            for (let i = 0; i < numberOfImages; i++) {
                serverUrls.push(undefined);
            }
        }
        console.log(`🚀 [Multi-Server] Randomly distributing ${numberOfImages} image generation requests across ${availableServers.length} servers`);
    }
    
    const promises = [];
    for (let i = 0; i < numberOfImages; i++) {
        promises.push(new Promise<void>(resolve => {
            setTimeout(async () => {
                await generateOneImage(i, serverUrls[i]);
                resolve();
            }, i * 500);
        }));
    }

    await Promise.all(promises);

    setIsLoading(false);
    setStatusMessage('');
  }, [numberOfImages, prompt, generateOneImage, aspectRatio, currentUser.recaptchaToken]);
  
  const handleRetry = useCallback(async (index: number) => {
    setImages(prev => {
        const newImages = [...prev];
        newImages[index] = null;
        return newImages;
    });
    await generateOneImage(index);
  }, [generateOneImage]);

  const handleLocalReEdit = async (imageUrl: string) => {
    // Convert URL to base64 for re-edit
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64String = reader.result.split(',')[1];
          const mimeType = blob.type || 'image/png';
          onReEdit({ base64: base64String, mimeType });
        }
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Failed to convert image for re-edit:', error);
      alert('Failed to load image for re-edit');
    }
  };

  const handleReset = useCallback(() => {
    setPrompt('');
    setImages([]);
    setError(null);
    setReferenceImages([]);
    setNumberOfImages(1);
    setSelectedImageIndex(0);
    if(fileInputRef.current) fileInputRef.current.value = '';
    setProgress(0);
    setStatusMessage('');
    setAspectRatio('9:16');
    setCreativeState(getInitialCreativeDirectionState());
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const leftPanel = (
    <>
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">AI NanoBanana Pro</h1>
        <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mt-1">Create stunning images using Google's GEM_PIX_2 model.</p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Reference Images (up to 4)</label>
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 min-h-[116px]">
              <div className="flex items-center gap-3 flex-wrap">
                  {referenceImages.map(img => (
                      <div key={img.id} className="relative w-20 h-20">
                          <img src={img.previewUrl} alt="upload preview" className="w-full h-full object-cover rounded-md"/>
                          <button onClick={() => removeImage(img.id)} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 text-white hover:bg-red-600 transition-colors">
                              <TrashIcon className="w-3 h-3"/>
                          </button>
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
                  <p className="text-xs text-primary-600 dark:text-primary-400 mt-2 p-2 bg-primary-500/10 rounded-md" dangerouslySetInnerHTML={{ __html: 'You are in <strong>Image Editing Mode</strong>. The prompt will be used as instructions to edit the source image.' }}/>
              ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Upload an image to edit it or combine it with your prompt.</p>
              )}
          </div>
      </div>

      <div>
        <label htmlFor="prompt" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Prompt</label>
        <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., 3 people climbing Mount Kinabalu" rows={4} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:outline-none transition" />
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

      {/* Personal Anti-Captcha Key Form - Required for NANOBANANA PRO (MONOKLIX only) */}
      {showPersonalKeyForm && BRAND_CONFIG.name !== 'ESAIE' && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <InformationCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-blue-800 dark:text-blue-200 mb-2">
                Personal Anti-Captcha API Key Required
              </h3>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                NANOBANANA PRO requires your <strong>personal</strong> Anti-Captcha API key. 
                This key must be different from the master key. You can get your personal key from{' '}
                <a href="https://anti-captcha.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                  anti-captcha.com
                </a>
                {currentUser.recaptchaToken && currentUser.recaptchaToken.trim() && (
                  <span className="block mt-1 font-semibold">Current key: ...{currentUser.recaptchaToken.slice(-6)}</span>
                )}
              </p>
              
              {/* Show error message if exists */}
              {error && error.includes('master') && (
                <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangleIcon className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-300 font-semibold">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={showPersonalKey ? 'text' : 'password'}
                    value={personalKeyInput}
                    onChange={(e) => {
                      setPersonalKeyInput(e.target.value);
                      setError(null); // Clear error when user types
                    }}
                    placeholder={currentUser.recaptchaToken ? "Update your Anti-Captcha API key" : "Enter your Anti-Captcha API key"}
                    className={`w-full px-4 py-2 pr-10 bg-white dark:bg-neutral-800 border ${
                      error && error.includes('master') 
                        ? 'border-red-300 dark:border-red-700' 
                        : 'border-blue-300 dark:border-blue-700'
                    } rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPersonalKey(!showPersonalKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                  >
                    {showPersonalKey ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSavePersonalKey}
                    disabled={isSavingPersonalKey || !personalKeyInput.trim()}
                    className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSavingPersonalKey ? (
                      <>
                        <Spinner />
                        Saving...
                      </>
                    ) : saveKeyStatus === 'success' ? (
                      <>
                        <CheckCircleIcon className="w-4 h-4" />
                        Saved!
                      </>
                    ) : (
                      'Save Key'
                    )}
                  </button>
                  {currentUser.recaptchaToken && currentUser.recaptchaToken.trim() && (
                    <button
                      onClick={() => {
                        setShowPersonalKeyForm(false);
                        setPersonalKeyInput('');
                        setSaveKeyStatus('idle');
                        setError(null);
                      }}
                      className="px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-sm font-semibold rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {saveKeyStatus === 'error' && error && !error.includes('master') && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pt-4 mt-auto">
        <div className="flex gap-4">
          <button onClick={handleGenerate} disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isLoading ? <Spinner /> : 'Generate Image'}
          </button>
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="flex-shrink-0 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-3 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50"
          >
            Reset
          </button>
        </div>
        {error && !isLoading && !error.includes('master') && <p className="text-red-500 dark:text-red-400 mt-2 text-center">{error}</p>}
      </div>
    </>
  );

  // Download with size selection - request from Google server
  const downloadImageWithSize = async (imageUrl: string, imageBase64: string, size: '1K' | '2K' | '4K' = '1K') => {
    if (size === '1K') {
      // Download original 1K image (from base64 we already have)
      downloadImage(imageBase64, `${BRAND_CONFIG.shortName.toLowerCase()}-nanobanana2-1K-${Date.now()}.png`);
    } else {
      // For 2K/4K, regenerate image from server with imageSize parameter
      if (!lastGenerationParams) {
        alert('Unable to regenerate: Original generation parameters not available.');
        return;
      }

      try {
        setStatusMessage(`Regenerating image at ${size} resolution from server...`);
        setShowSizeModal(false);
        
        // Get current user token and server
        const sharedToken = currentUser.personalAuthToken || undefined;
        const selectedServer = sessionStorage.getItem('selectedProxyServer');
        const sharedServerUrl = selectedServer || undefined;

        // Upload reference images again if needed
        let referenceImageMediaIds: string[] = [];
        if (lastGenerationParams.referenceImageMediaIds && lastGenerationParams.referenceImageMediaIds.length > 0) {
          referenceImageMediaIds = lastGenerationParams.referenceImageMediaIds;
        } else if (referenceImages.length > 0) {
          // Re-upload reference images if we have them
          const { uploadImageForNanoBanana } = await import('../../../services/imagenV3Service');
          const { cropImageToAspectRatio } = await import('../../../services/imageService');
          
          for (let i = 0; i < referenceImages.length; i++) {
            const img = referenceImages[i];
            let processedBase64 = img.base64;
            try {
              processedBase64 = await cropImageToAspectRatio(img.base64, lastGenerationParams.aspectRatio);
            } catch (cropError) {
              console.warn(`Failed to crop reference image ${i + 1}, using original`, cropError);
            }
            
            const uploadResult = await uploadImageForNanoBanana(
              processedBase64,
              img.mimeType,
              sharedToken,
              undefined,
              sharedServerUrl
            );
            referenceImageMediaIds.push(uploadResult.mediaId);
          }
        }

        // Regenerate with imageSize parameter
        const creativeDetails = Object.entries(lastGenerationParams.creativeState)
          .filter(([key, value]) => key !== 'creativityLevel' && value !== 'Random' && value !== 'None')
          .map(([, value]) => value)
          .join(', ');
        
        const fullPrompt = [lastGenerationParams.prompt, creativeDetails].filter(Boolean).join(', ');

        const result = await generateImageWithNanobanana2({
          prompt: fullPrompt,
          config: {
            aspectRatio: mapAspectRatio(lastGenerationParams.aspectRatio),
            sampleCount: 1,
            imageSize: size, // Request specific size from server
            referenceImageMediaIds: referenceImageMediaIds.length > 0 ? referenceImageMediaIds : undefined,
            authToken: sharedToken,
            serverUrl: sharedServerUrl
          }
        }, (status) => {
          setStatusMessage(status);
        });

        // Get the new image URL
        const newImageUrls = result.images.map(img => img.image.generatedImage.fifeUrl);
        if (newImageUrls.length === 0) {
          throw new Error("The AI did not return an image.");
        }

        const newImageUrl = newImageUrls[0];
        
        // Convert to base64 for download
        const newImageBase64 = await convertUrlToBase64(newImageUrl);
        
        // Download the new image
        downloadImage(newImageBase64, `${BRAND_CONFIG.shortName.toLowerCase()}-nanobanana2-${size}-${Date.now()}.png`);
        
        setStatusMessage('');
      } catch (error) {
        console.error(`Failed to regenerate ${size} image:`, error);
        const userFriendlyMessage = handleApiError(error);
        alert(`Failed to regenerate ${size} image: ${userFriendlyMessage}`);
        setStatusMessage('');
      }
    }
  };

  const handleDownloadClick = (imageUrl: string, imageBase64: string, mediaGenerationId?: string) => {
    if (!imageBase64) {
      alert('Image not ready for download. Please wait for conversion to complete.');
      return;
    }
    setSelectedImageForDownload({ url: imageUrl, base64: imageBase64, mediaGenerationId });
    setShowSizeModal(true);
  };

  const ActionButtons: React.FC<{ imageUrl: string; imageBase64: string; mediaGenerationId?: string }> = ({ imageUrl, imageBase64, mediaGenerationId }) => {
    if (!imageBase64) {
      // No base64 available - can't download
      return (
        <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button onClick={() => handleLocalReEdit(imageUrl)} title="Re-edit" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors">
            <WandIcon className="w-4 h-4" />
          </button>
        </div>
      );
    }
    
    return (
      <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <button onClick={() => handleLocalReEdit(imageUrl)} title="Re-edit" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors">
          <WandIcon className="w-4 h-4" />
        </button>
        <button onClick={() => onCreateVideo({ prompt, image: { base64: imageBase64, mimeType: 'image/png' } })} title="Create Video" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors">
          <VideoIcon className="w-4 h-4" />
        </button>
        <button onClick={() => handleDownloadClick(imageUrl, imageBase64, mediaGenerationId)} title="Download" className="flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors">
          <DownloadIcon className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const rightPanel = (
    <>
      {images.length > 0 ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
            <div className="flex-1 flex items-center justify-center min-h-0 w-full relative group">
                {(() => {
                    const selectedImage = images[selectedImageIndex];
                    if (selectedImage && typeof selectedImage === 'object' && 'url' in selectedImage && 'base64' in selectedImage) {
                        return (
                            <>
                                <img src={selectedImage.url} alt={`Generated image ${selectedImageIndex + 1}`} className="rounded-md max-h-full max-w-full object-contain" onError={() => {
                                  setImages(prev => {
                                    const newImages = [...prev];
                                    newImages[selectedImageIndex] = { error: 'Failed to load image' };
                                    return newImages;
                                  });
                                }} />
                                <ActionButtons imageUrl={selectedImage.url} imageBase64={selectedImage.base64} mediaGenerationId={selectedImage.mediaGenerationId} />
                            </>
                        );
                    } else if (typeof selectedImage === 'string') {
                        // Fallback for old format (URL only)
                        return (
                            <>
                                <img src={selectedImage} alt={`Generated image ${selectedImageIndex + 1}`} className="rounded-md max-h-full max-w-full object-contain" onError={() => {
                                  setImages(prev => {
                                    const newImages = [...prev];
                                    newImages[selectedImageIndex] = { error: 'Failed to load image' };
                                    return newImages;
                                  });
                                }} />
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
                        {img && typeof img === 'object' && 'url' in img && 'base64' in img ? (
                            <img src={img.url} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                        ) : typeof img === 'string' ? (
                            <img src={img} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
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

  return (
    <>
      {/* Google Update Notification Modal - MONOKLIX Only (Controlled by feature flag) */}
      {BRAND_CONFIG.name === 'MONOKLIX' && (BRAND_CONFIG.featureFlags?.showNanobananaBlockingModal ?? false) && isBlocked && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-zoomIn" aria-modal="true" role="dialog">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 border-[0.5px] border-neutral-200/80 dark:border-neutral-800/80" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center mb-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50 mb-4">
                <AlertTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-red-800 dark:text-red-300 mb-3">
                ⚠️ GOOGLE UPDATE TERKINI - NANOBANANA PRO TIDAK DAPAT DIGUNAKAN BUAT MASA SEKARANG.
              </h3>
              <div className="text-sm text-neutral-700 dark:text-neutral-300 space-y-3 w-full text-left">
                <p>
                  Google telah melakukan update terkini. Sistem telah menyemak IP address anda dan mendapati bahawa pengguna MONOKLIX telah di-block buat masa sekarang.
                </p>
                <p className="font-semibold text-red-700 dark:text-red-400">
                  💡 <strong>Penyelesaian:</strong> Jika anda ingin menggunakan NANOBANANA PRO, sila login menggunakan akaun flow anda.
                </p>
                {userIP && (
                  <p className="text-xs mt-2 opacity-75 bg-neutral-100 dark:bg-neutral-800 p-2 rounded">
                    IP Address anda: <code className="bg-white dark:bg-neutral-900 px-1 rounded">{userIP}</code>
                  </p>
                )}
                <p className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700 text-center font-medium text-neutral-600 dark:text-neutral-400">
                  Sila tunggu update terkini dari pihak kami. Terima kasih.
                </p>
              </div>
            </div>
            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => window.open('https://labs.google/fx/tools/flow', '_blank')}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-green-600 dark:bg-green-700 text-white font-semibold rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors"
              >
                <KeyIcon className="w-4 h-4" />
                Login Google Flow
              </button>
              <button
                onClick={() => setIsBlocked(false)}
                className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
              >
                Faham
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <TwoColumnLayout leftPanel={leftPanel} rightPanel={rightPanel} language={language} />
      
      {/* Size Selection Modal */}
      {showSizeModal && selectedImageForDownload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowSizeModal(false); setSelectedImageForDownload(null); }}>
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-neutral-100">Select Download Size</h3>
            <div className="space-y-2">
              <button 
                onClick={async () => { 
                  await downloadImageWithSize(selectedImageForDownload.url, selectedImageForDownload.base64, '1K'); 
                  setShowSizeModal(false); 
                  setSelectedImageForDownload(null);
                }}
                className="w-full flex items-center gap-3 p-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors text-left"
              >
                <DownloadIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
                <span className="text-neutral-900 dark:text-neutral-100">Download 1K (Original)</span>
              </button>
              <button 
                onClick={async () => { 
                  await downloadImageWithSize(selectedImageForDownload.url, selectedImageForDownload.base64, '2K'); 
                  setShowSizeModal(false); 
                  setSelectedImageForDownload(null);
                }}
                className="w-full flex items-center gap-3 p-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors text-left"
              >
                <span className="w-5 h-5 flex items-center justify-center font-bold text-xs text-neutral-600 dark:text-neutral-300">2K</span>
                <span className="text-neutral-900 dark:text-neutral-100">Download 2K (From Server)</span>
              </button>
              <button 
                onClick={async () => { 
                  await downloadImageWithSize(selectedImageForDownload.url, selectedImageForDownload.base64, '4K'); 
                  setShowSizeModal(false); 
                  setSelectedImageForDownload(null);
                }}
                className="w-full flex items-center gap-3 p-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors text-left"
              >
                <span className="w-5 h-5 flex items-center justify-center font-bold text-xs text-neutral-600 dark:text-neutral-300">4K</span>
                <span className="text-neutral-900 dark:text-neutral-100">Download 4K (From Server)</span>
              </button>
            </div>
            <button 
              onClick={() => { setShowSizeModal(false); setSelectedImageForDownload(null); }}
              className="mt-4 w-full p-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors text-neutral-900 dark:text-neutral-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Nanobanana2GenerationView;

