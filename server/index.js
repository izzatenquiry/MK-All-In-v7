import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import multer from 'multer';
import { createWriteStream, unlinkSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const execAsync = promisify(exec);

// Get FFmpeg path - use bundled version if available, fallback to system 'ffmpeg'
let ffmpegPath = 'ffmpeg'; // Default fallback
try {
  ffmpegPath = ffmpegInstaller.path;
  console.log(`✅ Using bundled FFmpeg: ${ffmpegPath}`);
} catch (e) {
  console.log('⚠️ Bundled FFmpeg not found, falling back to system FFmpeg');
  ffmpegPath = 'ffmpeg';
}

const app = express();
const PORT = process.env.PORT || 3001;
const VEO_API_BASE = 'https://aisandbox-pa.googleapis.com/v1';

// ===============================
// 📝 LOGGER
// ===============================
const log = (level, req, ...messages) => {
  const timestamp = new Date().toLocaleString('sv-SE', {
    timeZone: 'Asia/Kuala_Lumpur',
  });
  const username = req ? (req.headers['x-user-username'] || 'anonymous') : 'SYSTEM';
  const prefix = `[${timestamp}] [${username}]`;

  // Stringify objects for better readability
  const processedMessages = messages.map(msg => {
    if (typeof msg === 'object' && msg !== null) {
      try {
        // Truncate long base64 strings in logs
        const tempMsg = JSON.parse(JSON.stringify(msg));
        if (tempMsg?.imageInput?.rawImageBytes?.length > 100) {
            tempMsg.imageInput.rawImageBytes = tempMsg.imageInput.rawImageBytes.substring(0, 50) + '...[TRUNCATED]';
        }
        return JSON.stringify(tempMsg, null, 2);
      } catch (e) {
        return '[Unserializable Object]';
      }
    }
    return msg;
  });

  if (level === 'error') {
    console.error(prefix, ...processedMessages);
  } else {
    console.log(prefix, ...processedMessages);
  }
};


// A helper to safely parse JSON from a response
async function getJson(response, req) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        log('error', req, `❌ Upstream API response is not valid JSON. Status: ${response.status}`);
        log('error', req, `   Body: ${text}`);
        return { 
            error: 'Bad Gateway', 
            message: 'The API returned an invalid (non-JSON) response.', 
            details: text 
        };
    }
}

// Normalize latest FLOW/Labs payloads into legacy operations[] shape expected by frontend.
const normalizeVeoPayload = (data) => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data.operations) && data.operations.length > 0) return data;
  if (!Array.isArray(data.media)) return data;

  const normalizedOperations = data.media.map((m) => {
    const mediaStatus = m?.mediaMetadata?.mediaStatus?.mediaGenerationStatus;
    const generatedVideo =
      m?.video?.generatedVideo ||
      m?.mediaMetadata?.generatedVideo ||
      m?.result?.generatedVideo?.[0] ||
      m?.result?.generatedVideos?.[0] ||
      {};

    const fifeUrl =
      generatedVideo?.fifeUrl ||
      generatedVideo?.uri ||
      generatedVideo?.videoUrl ||
      m?.video?.fifeUrl ||
      m?.fifeUrl ||
      null;

    const servingBaseUri =
      generatedVideo?.servingBaseUri ||
      generatedVideo?.thumbnailUrl ||
      m?.mediaMetadata?.servingBaseUri ||
      null;

    const operationName = m?.video?.operation?.name || m?.operation?.name || m?.name || '';
    const done = mediaStatus === 'MEDIA_GENERATION_STATUS_COMPLETED' || !!fifeUrl;

    return {
      operation: {
        name: operationName,
        metadata: {
          video: {
            fifeUrl,
            servingBaseUri,
          },
        },
      },
      status: mediaStatus || (done ? 'MEDIA_GENERATION_STATUS_COMPLETED' : 'MEDIA_GENERATION_STATUS_PENDING'),
      done,
      result: {
        generatedVideo: fifeUrl ? [{ fifeUrl, servingBaseUri }] : [],
      },
      mediaRef: {
        name: m?.name,
        projectId: m?.projectId,
      },
    };
  });

  return {
    ...data,
    operations: normalizedOperations,
  };
};

