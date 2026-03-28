
import React, { useState, useCallback, useEffect } from 'react';
import ImageUpload from '../../common/ImageUpload';
import { type MultimodalContent } from '../../../services/geminiService';
import { addHistoryItem } from '../../../services/historyService';
import Spinner from '../../common/Spinner';
import { DownloadIcon, VideoIcon, WandIcon, AlertTriangleIcon, RefreshCwIcon, UserIcon, CameraIcon, UsersIcon, XIcon } from '../../Icons';
import { getAnglePhotosPrompt } from '../../../services/promptManager';
import { type User, type Language } from '../../../types';
import { incrementImageUsage } from '../../../services/userService';
import { handleApiError } from '../../../services/errorHandler';
import { getTranslations } from '../../../services/translations';
import TwoColumnLayout from '../../common/TwoColumnLayout';
import CreativeDirectionPanel from '../../common/CreativeDirectionPanel';
import { getInitialCreativeDirectionState, type CreativeDirectionState, cameraOptions, poseOptions } from '../../../services/creativeDirectionService';
import { UI_SERVER_LIST } from '../../../services/serverConfig';
import { BRAND_CONFIG } from '../../../services/brandConfig';

const modelFaceOptions = ["Random", "Malaysian", "Vietnamese", "English", "American", "Arabic", "Russian", "Japanese", "Korean", "Thai"];
const SESSION_KEY = 'anglePhotosState';

type ImageSlot = string | { error: string } | null;

