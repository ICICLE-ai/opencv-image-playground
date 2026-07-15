/**
 * Client-side handoff of the current pipeline from the editor to the /jobs page.
 * The editor persists on every change; the jobs page reads it to pre-fill the
 * pipeline it uploads with a submitted job.
 */

export const PIPELINE_STORAGE_KEY = "oimp.currentPipeline";

export function saveStoredPipeline(pipeline: unknown): void {
  try {
    localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(pipeline));
  } catch {
    // localStorage may be unavailable (private mode, SSR) — non-fatal.
  }
}

export function loadStoredPipeline<T = unknown>(): T | null {
  try {
    const raw = localStorage.getItem(PIPELINE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
