
/**
 * Crop image to target aspect ratio (9:16, 16:9, 1:1)
 * Uses center crop to maintain focus on main subject.
 * Also resizes the image to a safe maximum dimension to prevent memory crashes on mobile.
 */
export const cropImageToAspectRatio = async (
  imageBase64: string,
  targetAspectRatio: '9:16' | '16:9' | '1:1'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      const width = img.width;
      const height = img.height;
      let cropX = 0;
      let cropY = 0;
      let cropWidth = width;
      let cropHeight = height;

      // 1. Calculate Crop Dimensions
      let targetRatio = 1;
      switch (targetAspectRatio) {
          case '16:9': targetRatio = 16 / 9; break;
          case '9:16': targetRatio = 9 / 16; break;
          case '1:1': default: targetRatio = 1; break;
      }

      const imgRatio = width / height;
      let didCrop = false;

      // Only crop if aspect ratio difference is significant (> 1%)
      if (Math.abs(imgRatio - targetRatio) > 0.01) {
        didCrop = true;
        if (imgRatio > targetRatio) {
          // Image is wider than target, crop width (center crop horizontally)
          cropHeight = height;
          cropWidth = Math.round(cropHeight * targetRatio);
          cropX = Math.round((width - cropWidth) / 2);
          cropY = 0;
        } else {
          // Image is taller than target, crop height (center crop vertically)
          cropWidth = width;
          cropHeight = Math.round(cropWidth / targetRatio);
          cropX = 0;
          cropY = Math.round((height - cropHeight) / 2);
        }
      }

      // 2. Calculate Scale Factor for Safe Mobile Usage
      // Mobile browsers often crash with canvases larger than 4096px or high memory usage.
      // 1536px is optimal for AI models (Imagen/Veo) without losing perceptible quality.
      const MAX_DIMENSION = 1536;
      let finalWidth = cropWidth;
      let finalHeight = cropHeight;
      let didResize = false;

      if (cropWidth > MAX_DIMENSION || cropHeight > MAX_DIMENSION) {
          const scale = Math.min(MAX_DIMENSION / cropWidth, MAX_DIMENSION / cropHeight);
          finalWidth = Math.round(cropWidth * scale);
          finalHeight = Math.round(cropHeight * scale);
          didResize = true;
      }

      // Set canvas size to final (possibly resized) dimensions
      canvas.width = finalWidth;
      canvas.height = finalHeight;

      // Fill with white background (safe fallback for transparency)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, finalWidth, finalHeight);

      // Draw cropped AND scaled image
      // drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, finalWidth, finalHeight);

      // Convert to PNG
      const pngDataUrl = canvas.toDataURL('image/png');

      // Extract base64 (remove data:image/png;base64, prefix)
      const base64 = pngDataUrl.split(',')[1];

      // Build log message
      const actions = [];
      if (didCrop) actions.push(`Cropped to ${targetAspectRatio}`);
      if (didResize) actions.push(`Resized to ${finalWidth}x${finalHeight}`);
      
      if (actions.length > 0) {
        console.log(`Image processed: ${width}x${height} -> ${finalWidth}x${finalHeight} (${actions.join(', ')})`);
      } else {
        console.log(`Image processed: ${width}x${height} (No changes needed)`);
      }
      
      resolve(base64);
    };

    img.onerror = () => reject(new Error('Failed to load image for processing'));

    // Handle both raw base64 and data URL formats
    img.src = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;
  });
};

/** Output format for crop+resize (used when caller needs mimeType, e.g. for upload). */
export type CropOutputFormat = 'png' | 'jpeg';

const DEFAULT_JPEG_QUALITY = 0.88;

/**
 * Crop image to target aspect ratio and optionally output as JPEG (smaller payload for mobile/upload).
 * Returns base64 + mimeType so upload requests send the correct Content-Type.
 * Use this for VEO/image upload to reduce "Load failed" on mobile.
 */
export const cropImageToAspectRatioWithFormat = async (
  imageBase64: string,
  targetAspectRatio: '9:16' | '16:9' | '1:1',
  format: CropOutputFormat = 'png',
  jpegQuality: number = DEFAULT_JPEG_QUALITY
): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      const width = img.width;
      const height = img.height;
      let cropX = 0;
      let cropY = 0;
      let cropWidth = width;
      let cropHeight = height;

      let targetRatio = 1;
      switch (targetAspectRatio) {
        case '16:9': targetRatio = 16 / 9; break;
        case '9:16': targetRatio = 9 / 16; break;
        case '1:1':
        default: targetRatio = 1; break;
      }

      const imgRatio = width / height;
      if (Math.abs(imgRatio - targetRatio) > 0.01) {
        if (imgRatio > targetRatio) {
          cropHeight = height;
          cropWidth = Math.round(cropHeight * targetRatio);
          cropX = Math.round((width - cropWidth) / 2);
          cropY = 0;
        } else {
          cropWidth = width;
          cropHeight = Math.round(cropWidth / targetRatio);
          cropX = 0;
          cropY = Math.round((height - cropHeight) / 2);
        }
      }

      const MAX_DIMENSION = 1536;
      let finalWidth = cropWidth;
      let finalHeight = cropHeight;
      if (cropWidth > MAX_DIMENSION || cropHeight > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / cropWidth, MAX_DIMENSION / cropHeight);
        finalWidth = Math.round(cropWidth * scale);
        finalHeight = Math.round(cropHeight * scale);
      }

      canvas.width = finalWidth;
      canvas.height = finalHeight;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, finalWidth, finalHeight);
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, finalWidth, finalHeight);

      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const dataUrl = format === 'jpeg'
        ? canvas.toDataURL('image/jpeg', Math.min(1, Math.max(0, jpegQuality)))
        : canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mimeType });
    };

    img.onerror = () => reject(new Error('Failed to load image for processing'));
    img.src = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;
  });
};