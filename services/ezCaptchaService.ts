/**
 * EzCaptcha Service
 * Integrates with ez-captcha.com API to solve reCAPTCHA v3 Enterprise tokens
 * Alternative provider to anti-captcha.com
 * Documentation: https://ezcaptcha.atlassian.net/wiki/spaces/IS/pages/7045313/ReCaptcha+V3
 */

const EZCAPTCHA_API_BASE = 'https://api.ez-captcha.com';
const RECAPTCHA_SITE_KEY = '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV';
const RECAPTCHA_PAGE_ACTION = 'FLOW_GENERATION';

// Poll settings
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 60; // 2 minutes total

export interface EzCaptchaConfig {
  apiKey: string;
  projectId?: string; // Optional: custom project ID for tracking
  useHighScore?: boolean; // Use ReCaptchaV3EnterpriseTaskProxylessS9 for score 0.9
}

export interface EzCaptchaTaskResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  taskId?: string; // EzCaptcha uses string taskId, not number
}

export interface EzCaptchaResultResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  status: 'processing' | 'ready';
  solution?: {
    gRecaptchaResponse: string;
  };
}

/**
 * Generate random project ID for reCAPTCHA website URL
 */
function generateProjectId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Create reCAPTCHA solving task on ez-captcha.com
 */
async function createCaptchaTask(config: EzCaptchaConfig): Promise<string> {
  const projectId = config.projectId || generateProjectId();
  const websiteURL = `https://labs.google/fx/tools/flow/project/${projectId}`;

  // Choose task type based on useHighScore flag
  // ReCaptchaV3EnterpriseTaskProxylessS9: High-scoring solutions (score 0.9) - $2.5/k
  // ReCaptchaV3EnterpriseTaskProxyless: Standard Enterprise - $1.5/k
  const taskType = config.useHighScore 
    ? 'ReCaptchaV3EnterpriseTaskProxylessS9'
    : 'ReCaptchaV3EnterpriseTaskProxyless';

  const payload = {
    clientKey: config.apiKey,
    task: {
      type: taskType,
      websiteURL: websiteURL,
      websiteKey: RECAPTCHA_SITE_KEY,
      isInvisible: true, // Required for reCAPTCHA V3
      pageAction: RECAPTCHA_PAGE_ACTION
    }
  };

  console.log('[EzCaptcha] Creating task with URL:', websiteURL);
  console.log('[EzCaptcha] 🔍 Task configuration:', {
    taskType: taskType,
    useHighScore: config.useHighScore || false,
    pageAction: RECAPTCHA_PAGE_ACTION,
    websiteKey: RECAPTCHA_SITE_KEY.substring(0, 20) + '...'
  });

  const response = await fetch(`${EZCAPTCHA_API_BASE}/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  const data: EzCaptchaTaskResponse = await response.json();

  if (data.errorId > 0) {
    throw new Error(`EzCaptcha error: ${data.errorDescription || data.errorCode || 'Unknown error'}`);
  }

  if (!data.taskId) {
    throw new Error('EzCaptcha: No taskId received');
  }

  console.log('[EzCaptcha] Task created, ID:', data.taskId);
  return data.taskId;
}

/**
 * Get result of reCAPTCHA solving task
 */
async function getCaptchaResult(apiKey: string, taskId: string): Promise<EzCaptchaResultResponse> {
  const payload = {
    clientKey: apiKey,
    taskId: taskId
  };

  const response = await fetch(`${EZCAPTCHA_API_BASE}/getTaskResult`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  const data: EzCaptchaResultResponse = await response.json();

  if (data.errorId > 0) {
    throw new Error(`EzCaptcha error: ${data.errorDescription || data.errorCode || 'Unknown error'}`);
  }

  return data;
}

/**
 * Poll for captcha result until ready or timeout
 */
async function pollCaptchaResult(apiKey: string, taskId: string, useHighScore: boolean = false): Promise<string> {
  const startTime = Date.now();
  
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    // Wait before polling (except first attempt)
    if (attempt > 1) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }

    console.log(`[EzCaptcha] Polling attempt ${attempt}/${MAX_POLL_ATTEMPTS}...`);

    const result = await getCaptchaResult(apiKey, taskId);

    if (result.status === 'ready' && result.solution?.gRecaptchaResponse) {
      const token = result.solution.gRecaptchaResponse;
      const solveDuration = (Date.now() - startTime) / 1000; // Duration in seconds
      
      console.log('[EzCaptcha] ✅ Token received!');
      console.log('[EzCaptcha] 🔍 Token quality details:', {
        length: token.length,
        firstChars: token.substring(0, 30),
        lastChars: token.substring(token.length - 30),
        taskType: useHighScore ? 'Enterprise High Score (0.9)' : 'Enterprise Standard',
        solveDurationSeconds: solveDuration.toFixed(2),
        tokenQuality: solveDuration < 5 ? '✅ FAST (High Quality)' : solveDuration < 10 ? '⚠️ MEDIUM' : '❌ SLOW (May be low quality)'
      });
      
      // Warn if solve duration is too long
      if (solveDuration > 10) {
        console.warn('[EzCaptcha] ⚠️ Token generation took', solveDuration.toFixed(2), 'seconds - may indicate low quality token');
      }
      
      return token;
    }

    if (result.status !== 'processing') {
      throw new Error(`Unexpected status: ${result.status}`);
    }
  }

  throw new Error('EzCaptcha timeout: Maximum polling attempts reached');
}

/**
 * Main function: Solve reCAPTCHA and return token
 * @param config - EzCaptcha configuration
 * @returns reCAPTCHA token string
 */
export async function solveCaptcha(config: EzCaptchaConfig): Promise<string> {
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new Error('EzCaptcha API key is required');
  }

  console.log('[EzCaptcha] Starting reCAPTCHA solving process...');

  try {
    // Step 1: Create task
    const taskId = await createCaptchaTask(config);

    // Step 2: Poll for result
    console.log('[EzCaptcha] Waiting for solution...');
    const token = await pollCaptchaResult(config.apiKey, taskId, config.useHighScore || false);

    return token;
  } catch (error) {
    console.error('[EzCaptcha] Error:', error);
    throw error;
  }
}

/**
 * Test EzCaptcha API key validity
 */
export async function testEzCaptchaKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const payload = {
      clientKey: apiKey,
      taskId: '00000000-0000-0000-0000-000000000000' // Dummy task ID to test API key
    };

    const response = await fetch(`${EZCAPTCHA_API_BASE}/getTaskResult`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const data: EzCaptchaResultResponse = await response.json();

    // If error is about invalid task ID, it means API key is valid
    if (data.errorCode === 'ERROR_TASK_NOT_FOUND' || data.errorCode === 'ERROR_INVALID_TASK_ID') {
      return { valid: true };
    }

    // If error is about API key, it's invalid
    if (data.errorCode === 'ERROR_KEY_DOES_NOT_EXIST' || data.errorCode === 'ERROR_ZERO_BALANCE') {
      return { valid: false, error: data.errorDescription };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
