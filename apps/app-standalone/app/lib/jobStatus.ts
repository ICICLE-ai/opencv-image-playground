/**
 * Tapis job status helpers — safe to use on both server and client (no secrets,
 * no server-only imports), unlike tapis.server.ts.
 */

// Non-terminal states — a job in one of these can still be cancelled.
const ACTIVE_JOB_STATUSES = new Set([
  "PENDING", "PROCESSING_INPUTS", "STAGING_INPUTS", "STAGING_JOB",
  "SUBMITTING_JOB", "QUEUED", "RUNNING", "ARCHIVING", "BLOCKED", "PAUSED",
]);

export function isJobActive(status: string): boolean {
  return ACTIVE_JOB_STATUSES.has(status);
}
