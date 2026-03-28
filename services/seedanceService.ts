/**
 * Seedance 2.0 API service.
 * Create task → poll query until completed/failed.
 * Base URL can be overridden when official API is available.
 */

const SEEDANCE_API_BASE_URL = 'https://api.xskill.ai';

export type SeedanceFunctionMode = 'omni_reference' | 'first_last_frames';
export type SeedanceRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
export type SeedanceSpeedMode = 'seedance_2.0_fast' | 'seedance_2.0';

export interface SeedanceCreateParams {
  prompt: string;
  functionMode?: SeedanceFunctionMode;
  ratio?: SeedanceRatio;
  duration?: number; // 4-15
  speedMode?: SeedanceSpeedMode;
  /** Omni Reference: reference image URLs (max 9). Use @image_file_1 etc in prompt. */
  image_files?: string[];
  /** Omni Reference: reference video URLs (max 3). */
  video_files?: string[];
  /** Omni Reference: reference audio URLs (max 3). */
  audio_files?: string[];
  /** First/Last Frames: 0 = text-to-video, 1 = first frame, 2 = first + last frame. */
  filePaths?: string[];
}

export interface SeedanceCreateResponse {
  code: number;
  data?: { task_id: string; price?: number };
  message?: string;
}

export interface SeedanceQueryResponse {
  code: number;
  data?: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: { output?: { images?: string[] } };
    message?: string;
  };
  message?: string;
}

function getBaseUrl(): string {
  return (typeof process !== 'undefined' && process.env?.REACT_APP_SEEDANCE_API_BASE_URL) || SEEDANCE_API_BASE_URL;
}

/**
 * Create a Seedance 2.0 video generation task.
 * Returns task_id for polling.
 */
export async function createSeedanceTask(
  params: SeedanceCreateParams,
  apiKey: string,
  onStatusUpdate?: (msg: string) => void
): Promise<{ taskId: string }> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/v3/tasks/create`;
  onStatusUpdate?.('Submitting to Seedance 2.0...');

  const body: Record<string, unknown> = {
    model: 'st-ai/super-seed2',
    params: {
      model: params.speedMode ?? 'seedance_2.0_fast',
      prompt: params.prompt,
      functionMode: params.functionMode ?? 'omni_reference',
      ratio: params.ratio ?? '16:9',
      duration: params.duration ?? 5,
    },
  };

  const p = (body.params as Record<string, unknown>);
  if (params.image_files?.length) p.image_files = params.image_files;
  if (params.video_files?.length) p.video_files = params.video_files;
  if (params.audio_files?.length) p.audio_files = params.audio_files;
  if (params.filePaths?.length) p.filePaths = params.filePaths;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as SeedanceCreateResponse;
  if (json.code !== 200 || !json.data?.task_id) {
    const msg = json.message || json.data?.task_id || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return { taskId: json.data.task_id };
}

/**
 * Query task status. When status is 'completed', result.output.images[0] is the video URL.
 */
export async function querySeedanceTask(
  taskId: string,
  apiKey: string,
  onStatusUpdate?: (msg: string) => void
): Promise<SeedanceQueryResponse['data']> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/v3/tasks/query`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({ task_id: taskId }),
  });

  const json = (await res.json()) as SeedanceQueryResponse;
  if (json.code !== 200) {
    const msg = json.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const status = json.data?.status;
  if (status === 'processing' || status === 'pending') {
    onStatusUpdate?.('Generating video...');
  } else if (status === 'completed') {
    onStatusUpdate?.('Completed');
  } else if (status === 'failed') {
    onStatusUpdate?.('Failed');
  }

  return json.data;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // ~10 min at 5s

/**
 * Create task and poll until completed or failed. Returns video URL or throws.
 */
export async function generateSeedanceVideo(
  params: SeedanceCreateParams,
  apiKey: string,
  onStatusUpdate?: (msg: string) => void
): Promise<string> {
  const { taskId } = await createSeedanceTask(params, apiKey, onStatusUpdate);
  onStatusUpdate?.('Task created. Waiting for result...');

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const data = await querySeedanceTask(taskId, apiKey, onStatusUpdate);
    if (data?.status === 'completed') {
      const videoUrl = data.result?.output?.images?.[0];
      if (videoUrl) return videoUrl;
      throw new Error('Completed but no video URL in response');
    }
    if (data?.status === 'failed') {
      throw new Error(data?.message || 'Task failed');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Timeout waiting for video');
}

/**
 * Upload image to our backend temp storage; returns a public URL (TTL 3 min).
 * Use this URL in createSeedanceTask params (filePaths or image_files).
 */
export async function uploadImageForSeedance(
  serverBaseUrl: string,
  base64: string,
  mimeType: string
): Promise<{ url: string }> {
  const base = serverBaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/seedance/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mimeType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload failed: ${res.status}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data?.url) throw new Error('No URL in upload response');
  return { url: data.url };
}