const downloadImage = (data: string, fileNameBase: string) => {
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

interface AnglePhotosViewProps {
  onReEdit: (preset: ImageEditPreset) => void;
  onCreateVideo: (preset: VideoGenPreset) => void;
  language: Language;
  currentUser: User;
  onUserUpdate: (user: User) => void;
}

const AnglePhotosView: React.FC<AnglePhotosViewProps> = ({ onReEdit, onCreateVideo, language, currentUser, onUserUpdate }) => {
    const [productImage, setProductImage] = useState<MultimodalContent | null>(null);
    const [faceImage, setFaceImage] = useState<MultimodalContent | null>(null);
    const [images, setImages] = useState<ImageSlot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);

    const [gender, setGender] = useState('Female');
    const [modelFace, setModelFace] = useState('Random');
    const [creativeState, setCreativeState] = useState<CreativeDirectionState>(getInitialCreativeDirectionState());
    
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9'>('9:16');
    const [productImageUploadKey, setProductImageUploadKey] = useState(Date.now());
    const [faceImageUploadKey, setFaceImageUploadKey] = useState(Date.now() + 1);
    const [progress, setProgress] = useState(0);
    
    const T = getTranslations().anglePhotosView;
    const commonT = getTranslations().common;

    useEffect(() => {
        try {
            const savedState = sessionStorage.getItem(SESSION_KEY);
            if (savedState) {
                const state = JSON.parse(savedState);
                if (state.gender) setGender(state.gender);
                if (state.modelFace) setModelFace(state.modelFace);
                if (state.creativeState) setCreativeState(state.creativeState);
                if (state.aspectRatio) setAspectRatio(state.aspectRatio);
            }
        } catch (e) { console.error("Failed to load state from session storage", e); }
    }, []);

    useEffect(() => {
        try {
            const stateToSave = { gender, modelFace, creativeState, aspectRatio };
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(stateToSave));
        } catch (e: any) {
            if (e.name !== 'QuotaExceededError' && e.code !== 22) {
                console.error("Failed to save state to session storage", e);
            }
        }
    }, [gender, modelFace, creativeState, aspectRatio]);

    const getRandomOption = (options: string[]) => {
        const filtered = options.filter(o => o !== 'Random' && o !== 'None');
        return filtered[Math.floor(Math.random() * filtered.length)];
    };

    const generateOneImageWithMediaId = useCallback(async (
        index: number,
        serverUrl: string | undefined,
        productMediaId: string | null,
        faceMediaId: string | null,
        authToken: string | undefined,
        mediaServerUrl: string | undefined,
        randomCamera: string,
        randomPose: string
    ) => {
        if (!productMediaId && !faceMediaId) return;
    
        try {
            const prompt = getAnglePhotosPrompt({
                gender,
                modelFace,
                hasFaceImage: !!faceMediaId,
                hasProductImage: !!productMediaId,
                camera: randomCamera,
                pose: randomPose,
                creativeDirection: creativeState
            });

            const recipeMediaInputs: any[] = [];

            if (productMediaId) {
                recipeMediaInputs.push({
                    caption: 'product',
                    mediaInput: {
                        mediaCategory: 'MEDIA_CATEGORY_SUBJECT',
                        mediaGenerationId: productMediaId
                    }
                });
            }

            if (faceMediaId) {
                recipeMediaInputs.push({
                    caption: 'model face',
                    mediaInput: {
                        mediaCategory: 'MEDIA_CATEGORY_SUBJECT',
                        mediaGenerationId: faceMediaId
                    }
                });
            }

            const { runImageRecipe } = await import('../../../services/imagenV3Service');
            const result = await runImageRecipe({
                userInstruction: prompt,
                recipeMediaInputs,
                config: {
                    aspectRatio,
                    authToken: authToken,
                    serverUrl: serverUrl || mediaServerUrl
                }
            });
            
            const imageBase64 = result.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;
            
            if (!imageBase64) {
                throw new Error("The AI did not return an image.");
            }
            
            await addHistoryItem({ 
                type: 'Image', 
                prompt: `Angle Photo: Camera - ${randomCamera}, Pose - ${randomPose}`, 
                result: imageBase64 
            });
    
            const updateResult = await incrementImageUsage(currentUser);
            if (updateResult.success && updateResult.user) {
                onUserUpdate(updateResult.user);
            }

            setImages(prev => {
                const newImages = [...prev];
                newImages[index] = imageBase64;
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
    }, [gender, modelFace, creativeState, aspectRatio, currentUser, onUserUpdate]);

    const handleGenerate = useCallback(async () => {
        if (!productImage && !faceImage) {
            setError("Please upload at least one image (product photo or model face).");
            return;
        }
        setIsLoading(true);
        setError(null);
        setImages(Array(4).fill(null));
        setSelectedImageIndex(0);
        setProgress(0);

        let sharedProductMediaId: string | null = null;
        let sharedFaceMediaId: string | null = null;
        let sharedToken: string | undefined;
        let sharedServerUrl: string | undefined;
        
        try {
            const { uploadImageForNanoBanana } = await import('../../../services/imagenV3Service');
            const { cropImageToAspectRatio } = await import('../../../services/imageService');
            
            // Upload product image if available
            if (productImage) {
                let processedBase64 = productImage.base64;
                try {
                    processedBase64 = await cropImageToAspectRatio(productImage.base64, aspectRatio);
                } catch (cropError) {
                    console.warn('Failed to process product image', cropError);
                }
                
                const productUploadResult = await uploadImageForNanoBanana(processedBase64, productImage.mimeType);
                sharedProductMediaId = productUploadResult.mediaId;
                sharedToken = productUploadResult.successfulToken;
                sharedServerUrl = productUploadResult.successfulServerUrl;
            }
            
            // Upload face image if available
            if (faceImage) {
                let processedFaceBase64 = faceImage.base64;
                try {
                    processedFaceBase64 = await cropImageToAspectRatio(faceImage.base64, aspectRatio);
                } catch (cropError) {
                    console.warn('Failed to process face image', cropError);
                }
                
                const faceUploadResult = await uploadImageForNanoBanana(
                    processedFaceBase64, 
                    faceImage.mimeType, 
                    sharedToken, 
                    undefined, 
                    sharedServerUrl || undefined
                );
                sharedFaceMediaId = faceUploadResult.mediaId;
                
                // If no product image, use face upload's token/server
                if (!sharedToken) {
                    sharedToken = faceUploadResult.successfulToken;
                    sharedServerUrl = faceUploadResult.successfulServerUrl;
                }
            }
        } catch (uploadError) {
            console.error('Failed to upload shared images:', uploadError);
            setIsLoading(false);
            setError("Failed to upload reference assets.");
            return;
        }

        const selectedServer = sessionStorage.getItem('selectedProxyServer');
        const isLocalhost = selectedServer?.includes('localhost');
        const availableServers = UI_SERVER_LIST.map(s => s.url).filter(url => !url.includes('localhost'));
        
        // Angle Photos always generates 4 images, so we random distribute for load balancing
        // Exception: If localhost is selected, use localhost for all requests
        const promises = [];
        for (let i = 0; i < 4; i++) {
            const serverUrl = isLocalhost 
                ? selectedServer 
                : (availableServers.length > 0 
                    ? availableServers[Math.floor(Math.random() * availableServers.length)] 
                    : undefined);
            const randomCamera = getRandomOption(cameraOptions);
            const randomPose = getRandomOption(poseOptions);
            
            promises.push(new Promise<void>(resolve => {
                setTimeout(async () => {
                    await generateOneImageWithMediaId(i, serverUrl, sharedProductMediaId, sharedFaceMediaId, sharedToken, sharedServerUrl, randomCamera, randomPose);
                    resolve();
                }, i * 500);
            }));
        }

        await Promise.all(promises);
        setIsLoading(false);
    }, [productImage, faceImage, aspectRatio, generateOneImageWithMediaId]);
    
    const handleReset = useCallback(() => {
        setProductImage(null);
        setFaceImage(null);
        setImages([]);
        setError(null);
        setGender('Female');
        setModelFace('Random');
        setCreativeState(getInitialCreativeDirectionState());
        setAspectRatio('9:16');
        setProductImageUploadKey(Date.now());
        setFaceImageUploadKey(Date.now() + 1);
        setProgress(0);
        sessionStorage.removeItem(SESSION_KEY);
    }, []);

    const leftPanel = (
      <>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">{T.title}</h1>
            <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mt-1">{T.subtitle}</p>
          </div>
          
          <div className="space-y-4">
              <h2 className="text-lg font-semibold">Step 1: Upload Assets</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ImageUpload key={productImageUploadKey} id="angle-product-upload" onImageUpload={(base64, mimeType) => setProductImage({base64, mimeType})} onRemove={() => setProductImage(null)} title="Product Photo (Optional)" language={language}/>
                  <ImageUpload key={faceImageUploadKey} id="angle-face-upload" onImageUpload={(base64, mimeType) => setFaceImage({base64, mimeType})} onRemove={() => setFaceImage(null)} title="Model Face (Optional)" language={language}/>
              </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Step 2: Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Gender</label>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setGender('Female')} className={`p-2 rounded-lg border text-sm font-bold ${gender === 'Female' ? 'bg-primary-500 text-white' : 'bg-white dark:bg-neutral-800'}`}>Female</button>
                        <button onClick={() => setGender('Male')} className={`p-2 rounded-lg border text-sm font-bold ${gender === 'Male' ? 'bg-primary-500 text-white' : 'bg-white dark:bg-neutral-800'}`}>Male</button>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Ethnicity</label>
                    <select value={modelFace} onChange={e => setModelFace(e.target.value)} className="w-full bg-white dark:bg-neutral-800 border rounded-lg p-2 text-sm">
                        {modelFaceOptions.map(o => <option key={o}>{o}</option>)}
                    </select>
                </div>
            </div>
            <CreativeDirectionPanel
              state={creativeState}
              setState={setCreativeState}
              language={language}
              showPose={false}
              showAspectRatio={false}
            />
          </div>

           <div className="pt-4 mt-auto">
                <button onClick={handleGenerate} disabled={isLoading || (!productImage && !faceImage)} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-4 px-4 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-sm">
                    {isLoading ? <Spinner /> : T.generateButton}
                </button>
                <button onClick={handleReset} className="w-full mt-2 text-sm text-neutral-500 hover:underline">Reset All</button>
                {error && <p className="text-red-500 mt-2 text-center text-sm">{error}</p>}
          </div>
      </>
    );

    const rightPanel = (
      <>
          {images.length > 0 ? (
               <div className="w-full h-full flex flex-col gap-2 p-2">
                <div className="flex-1 flex items-center justify-center min-h-0 w-full relative group">
                    {(() => {
                        const selectedImage = images[selectedImageIndex];
                        if (typeof selectedImage === 'string') {
                            return (
                                <>
                                    <img src={`data:image/png;base64,${selectedImage}`} alt="Generated angle" className="rounded-md max-h-full max-w-full object-contain" />
                                    <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => onReEdit({ base64: selectedImage, mimeType: 'image/png' })} className="p-2 bg-black/60 text-white rounded-full"><WandIcon className="w-4 h-4"/></button>
                                        <button onClick={() => downloadImage(selectedImage, `${BRAND_CONFIG.shortName.toLowerCase()}-angle-${selectedImageIndex}`)} className="p-2 bg-black/60 text-white rounded-full"><DownloadIcon className="w-4 h-4"/></button>
                                    </div>
                                </>
                            );
                        } else if (selectedImage && typeof selectedImage === 'object') {
                            return <div className="text-center text-red-500"><AlertTriangleIcon className="w-12 h-12 mx-auto mb-2"/><p className="text-sm">{selectedImage.error}</p></div>;
                        }
                        return <div className="flex flex-col items-center"><Spinner /><p className="text-sm mt-2 text-neutral-500">Generating Slot {selectedImageIndex + 1}...</p></div>;
                    })()}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img, index) => (
                    <button key={index} onClick={() => setSelectedImageIndex(index)} className={`aspect-square rounded-md overflow-hidden border-2 transition-all ${selectedImageIndex === index ? 'border-primary-500 scale-105' : 'border-transparent'}`}>
                       {typeof img === 'string' ? (
                            <img src={`data:image/png;base64,${img}`} alt={`Thumb ${index + 1}`} className="w-full h-full object-cover" />
                        ) : <div className="w-full h-full bg-neutral-100 flex items-center justify-center">{img ? <XIcon className="w-4 h-4 text-red-400"/> : <Spinner/>}</div>}
                    </button>
                  ))}
                </div>
              </div>
          ) : isLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                    <Spinner />
                    <p className="text-sm text-neutral-500">{commonT.generating}</p>
                    <p className="text-xs text-neutral-400">Completed: {progress} / 4</p>
                </div>
           ) : (
              <div className="text-center text-neutral-500 dark:text-neutral-600"><CameraIcon className="w-16 h-16 mx-auto" /><p>{T.outputPlaceholder}</p></div>
          )}
      </>
    );

    return <TwoColumnLayout leftPanel={leftPanel} rightPanel={rightPanel} language={language} />;
};

export default AnglePhotosView;