// ===============================
// 📋 HELPER: GET GOOGLE API HEADERS
// ===============================
const getGoogleApiHeaders = (authToken) => {
  return {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'text/plain;charset=UTF-8', // ✅ All Google Labs API endpoints use text/plain;charset=UTF-8 (matching BOT VEOX)
    'Origin': 'https://labs.google',
    'Referer': 'https://labs.google/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', // Aligned with HAR / telemetry USER_AGENT (Chrome 121)
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br', // ✅ Matching BOT VEOX (removed zstd)
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Chromium";v="121", "Not A(Brand";v="99", "Google Chrome";v="121"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Site': 'cross-site', // ✅ Matching BOT VEOX (capital S)
    'Sec-Fetch-Mode': 'cors', // ✅ Matching BOT VEOX (capital S)
    'Sec-Fetch-Dest': 'empty' // ✅ Matching BOT VEOX (capital S)
    // Removed: Priority, x-browser-* headers (not used by BOT VEOX)
  };
};

/** Ensure clientContext JSON key order matches Labs browser: recaptchaContext first (some evaluations are picky). */
const normalizeClientContextRecaptchaFirst = (body) => {
  if (!body || typeof body !== 'object' || !body.clientContext || typeof body.clientContext !== 'object') {
    return body;
  }
  const cc = body.clientContext;
  if (!cc.recaptchaContext) return body;
  const { recaptchaContext, ...rest } = cc;
  body.clientContext = { recaptchaContext, ...rest };
  return body;
};

// ===============================
// 📊 HELPER: SEND VEO TELEMETRY (HAR-LIKE)
// ===============================
const sendVeoTelemetry = async (authToken, requestBody, req, generationType = 'video') => {
  try {
    const request0 = Array.isArray(requestBody?.requests) ? requestBody.requests[0] : null;
    const sessionId = requestBody?.clientContext?.sessionId || `;${Date.now()}`;
    const modelKey = request0?.videoModelKey || '';
    const structuredPrompt = request0?.textInput?.structuredPrompt || { parts: [] };
    const aspectRatioRaw = request0?.aspectRatio || 'VIDEO_ASPECT_RATIO_PORTRAIT';
    const aspectRatio = String(aspectRatioRaw).includes('LANDSCAPE') ? 'LANDSCAPE' : 'PORTRAIT';
    const userPaygateTier = requestBody?.clientContext?.userPaygateTier || 'PAYGATE_TIER_TWO';
    const referenceImagesRaw = Array.isArray(request0?.referenceImages) ? request0.referenceImages : [];
    const referenceImages = referenceImagesRaw
      .map((img) => img?.mediaId)
      .filter(Boolean)
      .map((mediaId) => ({ imageId: `fe_id_${mediaId}` }));

    const generationSettings = {
      modelKey,
      apiPathname: 'batchAsyncGenerateVideoReferenceImages',
      aspectRatio,
      outputsPerPrompt: 1,
      structuredPrompt,
      ...(referenceImages.length > 0 ? { referenceImages } : {}),
    };

    const batchLogPayload = {
      appEvents: [
        {
          event: 'MEDIA_GENERATION',
          eventProperties: [
            { key: 'MEDIA_GENERATION_TYPE', stringValue: generationType },
            { key: 'MEDIA_GENERATION_SETTINGS', stringValue: JSON.stringify(generationSettings) },
            { key: 'MEDIA_GENERATION_PAYGATE_TIER', stringValue: userPaygateTier },
            { key: 'MEDIA_GENERATION_PAYGATE_TIER', stringValue: userPaygateTier },
            { key: 'USER_AGENT', stringValue: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' },
            { key: 'IS_DESKTOP', booleanValue: true },
          ],
          eventMetadata: { sessionId },
          eventTime: new Date().toISOString(),
        },
      ],
    };

    const flowBatchPayload = {
      events: [
        {
          eventType: 'MEDIA_GENERATION',
          metadata: {
            sessionId,
            createTime: new Date().toISOString(),
            additionalParams: {
              MEDIA_GENERATION_TYPE: {
                '@type': 'type.googleapis.com/google.protobuf.StringValue',
                value: generationType,
              },
              MEDIA_GENERATION_SETTINGS: {
                '@type': 'type.googleapis.com/google.protobuf.StringValue',
                value: JSON.stringify(generationSettings),
              },
              MEDIA_GENERATION_PAYGATE_TIER: {
                '@type': 'type.googleapis.com/google.protobuf.StringValue',
                value: userPaygateTier,
              },
              USER_AGENT: {
                '@type': 'type.googleapis.com/google.protobuf.StringValue',
                value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
              },
              IS_DESKTOP: {
                '@type': 'type.googleapis.com/google.protobuf.BoolValue',
                value: true,
              },
            },
          },
        },
      ],
    };

    const headers = getGoogleApiHeaders(authToken);

    const batchLogResponse = await fetch(`${VEO_API_BASE}:batchLog`, {
      method: 'POST',
      headers,
      body: JSON.stringify(batchLogPayload),
    });
    log('log', req, `📊 [Telemetry] batchLog status: ${batchLogResponse.status}`);

    const flowBatchResponse = await fetch(`${VEO_API_BASE}/flow:batchLogFrontendEvents`, {
      method: 'POST',
      headers,
      body: JSON.stringify(flowBatchPayload),
    });
    log('log', req, `📊 [Telemetry] flow:batchLogFrontendEvents status: ${flowBatchResponse.status}`);
  } catch (telemetryError) {
    // Never block generation flow if telemetry fails.
    log('warn', req, '⚠️ [Telemetry] Failed to send HAR-like telemetry (continuing):', telemetryError?.message || telemetryError);
  }
};


// ===============================
// 🧩 MIDDLEWARE - APPLE FIX
// ===============================
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests from your domains
    const allowedOrigins = [
      'https://app.monoklix.com',
      'https://app2.monoklix.com',
      'https://dev.monoklix.com',
      'https://dev1.monoklix.com',
      'https://captcha.monoklix.com',
      'https://esaie.tech',
      'http://localhost:8080',
      'http://localhost:3001',
      'http://localhost:6003' // Bridge Server (reCAPTCHA Generator)
    ];
    
    // Allow all localhost origins for development
    if (origin && origin.startsWith('http://localhost:')) {
      console.log(`[CORS] ✅ Allowed localhost origin: ${origin}`);
      callback(null, true);
      return;
    }
    
    // ✅ TAMBAH INI: Allow all Chrome Extension origins
    if (origin && origin.startsWith('chrome-extension://')) {
      console.log(`[CORS] ✅ Allowed Chrome Extension origin: ${origin}`);
      callback(null, true);
      return;
    }
    
    // ✅ TAMBAH INI: Allow labs.google origin (for Chrome Extension bridge server)
    if (origin && (origin === 'https://labs.google' || origin === 'https://labs.google.com')) {
      console.log(`[CORS] ✅ Allowed labs.google origin: ${origin}`);
      callback(null, true);
      return;
    }
    
    // Log for debugging
    if (origin) {
      console.log(`[CORS] Request from origin: ${origin}`);
    } else {
      console.log('[CORS] Request with no origin (same-origin or direct request)');
    }
    
    if (!origin || allowedOrigins.includes(origin)) {
      console.log(`[CORS] ✅ Allowed: ${origin || 'no origin'}`);
      callback(null, true);
    } else {
      console.error(`[CORS] ❌ Blocked origin: ${origin}`);
      console.error(`[CORS] Allowed origins:`, allowedOrigins);
      callback(new Error(`CORS not allowed: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-User-Username'],
  maxAge: 86400,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Debug middleware untuk log semua requests ke nanobanana2
app.use((req, res, next) => {
  if (req.path.includes('/api/nanobanana2')) {
    log('log', req, `🔍 [DEBUG] Request to: ${req.method} ${req.path}`);
  }
  next();
});

// Apple devices preflight fix
app.options('*', cors());

// ===============================
// 🔍 HEALTH CHECK
// ===============================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===============================
// ========== VEO3 ENDPOINTS ==========
// ===============================

// 🎬 TEXT-TO-VIDEO
app.post('/api/veo/generate-t2v', async (req, res) => {
  log('log', req, '\n🎬 ===== [T2V] TEXT-TO-VIDEO REQUEST =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      log('error', req, '❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    log('log', req, '📤 Forwarding to Veo API...');
    normalizeClientContextRecaptchaFirst(req.body);
    log('log', req, '📦 Request body:', req.body);

    // Log reCAPTCHA token presence for debugging
    if (req.body.clientContext?.recaptchaContext?.token) {
      const token = req.body.clientContext.recaptchaContext.token;
      log('log', req, '🔐 reCAPTCHA token present in request (new format: recaptchaContext)');
      log('log', req, '🔍 Token details:', {
        length: token.length,
        firstChars: token.substring(0, 30),
        lastChars: token.substring(token.length - 30),
        applicationType: req.body.clientContext.recaptchaContext.applicationType
      });
      // Verify recaptchaContext is first in clientContext
      const clientContextKeys = Object.keys(req.body.clientContext || {});
      log('log', req, '🔍 clientContext keys order:', clientContextKeys);
      log('log', req, '🔍 recaptchaContext position:', clientContextKeys[0] === 'recaptchaContext' ? '✅ FIRST' : '❌ NOT FIRST');
    } else {
      log('log', req, '⚠️  No reCAPTCHA token in request');
    }

    // HAR-like telemetry sequence before generation.
    await sendVeoTelemetry(authToken, req.body, req, 'video');

    const response = await fetch(`${VEO_API_BASE}/video:batchAsyncGenerateVideoText`, {
      method: 'POST',
      headers: getGoogleApiHeaders(authToken),
      body: JSON.stringify(req.body)
    });

    const data = normalizeVeoPayload(await getJson(response, req));
    log('log', req, '📨 Response status:', response.status);
    
    if (!response.ok) {
      log('error', req, '❌ Veo API Error (T2V):', data);
      // Check if it's a 401/UNAUTHENTICATED error and log helpful message
      if (response.status === 401 || data?.error?.status === 'UNAUTHENTICATED') {
        log('error', req, '🔑 ERROR 401 - Token invalid or expired.');
        log('error', req, '💡 Please go to Settings > Token Setting to generate a new token.');
      }
      return res.status(response.status).json(data);
    }

    log('log', req, '✅ [T2V] Success - Operations:', data.operations?.length || 0);
    log('log', req, '=========================================\n');
    res.json(data);
  } catch (error) {
    log('error', req, '❌ Proxy error (T2V):', error);
    res.status(500).json({ error: error.message });
  }
});

// 🖼️ IMAGE-TO-VIDEO
app.post('/api/veo/generate-i2v', async (req, res) => {
  log('log', req, '\n🖼️ ===== [I2V] IMAGE-TO-VIDEO REQUEST =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      log('error', req, '❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    normalizeClientContextRecaptchaFirst(req.body);
    log('log', req, '📦 Request body:', req.body);

    // Log reCAPTCHA token presence for debugging
    if (req.body.clientContext?.recaptchaContext?.token) {
      const token = req.body.clientContext.recaptchaContext.token;
      log('log', req, '🔐 reCAPTCHA token present in request (new format: recaptchaContext)');
      log('log', req, '🔍 Token details:', {
        length: token.length,
        firstChars: token.substring(0, 30),
        lastChars: token.substring(token.length - 30),
        applicationType: req.body.clientContext.recaptchaContext.applicationType
      });
      // Verify recaptchaContext is first in clientContext
      const clientContextKeys = Object.keys(req.body.clientContext || {});
      log('log', req, '🔍 clientContext keys order:', clientContextKeys);
      log('log', req, '🔍 recaptchaContext position:', clientContextKeys[0] === 'recaptchaContext' ? '✅ FIRST' : '❌ NOT FIRST');
    } else {
      log('log', req, '⚠️  No reCAPTCHA token in request');
    }

    // HAR-like telemetry sequence before generation.
    await sendVeoTelemetry(authToken, req.body, req, 'video');

    // HAR (latest) shows I2V requests going through this endpoint.
    const response = await fetch(`${VEO_API_BASE}/video:batchAsyncGenerateVideoReferenceImages`, {
      method: 'POST',
      headers: getGoogleApiHeaders(authToken),
      body: JSON.stringify(req.body)
    });

    const data = normalizeVeoPayload(await getJson(response, req));
    log('log', req, '📨 Response status:', response.status);
    
    if (!response.ok) {
      log('error', req, '❌ Veo API Error (I2V):', data);
      // Check if it's a 401/UNAUTHENTICATED error and log helpful message
      if (response.status === 401 || data?.error?.status === 'UNAUTHENTICATED') {
        log('error', req, '🔑 ERROR 401 - Token invalid or expired.');
        log('error', req, '💡 Please go to Settings > Token Setting to generate a new token.');
      }
      return res.status(response.status).json(data);
    }

    log('log', req, '✅ [I2V] Success - Operations:', data.operations?.length || 0);
    log('log', req, '=========================================\n');
    res.json(data);
  } catch (error) {
    log('error', req, '❌ Proxy error (I2V):', error);
    res.status(500).json({ error: error.message });
  }
});

// 🔍 CHECK VIDEO STATUS
app.post('/api/veo/status', async (req, res) => {
  log('log', req, '\n🔍 ===== [STATUS] CHECK VIDEO STATUS =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      log('error', req, '❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    log('log', req, '📦 Payload:', req.body);
    
    const response = await fetch(`${VEO_API_BASE}/video:batchCheckAsyncVideoGenerationStatus`, {
      method: 'POST',
      headers: getGoogleApiHeaders(authToken),
      body: JSON.stringify(req.body)
    });

    const data = normalizeVeoPayload(await getJson(response, req));
    log('log', req, '📨 Response status:', response.status);
    
    if (!response.ok) {
      log('error', req, '❌ Veo API Error (Status):', data);
      return res.status(response.status).json(data);
    }

    const opCount = Array.isArray(data.operations) ? data.operations.length : 0;
    const firstStatus = data.operations?.[0]?.status || 'N/A';
    const firstDone = data.operations?.[0]?.done ?? false;
    log('log', req, `📊 Normalized ops: ${opCount}, first status: ${firstStatus}, done: ${firstDone}`);

    log('log', req, '✅ [STATUS] Success');
    log('log', req, '=========================================\n');
    res.json(data);
  } catch (error) {
    log('error', req, '❌ Proxy error (STATUS):', error);
    res.status(500).json({ error: error.message });
  }
});

// 📤 VEO UPLOAD IMAGE
app.post('/api/veo/upload', async (req, res) => {
  log('log', req, '\n📤 ===== [VEO UPLOAD] IMAGE UPLOAD =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      log('error', req, '❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    log('log', req, '📤 Mime type:', req.body.imageInput?.mimeType);
    log('log', req, '📤 Aspect ratio:', req.body.imageInput?.aspectRatio);

    // Log reCAPTCHA token presence for debugging
    if (req.body.clientContext?.recaptchaContext?.token) {
      const token = req.body.clientContext.recaptchaContext.token;
      log('log', req, '🔐 reCAPTCHA token present in request (new format: recaptchaContext)');
      log('log', req, '🔍 Token details:', {
        length: token.length,
        firstChars: token.substring(0, 30),
        lastChars: token.substring(token.length - 30),
        applicationType: req.body.clientContext.recaptchaContext.applicationType
      });
      // Verify recaptchaContext is first in clientContext
      const clientContextKeys = Object.keys(req.body.clientContext || {});
      log('log', req, '🔍 clientContext keys order:', clientContextKeys);
      log('log', req, '🔍 recaptchaContext position:', clientContextKeys[0] === 'recaptchaContext' ? '✅ FIRST' : '❌ NOT FIRST');
    } else {
      log('log', req, '⚠️  No reCAPTCHA token in request');
    }

    // FLOW latest HAR uses /v1/flow/uploadImage with imageBytes payload.
    const uploadPayload = {
      clientContext: {
        projectId: req.body?.clientContext?.projectId,
        tool: req.body?.clientContext?.tool || 'PINHOLE',
      },
      imageBytes: req.body?.imageBytes || req.body?.imageInput?.rawImageBytes,
    };

    // ✅ Matching BOT VEOX: Add Content-Length header for upload requests
    const uploadBody = JSON.stringify(uploadPayload);
    const uploadHeaders = {
      ...getGoogleApiHeaders(authToken),
      'Content-Length': Buffer.byteLength(uploadBody) // ✅ Explicit Content-Length like BOT VEOX
    };
    
    const response = await fetch(`${VEO_API_BASE}/flow/uploadImage`, {
      method: 'POST',
      headers: uploadHeaders,
      body: uploadBody
    });

    const data = await getJson(response, req);
    log('log', req, '📨 Response status:', response.status);
    
    if (!response.ok) {
      log('error', req, '❌ Upload Error:', data);
      return res.status(response.status).json(data);
    }

    const mediaId =
      data.result?.data?.json?.result?.uploadMediaGenerationId ||
      data.mediaGenerationId?.mediaGenerationId ||
      data.mediaGenerationId ||
      data.mediaId ||
      data.media?.name ||
      data.workflow?.metadata?.primaryMediaId;
    log('log', req, '✅ [VEO UPLOAD] Success - MediaId:', mediaId);
    log('log', req, '=========================================\n');
    res.json({
      ...data,
      mediaId: mediaId || null,
    });
  } catch (error) {
    log('error', req, '❌ Proxy error (VEO UPLOAD):', error);
    res.status(500).json({ error: error.message });
  }
});

// ===============================
// ========== NANOBANANA ENDPOINTS ==========
// ===============================

// 🎨 GENERATE IMAGE (NanoBanana T2I)
app.post('/api/nanobanana/generate', async (req, res) => {
  log('log', req, '\n🎨 ===== [NANOBANANA] GENERATE IMAGE =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      log('error', req, '❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    log('log', req, '📤 Forwarding to NanoBanana API...');
    log('log', req, '📦 Request body:', req.body);

    // Log reCAPTCHA token presence for debugging
    if (req.body.clientContext?.recaptchaContext?.token) {
      const token = req.body.clientContext.recaptchaContext.token;
      log('log', req, '🔐 reCAPTCHA token present in request (new format: recaptchaContext)');
      log('log', req, '🔍 Token details:', {
        length: token.length,
        firstChars: token.substring(0, 30),
        lastChars: token.substring(token.length - 30),
        applicationType: req.body.clientContext.recaptchaContext.applicationType
      });
      // Verify recaptchaContext is first in clientContext
      const clientContextKeys = Object.keys(req.body.clientContext || {});
      log('log', req, '🔍 clientContext keys order:', clientContextKeys);
      log('log', req, '🔍 recaptchaContext position:', clientContextKeys[0] === 'recaptchaContext' ? '✅ FIRST' : '❌ NOT FIRST');
    } else {
      log('log', req, '⚠️  No reCAPTCHA token in request');
    }

    // Retry mechanism for PUBLIC_ERROR_UNSAFE_GENERATION
    const maxRetries = 2; // Try up to 3 times total (initial + 2 retries)
    let lastError = null;
    let lastResponse = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // Generate new sessionId for retry to avoid session conflicts
        if (req.body.clientContext) {
          req.body.clientContext.sessionId = `;${Date.now()}`;
        }
        // Delay before retry: 2 seconds for first retry, 3 seconds for second retry
        const delayMs = (attempt === 1) ? 2000 : 3000;
        log('log', req, `⏳ Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      const response = await fetch(`${VEO_API_BASE}/whisk:generateImage`, {
        method: 'POST',
        headers: getGoogleApiHeaders(authToken),
        body: JSON.stringify(req.body)
      });

      const data = await getJson(response, req);
      log('log', req, `📨 Response status: ${response.status}${attempt > 0 ? ` (Attempt ${attempt + 1})` : ''}`);
      
      if (response.ok) {
        log('log', req, '✅ [NANOBANANA] Success - Generated:', data.imagePanels?.length || 0, 'panels');
        log('log', req, '=========================================\n');
        return res.json(data);
      }

      // Check if it's PUBLIC_ERROR_UNSAFE_GENERATION error
      const isUnsafeGenerationError = data?.error?.details?.[0]?.reason === 'PUBLIC_ERROR_UNSAFE_GENERATION' ||
                                      (data?.error?.message?.includes('invalid argument') && response.status === 400);

      if (isUnsafeGenerationError && attempt < maxRetries) {
        lastError = data;
        lastResponse = response;
        log('warn', req, `⚠️ PUBLIC_ERROR_UNSAFE_GENERATION detected (attempt ${attempt + 1}/${maxRetries + 1}). Will retry...`);
        continue; // Retry
      }

      // If not retriable error or max retries reached, return error
      log('error', req, '❌ NanoBanana API Error:', data);
      // Check if it's a 401/UNAUTHENTICATED error and log helpful message
      if (response.status === 401 || data?.error?.status === 'UNAUTHENTICATED') {
        log('error', req, '🔑 ERROR 401 - Token invalid or expired.');
        log('error', req, '💡 Please go to Settings > Token Setting to generate a new token.');
      }
      return res.status(response.status).json(data);
    }

    // If all retries exhausted, return last error
    log('error', req, `❌ NanoBanana API Error after ${maxRetries + 1} attempts:`, lastError);
    return res.status(lastResponse?.status || 400).json(lastError);

  } catch (error) {
    log('error', req, '❌ Proxy error (NANOBANANA GENERATE):', error);
    res.status(500).json({ error: error.message });
  }
});

// ✏️ RUN RECIPE (NanoBanana Edit/Compose)
app.post('/api/nanobanana/run-recipe', async (req, res) => {
  log('log', req, '\n✏️ ===== [NANOBANANA RECIPE] RUN RECIPE =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      log('error', req, '❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    log('log', req, '📤 Forwarding recipe to NanoBanana API...');
    log('log', req, '📦 Full body:', req.body);

    // Log reCAPTCHA token presence for debugging
    if (req.body.clientContext?.recaptchaContext?.token) {
      const token = req.body.clientContext.recaptchaContext.token;
      log('log', req, '🔐 reCAPTCHA token present in request (new format: recaptchaContext)');
      log('log', req, '🔍 Token details:', {
        length: token.length,
        firstChars: token.substring(0, 30),
        lastChars: token.substring(token.length - 30),
        applicationType: req.body.clientContext.recaptchaContext.applicationType
      });
      // Verify recaptchaContext is first in clientContext
      const clientContextKeys = Object.keys(req.body.clientContext || {});
      log('log', req, '🔍 clientContext keys order:', clientContextKeys);
      log('log', req, '🔍 recaptchaContext position:', clientContextKeys[0] === 'recaptchaContext' ? '✅ FIRST' : '❌ NOT FIRST');
    } else {
      log('log', req, '⚠️  No reCAPTCHA token in request');
    }

    const response = await fetch(`${VEO_API_BASE}/whisk:runImageRecipe`, {
      method: 'POST',
      headers: getGoogleApiHeaders(authToken),
      body: JSON.stringify(req.body)
    });

    const data = await getJson(response, req);
    log('log', req, '📨 Response status:', response.status);
    
    if (!response.ok) {
      log('error', req, '❌ NanoBanana Recipe Error:', data);
      // Check if it's a 401/UNAUTHENTICATED error and log helpful message
      if (response.status === 401 || data?.error?.status === 'UNAUTHENTICATED') {
        log('error', req, '🔑 ERROR 401 - Token invalid or expired.');
        log('error', req, '💡 Please go to Settings > Token Setting to generate a new token.');
      }
      return res.status(response.status).json(data);
    }
    
    const panelCount = data.imagePanels?.length || 0;
    const imageCount = data.imagePanels?.[0]?.generatedImages?.length || 0;
    
    log('log', req, '✅ [NANOBANANA RECIPE] Success');
    log('log', req, `   Generated ${panelCount} panel(s) with ${imageCount} image(s)`);
    log('log', req, '=========================================\n');
    
    res.json(data);
  } catch (error) {
    log('error', req, '❌ Proxy error (NANOBANANA RECIPE):', error);
    res.status(500).json({ error: error.message });
  }
});

// 📤 NANOBANANA UPLOAD IMAGE
app.post('/api/nanobanana/upload', async (req, res) => {
  log('log', req, '\n📤 ===== [NANOBANANA UPLOAD] IMAGE UPLOAD =====');
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      log('error', req, '❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    const uploadMediaInput = req.body.uploadMediaInput;
    if (uploadMediaInput) {
      log('log', req, '📤 Media category:', uploadMediaInput.mediaCategory);
    }
    log('log', req, '📦 Full request body keys:', Object.keys(req.body));

    // Log reCAPTCHA token presence for debugging
    if (req.body.clientContext?.recaptchaContext?.token) {
      const token = req.body.clientContext.recaptchaContext.token;
      log('log', req, '🔐 reCAPTCHA token present in request (new format: recaptchaContext)');
      log('log', req, '🔍 Token details:', {
        length: token.length,
        firstChars: token.substring(0, 30),
        lastChars: token.substring(token.length - 30),
        applicationType: req.body.clientContext.recaptchaContext.applicationType
      });
      // Verify recaptchaContext is first in clientContext
      const clientContextKeys = Object.keys(req.body.clientContext || {});
      log('log', req, '🔍 clientContext keys order:', clientContextKeys);
      log('log', req, '🔍 recaptchaContext position:', clientContextKeys[0] === 'recaptchaContext' ? '✅ FIRST' : '❌ NOT FIRST');
    } else {
      log('log', req, '⚠️  No reCAPTCHA token in request');
    }

    // ✅ Matching BOT VEOX: Add Content-Length header for upload requests
    const uploadBody = JSON.stringify(req.body);
    const uploadHeaders = {
      ...getGoogleApiHeaders(authToken),
      'Content-Length': Buffer.byteLength(uploadBody) // ✅ Explicit Content-Length like BOT VEOX
    };
    
    const response = await fetch(`${VEO_API_BASE}:uploadUserImage`, {
      method: 'POST',
      headers: uploadHeaders,
      body: uploadBody
    });

    const data = await getJson(response, req);
    log('log', req, '📨 Response status:', response.status);
    
    if (!response.ok) {
      log('error', req, '❌ NanoBanana Upload Error:', data);
      // Check if it's a 401/UNAUTHENTICATED error and log helpful message
      if (response.status === 401 || data?.error?.status === 'UNAUTHENTICATED') {
        log('error', req, '🔑 ERROR 401 - Token invalid or expired.');
        log('error', req, '💡 Please go to Settings > Token Setting to generate a new token.');
      }
      return res.status(response.status).json(data);
    }

    const mediaId = data.result?.data?.json?.result?.uploadMediaGenerationId || 
                   data.mediaGenerationId?.mediaGenerationId || 
                   data.mediaId;
    
    log('log', req, '✅ [NANOBANANA UPLOAD] Success - MediaId:', mediaId);
    log('log', req, '=========================================\n');
    res.json(data);
  } catch (error) {
    log('error', req, '❌ Proxy error (NANOBANANA UPLOAD):', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== NANOBANANA 2 ENDPOINTS ==========
// ===============================

// 🍌 GENERATE IMAGE (NANOBANANA 2 / GEM_PIX_2)
app.post('/api/nanobanana2/generate', async (req, res) => {
  log('log', req, '\n🍌 ===== [NANOBANANA 2] GENERATE IMAGE =====');
  log('log', req, '📍 Endpoint: /api/nanobanana2/generate');
  log('log', req, '📍 Request received at:', new Date().toISOString());
  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      log('error', req, '❌ No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    // Extract projectId from request body
    const projectId = req.body.requests?.[0]?.clientContext?.projectId;
    if (!projectId) {
      log('error', req, '❌ No projectId in request');
      return res.status(400).json({ error: 'No projectId in request' });
    }

    log('log', req, '📤 Forwarding to NANOBANANA 2 API...');
    log('log', req, '📦 Request body:', JSON.stringify(req.body, null, 2));

    // Log reCAPTCHA token presence for debugging
    if (req.body.clientContext?.recaptchaContext?.token || req.body.requests?.[0]?.clientContext?.recaptchaContext?.token) {
      log('log', req, '🔐 reCAPTCHA token present in request (new format: recaptchaContext)');
    } else {
      log('log', req, '⚠️  No reCAPTCHA token in request');
    }

    // Build endpoint URL with projectId
    const endpoint = `${VEO_API_BASE}/projects/${projectId}/flowMedia:batchGenerateImages`;
    
    // ✅ Add Content-Length and Priority headers like HAR file (berjaya)
    const requestBody = JSON.stringify(req.body);
    const generateHeaders = {
      ...getGoogleApiHeaders(authToken),
      'Content-Length': Buffer.byteLength(requestBody), // ✅ Explicit Content-Length like HAR file
      'Priority': 'u=1, i' // ✅ Add Priority header like HAR file (berjaya)
    };
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: generateHeaders,
      body: requestBody
    });

    const data = await getJson(response, req);
    log('log', req, '📨 Response status:', response.status);
    
    if (!response.ok) {
      log('error', req, '❌ NANOBANANA 2 API Error:', data);
      // Check if it's a 401/UNAUTHENTICATED error and log helpful message
      if (response.status === 401 || data?.error?.status === 'UNAUTHENTICATED') {
        log('error', req, '🔑 ERROR 401 - Token invalid or expired.');
        log('error', req, '💡 Please go to Settings > Token Setting to generate a new token.');
      }
      return res.status(response.status).json(data);
    }

    log('log', req, '✅ [NANOBANANA 2] Success - Generated:', data.media?.length || 0, 'image(s)');
    log('log', req, '=========================================\n');
    res.json(data);
  } catch (error) {
    log('error', req, '❌ Proxy error (NANOBANANA 2 GENERATE):', error);
    res.status(500).json({ error: error.message });
  }
});

// ===============================
// 📥 DOWNLOAD IMAGE (CORS BYPASS for NANOBANANA 2)
// ===============================
app.get('/api/nanobanana/download-image', async (req, res) => {
  log('log', req, '\n📥 ===== [NANOBANANA 2] IMAGE DOWNLOAD =====');
  try {
    const imageUrl = req.query.url;
    
    if (!imageUrl || typeof imageUrl !== 'string') {
      log('error', req, '❌ No URL provided');
      return res.status(400).json({ error: 'Image URL is required' });
    }

    log('log', req, '📥 Image URL:', imageUrl);
    log('log', req, '📥 Fetching and streaming from Google Storage...');

    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      log('error', req, '❌ Failed to fetch image:', response.status, response.statusText);
      const errorBody = await response.text();
      return res.status(response.status).json({ error: `Failed to download: ${response.statusText}`, details: errorBody });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const contentLength = response.headers.get('content-length');

    log('log', req, '📥 Content-Type:', contentType);
    log('log', req, '📥 Content-Length:', contentLength);

    // Set headers for image download
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Content-Disposition', `attachment; filename="nanobanana2-${Date.now()}.jpg"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Stream the image data
    const imageBuffer = await response.arrayBuffer();
    res.send(Buffer.from(imageBuffer));

    log('log', req, '✅ [NANOBANANA 2] Image download successful');
    log('log', req, '=========================================\n');
  } catch (error) {
    log('error', req, '❌ Proxy error (NANOBANANA 2 IMAGE DOWNLOAD):', error);
    res.status(500).json({ error: error.message });
  }
});

// ===============================
// 📥 DOWNLOAD VIDEO (CORS BYPASS)
// ===============================
app.get('/api/veo/download-video', async (req, res) => {
  log('log', req, '\n📥 ===== [DOWNLOAD] VIDEO DOWNLOAD =====');
  try {
    const videoUrl = req.query.url;
    
    if (!videoUrl || typeof videoUrl !== 'string') {
      log('error', req, '❌ No URL provided');
      return res.status(400).json({ error: 'Video URL is required' });
    }

    log('log', req, '📥 Video URL:', videoUrl);
    log('log', req, '📥 Fetching and streaming from Google Storage...');

    const response = await fetch(videoUrl);
    
    if (!response.ok) {
      log('error', req, '❌ Failed to fetch video:', response.status, response.statusText);
      const errorBody = await response.text();
      return res.status(response.status).json({ error: `Failed to download: ${response.statusText}`, details: errorBody });
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');
    const filename = `monoklix-video-${Date.now()}.mp4`;

    log('log', req, '📦 Video headers received:', { contentType, contentLength });

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Accept-Ranges', 'bytes');

    response.body.pipe(res);

    response.body.on('end', () => {
      log('log', req, '✅ [DOWNLOAD] Video stream finished to client.');
      log('log', req, '=========================================\n');
    });

    response.body.on('error', (err) => {
      log('error', req, '❌ [DOWNLOAD] Error during video stream pipe:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming video' });
      }
    });

  } catch (error) {
    log('error', req, '❌ Proxy error (DOWNLOAD):', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// ===============================
// ========== VIDEO COMBINER ENDPOINT ==========
// ===============================

// Configure multer for file uploads
const upload = multer({ 
  dest: tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit per file
});

// 🎬 COMBINE VIDEOS (Server-side using FFmpeg)
app.post('/api/video/combine', upload.array('videos', 10), async (req, res) => {
  log('log', req, '\n🎬 ===== [VIDEO COMBINER] COMBINE VIDEOS =====');
  
  const tempFiles = [];
  const outputPath = join(tmpdir(), `combined-${Date.now()}.mp4`);
  
  try {
    if (!req.files || req.files.length < 2) {
      log('error', req, '❌ Need at least 2 videos to combine');
      return res.status(400).json({ error: 'Need at least 2 videos to combine' });
    }

    log('log', req, `📦 Received ${req.files.length} video files`);

    // Check if FFmpeg is available
    try {
      await execAsync(`"${ffmpegPath}" -version`);
    } catch (e) {
      log('error', req, '❌ FFmpeg is not available');
      
      // Cleanup uploaded files
      req.files.forEach(file => {
        try { unlinkSync(file.path); } catch (e) {}
      });
      
      return res.status(503).json({ 
        error: 'FFmpeg is not available. Please ensure FFmpeg is bundled with the application.',
        suggestion: 'FFmpeg should be bundled with the application. If this error persists, please contact support.'
      });
    }

    // Use FFmpeg concat filter instead of concat demuxer for better Windows compatibility
    // Build input arguments for all video files
    const inputArgs = [];
    
    req.files.forEach((file) => {
      tempFiles.push(file.path);
      const filePathNormalized = resolve(file.path).replace(/\\/g, '/');
      inputArgs.push(`-i "${filePathNormalized}"`);
    });
    
    // Create concat filter: [0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]
    // This concatenates video and audio streams from all inputs
    const numInputs = req.files.length;
    const filterInputLabels = Array.from({ length: numInputs }, (_, i) => `[${i}:v][${i}:a]`).join('');
    const concatFilter = `${filterInputLabels}concat=n=${numInputs}:v=1:a=1[v][a]`;
    
    // Build FFmpeg command using concat filter (more reliable on Windows)
    const outputPathNormalized = resolve(outputPath).replace(/\\/g, '/');
    const ffmpegCommand = `"${ffmpegPath}" ${inputArgs.join(' ')} -filter_complex "${concatFilter}" -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -y "${outputPathNormalized}"`;
    
    tempFiles.push(outputPath);

    log('log', req, '🔄 Combining videos with FFmpeg (using concat filter)...');
    log('log', req, 'Number of videos:', req.files.length);
    log('log', req, 'FFmpeg command (truncated):', ffmpegCommand.substring(0, 300) + '...');
    
    try {
      const { stdout, stderr } = await execAsync(ffmpegCommand);
      log('log', req, '✅ Video combination successful');
      if (stderr) log('log', req, 'FFmpeg output:', stderr);
    } catch (ffmpegError) {
      log('error', req, '❌ FFmpeg error:', ffmpegError);
      throw new Error(`FFmpeg failed: ${ffmpegError.message}`);
    }

    // Check if output file exists
    if (!existsSync(outputPath)) {
      throw new Error('Combined video file was not created');
    }

    // Read the combined video file
    const videoBuffer = readFileSync(outputPath);
    
    // Cleanup temp files
    tempFiles.forEach(file => {
      try { unlinkSync(file); } catch (e) {}
    });

    log('log', req, `✅ Combined video size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    log('log', req, '=========================================\n');

    // Send video as response
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="combined-${Date.now()}.mp4"`);
    res.send(videoBuffer);

  } catch (error) {
    log('error', req, '❌ Video combine error:', error);
    
    // Cleanup on error
    tempFiles.forEach(file => {
      try { unlinkSync(file); } catch (e) {}
    });
    
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Video combination failed' });
    }
  }
});

// ===============================
// ========== SEEDANCE TEMP UPLOAD (3-min TTL) ==========
// ===============================
const SEEDANCE_TEMP_DIR = join(tmpdir(), 'seedance-temp');
const SEEDANCE_TEMP_TTL_MS = 3 * 60 * 1000; // 3 minutes

try {
  mkdirSync(SEEDANCE_TEMP_DIR, { recursive: true });
  log('log', null, '✅ Seedance temp dir:', SEEDANCE_TEMP_DIR);
} catch (e) {
  log('error', null, '❌ Seedance temp dir creation failed:', e);
}

const seedanceStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SEEDANCE_TEMP_DIR),
  filename: (req, file, cb) => {
    const ext = (file.mimetype === 'image/png') ? 'png' : (file.mimetype === 'image/webp') ? 'webp' : 'jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${ext}`;
    cb(null, name);
  }
});
const uploadSeedanceImage = multer({
  storage: seedanceStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.mimetype)) {
      return cb(new Error('Only PNG, JPEG, WebP allowed'));
    }
    cb(null, true);
  }
});

