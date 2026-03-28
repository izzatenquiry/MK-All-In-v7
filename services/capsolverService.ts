/**
 * CapSolver Service
 * Integrates with capsolver.com API to solve reCAPTCHA v3 Enterprise tokens
 * Alternative provider to anti-captcha.com and ez-captcha.com
 * Documentation: https://docs.capsolver.com/en/api/
 */

const CAPSOLVER_API_BASE = 'https://api.capsolver.com';
const RECAPTCHA_SITE_KEY = '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV';
const RECAPTCHA_PAGE_ACTION = 'FLOW_GENERATION';

// Poll settings
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 60; // 2 minutes total

export interface CapSolverConfig {
  apiKey: string;
  projectId?: string; // Optional: custom project ID for tracking
  minScore?: number; // Minimum score (0.1 to 0.9), default 0.9
}

export interface CapSolverTaskResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  taskId?: string;
}

export interface CapSolverResultResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
  status: 'processing' | 'ready';
  solution?: {
    gRecaptchaResponse: string;
    token?: string; // Alternative field name
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
 * Create reCAPTCHA solving task on capsolver.com
 */
async function createCaptchaTask(config: CapSolverConfig): Promise<string> {
  const projectId = config.projectId || generateProjectId();
  const websiteURL = `https://labs.google/fx/tools/flow/project/${projectId}`;
  const minScore = config.minScore || 0.9; // Default to 0.9 for high quality

  const payload = {
    clientKey: config.apiKey,
    task: {
      type: 'ReCaptchaV3TaskProxyLess',
      websiteURL: websiteURL,
      websiteKey: RECAPTCHA_SITE_KEY,
      pageAction: RECAPTCHA_PAGE_ACTION,
      minScore: minScore // CapSolver supports minScore parameter
    }
  };

  console.log('[CapSolver] Creating task with URL:', websiteURL);
  console.log('[CapSolver] 🔍 Task configuration:', {
    taskType: 'ReCaptchaV3TaskProxyLess',
    minScore: minScore,
    pageAction: RECAPTCHA_PAGE_ACTION,
    websiteKey: RECAPTCHA_SITE_KEY.substring(0, 20) + '...'
  });

  const response = await fetch(`${CAPSOLVER_API_BASE}/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  const data: CapSolverTaskResponse = await response.json();

  if (data.errorId > 0) {
    throw new Error(`CapSolver error: ${data.errorDescription || data.errorCode || 'Unknown error'}`);
  }

  if (!data.taskId) {
    throw new Error('CapSolver: No taskId received');
  }

  console.log('[CapSolver] Task created, ID:', data.taskId);
  return data.taskId;
}

/**
 * Get result of reCAPTCHA solving task
 */
async function getCaptchaResult(apiKey: string, taskId: string): Promise<CapSolverResultResponse> {
  const payload = {
    clientKey: apiKey,
    taskId: taskId
  };

  const response = await fetch(`${CAPSOLVER_API_BASE}/getTaskResult`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  const data: CapSolverResultResponse = await response.json();

  if (data.errorId > 0) {
    throw new Error(`CapSolver error: ${data.errorDescription || data.errorCode || 'Unknown error'}`);
  }

  return data;
}

/**
 * Poll for captcha result until ready or timeout
 */
async function pollCaptchaResult(apiKey: string, taskId: string, minScore: number = 0.9): Promise<string> {
  const startTime = Date.now();
  
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    // Wait before polling (except first attempt)
    if (attempt > 1) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }

    console.log(`[CapSolver] Polling attempt ${attempt}/${MAX_POLL_ATTEMPTS}...`);

    const result = await getCaptchaResult(apiKey, taskId);

    if (result.status === 'ready' && result.solution) {
      // CapSolver may return token in either gRecaptchaResponse or token field
      const token = result.solution.gRecaptchaResponse || result.solution.token;
      
      if (!token) {
        throw new Error('CapSolver: No token in solution');
      }

      const solveDuration = (Date.now() - startTime) / 1000; // Duration in seconds
      
      console.log('[CapSolver] ✅ Token received!');
      console.log('[CapSolver] 🔍 Token quality details:', {
        length: token.length,
        firstChars: token.substring(0, 30),
        lastChars: token.substring(token.length - 30),
        minScore: minScore,
        solveDurationSeconds: solveDuration.toFixed(2),
        tokenQuality: solveDuration < 5 ? '✅ FAST (High Quality)' : solveDuration < 10 ? '⚠️ MEDIUM' : '❌ SLOW (May be low quality)'
      });
      
      // Warn if solve duration is too long
      if (solveDuration > 10) {
        console.warn('[CapSolver] ⚠️ Token generation took', solveDuration.toFixed(2), 'seconds - may indicate low quality token');
      }
      
      return token;
    }

    if (result.status !== 'processing') {
      throw new Error(`Unexpected status: ${result.status}`);
    }
  }

  throw new Error('CapSolver timeout: Maximum polling attempts reached');
}

/**
 * Main function: Solve reCAPTCHA and return token
 * @param config - CapSolver configuration
 * @returns reCAPTCHA token string
 */
export async function solveCaptcha(config: CapSolverConfig): Promise<string> {
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new Error('CapSolver API key is required');
  }

  console.log('[CapSolver] Starting reCAPTCHA solving process...');

  try {
    // Step 1: Create task
    const taskId = await createCaptchaTask(config);

    // Step 2: Poll for result
    console.log('[CapSolver] Waiting for solution...');
    const token = await pollCaptchaResult(config.apiKey, taskId, config.minScore || 0.9);

    return token;
  } catch (error) {
    console.error('[CapSolver] Error:', error);
    throw error;
  }
}

/**
 * Test CapSolver API key validity
 */
export async function testCapSolverKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // Test by trying to get balance or create a dummy task
    const payload = {
      clientKey: apiKey,
      taskId: '00000000-0000-0000-0000-000000000000' // Dummy task ID to test API key
    };

    const response = await fetch(`${CAPSOLVER_API_BASE}/getTaskResult`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const data: CapSolverResultResponse = await response.json();

    // If error is about invalid task ID, it means API key is valid
    if (data.errorCode === 'ERROR_TASK_NOT_FOUND' || data.errorCode === 'ERROR_INVALID_TASK_ID') {
      return { valid: true };
    }

    // If error is about API key, it's invalid
    if (data.errorCode === 'ERROR_KEY_DOES_NOT_EXIST' || data.errorCode === 'ERROR_ZERO_BALANCE' || data.errorCode === 'ERROR_KEY_INVALID') {
      return { valid: false, error: data.errorDescription };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
