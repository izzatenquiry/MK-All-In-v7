
import { v4 as uuidv4 } from 'uuid';
import { executeProxiedRequest } from './apiClient';

export interface Nanobanana2Config {
  aspectRatio?: 'landscape' | 'portrait' | 'square';
  seed?: number;
  sampleCount?: number; // Number of images to generate (multiple requests)
  referenceImageMediaId?: string; // For image-to-image generation (single reference image)
  referenceImageMediaIds?: string[]; // For image-to-image with multiple reference images
  imageSize?: '1K' | '2K' | '4K'; // Image size for generation (if API supports it)
  authToken?: string;
  serverUrl?: string;
  /** Must match bridge unified session + reference uploads (defaults to new uuid). */
  projectId?: string;
  /** Same OAuth + reCAPTCHA from `prepareVeolyNanobanana2UnifiedSession(projectId)` after uploading refs — avoids a second Puppeteer run. */
  unifiedSession?: { oauthToken: string; recaptchaToken: string };
}

export interface Nanobanana2Request {
  prompt: string;
  config: Nanobanana2Config;
}

export interface Nanobanana2Image {
  name: string;
  workflowId: string;
  image: {
    generatedImage: {
      seed: number;
      mediaGenerationId: string;
      mediaVisibility: string;
      prompt: string;
      modelNameType: string;
      workflowId: string;
      fifeUrl: string; // Signed Google Cloud Storage URL - can be used directly
      aspectRatio: string;
      requestData: {
        promptInputs: Array<{ textInput: string }>;
        imageGenerationRequestData: {
          imageGenerationImageInputs?: Array<{
            mediaGenerationId: string;
            imageInputType: string;
          }>;
        };
      };
    };
    dimensions: {
      width: number;
      height: number;
    };
  };
}

export interface Nanobanana2Response {
  media: Nanobanana2Image[];
  workflows: Array<{
    name: string;
    metadata: {
      createTime: string;
      primaryMediaId: string;
    };
    projectId: string;
  }>;
}

// Helper to map aspect ratio to API enum
const getAspectRatioEnum = (aspectRatio: 'landscape' | 'portrait' | 'square' = 'landscape'): string => {
  switch (aspectRatio) {
    case 'landscape':
      return 'IMAGE_ASPECT_RATIO_LANDSCAPE';
    case 'portrait':
      return 'IMAGE_ASPECT_RATIO_PORTRAIT';
    case 'square':
      return 'IMAGE_ASPECT_RATIO_SQUARE';
    default:
      return 'IMAGE_ASPECT_RATIO_LANDSCAPE';
  }
};

// Helper to map from Imagen aspect ratio format to NANOBANANA 2 format
export const mapAspectRatio = (imagenAspectRatio: '1:1' | '9:16' | '16:9'): 'landscape' | 'portrait' | 'square' => {
  switch (imagenAspectRatio) {
    case '16:9':
      return 'landscape';
    case '9:16':
      return 'portrait';
    case '1:1':
      return 'square';
    default:
      return 'landscape';
  }
};

/**
 * Generate image(s) using NANOBANANA 2 (GEM_PIX_2 model)
 * Supports both text-to-image and image-to-image generation
 * Returns array of generated images with signed Google Cloud Storage URLs
 */