// POST /api/seedance/upload — multipart 'image' or JSON { base64, mimeType } (body already parsed by express.json)
app.post('/api/seedance/upload', (req, res, next) => {
  const isJson = req.headers['content-type']?.includes('application/json');
  if (isJson) {
    return handleSeedanceUploadJson(req, res);
  }
  uploadSeedanceImage.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    handleSeedanceUploadFile(req, res);
  });
});

function handleSeedanceUploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file' });
  }
  const filePath = req.file.path;
  const filename = req.file.filename;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/api/seedance/temp/${filename}`;
  setTimeout(() => {
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
      log('log', null, '🗑️ Seedance temp deleted:', filename);
    } catch (e) {}
  }, SEEDANCE_TEMP_TTL_MS);
  log('log', req, '✅ [SEEDANCE UPLOAD] Temp URL (TTL 3min):', url);
  res.json({ url });
}

function handleSeedanceUploadJson(req, res) {
  const { base64, mimeType } = req.body || {};
  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'base64 required' });
  }
  const ext = (mimeType === 'image/png') ? 'png' : (mimeType === 'image/webp') ? 'webp' : 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${ext}`;
  const filePath = join(SEEDANCE_TEMP_DIR, filename);
  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'Invalid base64' });
  }
  try {
    writeFileSync(filePath, buffer);
  } catch (e) {
    return res.status(500).json({ error: 'Write failed' });
  }
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/api/seedance/temp/${filename}`;
  setTimeout(() => {
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
      log('log', null, '🗑️ Seedance temp deleted:', filename);
    } catch (e) {}
  }, SEEDANCE_TEMP_TTL_MS);
  log('log', req, '✅ [SEEDANCE UPLOAD] Temp URL (TTL 3min):', url);
  res.json({ url });
}

// GET /api/seedance/temp/:filename — serve temp image (Seedance fetches this URL)
app.get('/api/seedance/temp/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[0-9]+-[a-z0-9]+\.(png|jpg|jpeg|webp)$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = join(SEEDANCE_TEMP_DIR, filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found or expired' });
  }
  const ext = filename.split('.').pop().toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  res.setHeader('Content-Type', contentType);
  res.sendFile(resolve(filePath), (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'Send failed' });
  });
});

// ===============================
// 🚀 SERVER START
// ===============================
app.listen(PORT, '0.0.0.0', () => {
  const logSystem = (...args) => log('log', null, ...args);

  logSystem('\n🚀 ===================================');
  logSystem('🚀 MONOKLIX - PROXY SERVER');
  logSystem('🚀 ===================================');
  logSystem(`📍 Port: ${PORT}`);
  logSystem(`📍 Local: http://localhost:${PORT}`);
  logSystem(`📍 Health: http://localhost:${PORT}/health`);
  logSystem('✅ CORS: Allow all origins');
  logSystem('🔧 Debug logging: ENABLED');
  logSystem('===================================\n');
  logSystem('📋 VEO3 Endpoints:');
  logSystem('   POST /api/veo/generate-t2v');
  logSystem('   POST /api/veo/generate-i2v');
  logSystem('   POST /api/veo/status');
  logSystem('   POST /api/veo/upload');
  logSystem('   GET  /api/veo/download-video');
  logSystem('📋 NANOBANANA Endpoints (GEM_PIX):');
  logSystem('   POST /api/nanobanana/generate');
  logSystem('   POST /api/nanobanana/run-recipe');
  logSystem('   POST /api/nanobanana/upload');
  logSystem('📋 NANOBANANA 2 Endpoints (GEM_PIX_2):');
  logSystem('   POST /api/nanobanana2/generate');
  logSystem('📋 SHARED Endpoints:');
  logSystem('   GET  /api/nanobanana/download-image');
  logSystem('📋 VIDEO Endpoints:');
  logSystem('   POST /api/video/combine');
  logSystem('📋 SEEDANCE Endpoints (temp upload, 3min TTL):');
  logSystem('   POST /api/seedance/upload');
  logSystem('   GET  /api/seedance/temp/:filename');
  logSystem('===================================\n');
});
