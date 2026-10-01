export type AnalysisProgress = { phase: 'uploading' | 'waiting'; percent: number | null };
export function analysisRequest(url: string, body: string, options?: {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (progress: AnalysisProgress) => void;
  createXHR?: () => XMLHttpRequest;
}): Promise<{ ok: boolean; status: number; text: string; contentType: string }>;