export const generateImageWithNanobanana2 = async (
  request: Nanobanana2Request,
  onStatusUpdate?: (status: string) => void,
  isHealthCheck = false
): Promise<{ 
  images: Nanobanana2Image[];
  workflows: Nanobanana2Response['workflows'];
  data: Nanobanana2Response; 
  successfulToken: string; 
  successfulServerUrl: string;
  isImageToImage: boolean;
}> => {
  const { prompt, config } = request;
  
  // Determine if this is image-to-image generation
  const isImageToImage = !!(config.referenceImageMediaId || (config.referenceImageMediaIds && config.referenceImageMediaIds.length > 0));
  
  console.log(`[NANOBANANA 2 Service] 🍌 Preparing ${isImageToImage ? 'image-to-image' : 'text-to-image'} generation request...`);

  const sessionId = `;${Date.now()}`;
  const projectId = config.projectId?.trim() || uuidv4();
  const aspectRatioEnum = getAspectRatioEnum(config.aspectRatio);
  const sampleCount = config.sampleCount || 1; // Default to 1 image

  // Build imageInputs array for image-to-image
  // Based on HAR file analysis, the correct field name is "name", not "mediaGenerationId" or "mediaId"
  // Structure: { name: "mediaId", imageInputType: "IMAGE_INPUT_TYPE_REFERENCE" }
  const imageInputs: Array<{ name: string; imageInputType: string }> = [];
  if (config.referenceImageMediaId) {
    // Single reference image
    imageInputs.push({
      name: config.referenceImageMediaId,
      imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE'
    });
  } else if (config.referenceImageMediaIds && config.referenceImageMediaIds.length > 0) {
    // Multiple reference images
    config.referenceImageMediaIds.forEach(mediaId => {
      imageInputs.push({
        name: mediaId,
        imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE'
      });
    });
  }

  // Build requests array - can generate multiple images with different seeds
  const requests = [];
  for (let i = 0; i < sampleCount; i++) {
    const seed = config.seed || Math.floor(Math.random() * 2147483647);
    const requestObj: any = {
      clientContext: {
        // recaptchaToken will be injected by executeProxiedRequest in top level clientContext only
        sessionId: sessionId,
        projectId: projectId,
        tool: 'PINHOLE'
      },
      seed: seed,
      imageModelName: 'GEM_PIX_2',
      imageAspectRatio: aspectRatioEnum,
      prompt: prompt
    };
    
    // Add imageSize if specified (for 2K/4K generation - if API supports it)
    if (config.imageSize) {
      requestObj.imageSize = config.imageSize;
    }
    
    // Use imageInputs directly with "name" field (as per HAR file)
    requestObj.imageInputs = imageInputs.length > 0 ? imageInputs : [];
    
    requests.push(requestObj);
  }

  // Build request body
  // ✅ CRITICAL: Top-level clientContext MUST include projectId and tool (matching HAR file)
  const requestBody = {
    clientContext: {
      // recaptchaContext will be injected by executeProxiedRequest (new format)
      sessionId: sessionId,
      projectId: projectId,  // ✅ Required in top-level clientContext for NANOBANANA 2
      tool: 'PINHOLE'        // ✅ Required in top-level clientContext for NANOBANANA 2
    },
    requests: requests
  };

  const logContext = isHealthCheck 
    ? `NANOBANANA 2 ${isImageToImage ? 'I2I' : 'T2I'} HEALTH CHECK`
    : `NANOBANANA 2 ${isImageToImage ? 'I2I' : 'T2I'} GENERATE`;

  try {
    onStatusUpdate?.(isImageToImage ? 'Sending image-to-image request...' : 'Sending text-to-image request...');
    
    const { data, successfulToken, successfulServerUrl } = await executeProxiedRequest(
      '/generate',
      'nanobanana2',
      requestBody,
      logContext,
      config.authToken,
      onStatusUpdate,
      config.serverUrl,
      config.unifiedSession
    );

    const response = data as Nanobanana2Response;
    const images = response.media || [];
    const workflows = response.workflows || [];

    console.log(`[NANOBANANA 2 Service] 🍌 Generation successful. Generated ${images.length} image(s) using token ...${successfulToken.slice(-6)}`);
    
    onStatusUpdate?.(`Generated ${images.length} image(s) successfully`);
    
    return { 
      images,
      workflows,
      data: response, 
      successfulToken, 
      successfulServerUrl,
      isImageToImage
    };
  } catch (error: any) {
    console.error('[NANOBANANA 2 Service] 🍌 Generation failed:', error);
    onStatusUpdate?.('Generation failed');
    throw error;
  }
};

/**
 * Extract image URLs from NANOBANANA 2 response
 * Returns array of signed Google Cloud Storage URLs that can be used directly
 */
export const extractImageUrlsFromNanobanana2 = (response: Nanobanana2Response): string[] => {
  return response.media.map(item => item.image.generatedImage.fifeUrl);
};

/**
 * Get image details from NANOBANANA 2 response
 * Returns array with image URL, dimensions, seed, and metadata
 */
export const getImageDetailsFromNanobanana2 = (response: Nanobanana2Response): Array<{
  url: string; // Signed Google Cloud Storage URL - ready to use
  mediaGenerationId: string;
  seed: number;
  prompt: string;
  dimensions: { width: number; height: number };
  workflowId: string;
  referenceImageMediaIds?: string[]; // For image-to-image, shows which images were used as reference
}> => {
  return response.media.map(item => {
    const referenceIds = item.image.generatedImage.requestData.imageGenerationRequestData?.imageGenerationImageInputs?.map(
      input => input.mediaGenerationId
    );
    
    return {
      url: item.image.generatedImage.fifeUrl,
      mediaGenerationId: item.image.generatedImage.mediaGenerationId,
      seed: item.image.generatedImage.seed,
      prompt: item.image.generatedImage.prompt,
      dimensions: item.image.dimensions,
      workflowId: item.workflowId,
      referenceImageMediaIds: referenceIds
    };
  });
};

