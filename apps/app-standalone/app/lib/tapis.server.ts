/**
 * tapis.server.ts
 *
 * All Tapis OAuth2 logic — server-side only.
 * Based on the proven pattern from ICICLE Edge Control Plane.
 *
 * Flow:
 *   1. User visits app → no session → redirect to /auth/start
 *   2. /auth/start → redirect to Tapis /v3/oauth2/authorize with signed state
 *   3. User logs in on Tapis → Tapis redirects to /auth/callback?code=xxx&state=xxx
 *   4. /auth/callback → exchange code for token (Basic Auth header)
 *                     → extract username from JWT
 *                     → store in signed session cookie
 *                     → redirect to original page
 */

import { createCookieSessionStorage, redirect } from "react-router";

// ─── Config ───────────────────────────────────────────────────────────────────

const TAPIS_BASE_URL = (process.env.TAPIS_BASE_URL ?? "").replace(/\/$/, "");
const TAPIS_CLIENT_ID = process.env.TAPIS_CLIENT_ID ?? "";
const TAPIS_CLIENT_KEY = process.env.TAPIS_CLIENT_KEY ?? ""; // note: "key" not "secret"
const APP_BASE_URL = (
   process.env.APP_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const APP_SECRET = process.env.APP_SECRET ?? "dev-secret-change-in-production";

// Derived — only one URL to maintain
export const TAPIS_CALLBACK_URL =
   process.env.TAPIS_CALLBACK_URL ?? `${APP_BASE_URL}/auth/callback`;

export const TAPIS_CONFIGURED = Boolean(
   TAPIS_BASE_URL && TAPIS_CLIENT_ID && TAPIS_CLIENT_KEY,
);

// ─── Jobs / app configuration ─────────────────────────────────────────────────
// Defaults for the pre-processing Tapis app. Every value is overridable from the
// submit form; these just pre-fill it.

// Selectable Tapis systems, overridable via TAPIS_SYSTEMS (comma-separated).
const DEFAULT_SYSTEMS = [
   "pitzer-tapis",
   "expanse-tapis",
   "expanse-tapis-static",
   "cardinal-tapis",
   "ascend-tapis",
];

export const JOB_DEFAULTS = {
   appId: process.env.TAPIS_APP_ID ?? "opencv-preprocess",
   appVersion: process.env.TAPIS_APP_VERSION ?? "0.1.0",
   // System that holds the input images / where the pipeline is uploaded.
   sourceSystemId: process.env.TAPIS_SYSTEM_ID ?? "",
   // Where the job runs and where results are archived. Fall back to the
   // source system so a single-system setup works out of the box.
   execSystemId:
      process.env.TAPIS_EXEC_SYSTEM_ID ?? process.env.TAPIS_SYSTEM_ID ?? "",
   archiveSystemId:
      process.env.TAPIS_ARCHIVE_SYSTEM_ID ?? process.env.TAPIS_SYSTEM_ID ?? "",
   // Default SLURM allocation account for scheduler options.
   slurmAccount: process.env.SLURM_ACCOUNT ?? "",
   // Systems offered in the submit-form dropdowns.
   systems: (process.env.TAPIS_SYSTEMS
      ? process.env.TAPIS_SYSTEMS.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_SYSTEMS),
} as const;

// Per-exec-system execution profile.
//   • OSC clusters (Pitzer / Cardinal / Ascend) run jobs out of a /fs/scratch
//     working directory and submit to the "cpu" queue.
//   • Expanse uses the shared "tapisShared" queue and relies on the app's
//     default working directories (no scratch override).
export interface ExecProfile {
   /** True for OSC-style systems — include the /fs/scratch working dirs. */
   isOSC: boolean;
   /** Tapis logical queue to submit to. */
   queue: string;
}

export function execSystemProfile(execSystemId: string): ExecProfile {
   const id = execSystemId.toLowerCase();
   if (id.includes("expanse")) {
      return { isOSC: false, queue: "tapisShared" };
   }
   // Default: OSC-style systems (pitzer, cardinal, ascend, …).
   return { isOSC: true, queue: "cpu" };
}

// The cookie name Tapis sets when a user is already logged in via another
// Tapis application — we check this first before our own session
const TAPIS_COOKIE_NAME = "X-Tapis-Token";

// ─── Session storage ──────────────────────────────────────────────────────────

const sessionStorage = createCookieSessionStorage({
   cookie: {
      name: "tapis_session",
      httpOnly: true,
      secure: APP_BASE_URL.startsWith("https://"),
      sameSite: "lax",
      maxAge: 60 * 60 * 4, // 4 hours — matches Tapis default token lifetime
      secrets: [APP_SECRET],
      path: "/",
   },
});

// ─── State parameter ──────────────────────────────────────────────────────────
// A signed token that survives the round-trip to Tapis.
// Prevents CSRF and remembers where to redirect after login.
// TypeScript equivalent of Python's itsdangerous URLSafeTimedSerializer.

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

interface StatePayload {
   nonce: string; // random value — prevents replay attacks
   next: string; // where to redirect after login
   exp: number; // expiry timestamp
}

/**
 * Build a signed state token using Web Crypto API (available in Node 18+).
 * Signs with HMAC-SHA256 using APP_SECRET.
 */
export async function buildOAuthState(next: string): Promise<string> {
   const payload: StatePayload = {
      nonce: crypto.randomUUID(),
      next: next.startsWith("/") ? next : "/",
      exp: Date.now() + STATE_MAX_AGE_MS,
   };

   const encoder = new TextEncoder();
   const keyData = encoder.encode(APP_SECRET);
   const payloadStr = JSON.stringify(payload);

   const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
   );

   const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payloadStr),
   );

   const sigHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

   // state = base64(payload) + "." + hex(signature)
   const stateToken = `${btoa(payloadStr)}.${sigHex}`;
   return encodeURIComponent(stateToken);
}

/**
 * Verify and parse the state token returned by Tapis.
 * Returns the "next" path or "/" if invalid/expired.
 */
export async function parseOAuthState(state: string): Promise<string> {
   try {
      const decoded = decodeURIComponent(state);
      const [payloadB64, sigHex] = decoded.split(".");
      if (!payloadB64 || !sigHex) return "/";

      const payloadStr = atob(payloadB64);
      const payload: StatePayload = JSON.parse(payloadStr);

      // Check expiry first — fast fail
      if (Date.now() > payload.exp) {
         console.warn("OAuth state token expired");
         return "/";
      }

      // Verify signature
      const encoder = new TextEncoder();
      const keyData = encoder.encode(APP_SECRET);
      const key = await crypto.subtle.importKey(
         "raw",
         keyData,
         { name: "HMAC", hash: "SHA-256" },
         false,
         ["verify"],
      );

      const sigBytes = new Uint8Array(
         sigHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
      );

      const valid = await crypto.subtle.verify(
         "HMAC",
         key,
         sigBytes,
         encoder.encode(payloadStr),
      );

      if (!valid) {
         console.warn("OAuth state token signature invalid");
         return "/";
      }

      const next = payload.next;
      return typeof next === "string" && next.startsWith("/") ? next : "/";
   } catch (err) {
      console.error("Failed to parse OAuth state:", err);
      return "/";
   }
}

// ─── Authorization URL ────────────────────────────────────────────────────────

/**
 * Builds the Tapis OAuth2 authorization URL.
 * Includes the signed state token for CSRF protection.
 */
export async function buildAuthUrl(next = "/"): Promise<string> {
   const state = await buildOAuthState(next);
   const params = new URLSearchParams({
      client_id: TAPIS_CLIENT_ID,
      redirect_uri: TAPIS_CALLBACK_URL, // must match registered callback exactly
      response_type: "code",
      state,
   });
   return `${TAPIS_BASE_URL}/v3/oauth2/authorize?${params}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

/**
 * Exchange the authorization code for a Tapis access token.
 *
 * IMPORTANT: Uses HTTP Basic Auth header (base64(client_id:client_key)),
 * NOT body params. This is the correct Tapis approach per the reference
 * implementation. The client_key never touches the browser.
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
   // Basic Auth: base64(client_id:client_key)
   const credentials = btoa(`${TAPIS_CLIENT_ID}:${TAPIS_CLIENT_KEY}`);

   const response = await fetch(`${TAPIS_BASE_URL}/v3/oauth2/tokens`, {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
         code,
         redirect_uri: TAPIS_CALLBACK_URL,
         grant_type: "authorization_code",
      }),
   });

   if (!response.ok) {
      const text = await response.text();
      throw new Error(
         `Tapis token exchange failed (${response.status}): ${text}`,
      );
   }

   const data = await response.json();

   // Unwrap the Tapis result envelope if present
   const unwrapped = data?.result ?? data;

   return extractAccessToken(unwrapped);
}

/**
 * Handles the various shapes of Tapis token responses.
 * Tapis has changed this format across versions — handle all cases.
 */
function extractAccessToken(data: unknown): string {
   // Already a raw JWT string
   if (typeof data === "string" && data.split(".").length >= 3) {
      return data;
   }

   if (typeof data !== "object" || data === null) {
      throw new Error("Unexpected token response shape");
   }

   const obj = data as Record<string, unknown>;

   for (const key of ["access_token", "accessToken"]) {
      const val = obj[key];
      // access_token is a plain JWT string
      if (typeof val === "string" && val.split(".").length >= 3) {
         return val;
      }
      // access_token is a nested object with its own access_token field
      if (typeof val === "object" && val !== null) {
         const nested =
            (val as Record<string, unknown>)["access_token"] ??
            (val as Record<string, unknown>)["accessToken"];
         if (typeof nested === "string" && nested.split(".").length >= 3) {
            return nested;
         }
      }
   }

   throw new Error(
      `Could not extract access token from response: ${JSON.stringify(data)}`,
   );
}

// ─── JWT decoding ─────────────────────────────────────────────────────────────

/**
 * Decodes the JWT payload without verification.
 * Tapis has already authenticated the user — we just need the claims.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
   try {
      const parts = token.split(".");
      if (parts.length < 2) return {};
      // JWT payload is base64url — convert to standard base64 first
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      return JSON.parse(atob(padded));
   } catch {
      return {};
   }
}

/**
 * Extracts the Tapis username from a JWT.
 * Primary claim: "tapis/username"
 * Fallback: "sub" split on "@" (e.g. "jdoe@tacc" → "jdoe")
 */
export function usernameFromToken(token: string): string {
   const claims = decodeJwtPayload(token);
   const tapisUsername = claims["tapis/username"];
   if (typeof tapisUsername === "string" && tapisUsername) {
      return tapisUsername;
   }
   const sub = claims["sub"];
   if (typeof sub === "string" && sub) {
      return sub.split("@")[0];
   }
   return "unknown";
}

// ─── Token reading ────────────────────────────────────────────────────────────

/**
 * Reads the Tapis JWT, in priority order:
 * 1. The X-Tapis-Token request HEADER — injected by a Tapis auth gateway /
 *    Tapis Pods when `tapis_auth` fronts the app. No OAuth flow needed.
 * 2. The raw X-Tapis-Token cookie (set when logged in via another Tapis app).
 * 3. Our own signed session cookie (set after our OAuth2 flow).
 *
 * With #1 or #2 the user is already authenticated — no client key, no login.
 */
export async function getTapisToken(request: Request): Promise<string | null> {
   // 1. Token injected as a request header by a Tapis gateway / Pod.
   const headerToken = request.headers.get(TAPIS_COOKIE_NAME);
   if (headerToken) return headerToken;

   const cookieHeader = request.headers.get("Cookie") ?? "";

   // 2. Raw Tapis cookie.
   const rawToken = parseCookieValue(cookieHeader, TAPIS_COOKIE_NAME);
   if (rawToken) return rawToken;

   // 3. Our own session.
   const session = await sessionStorage.getSession(cookieHeader);
   return session.get("access_token") ?? null;
}

/**
 * Where the current auth came from:
 *   "tapis"   — an X-Tapis-Token header/cookie managed by Tapis (tapis_auth
 *               gateway / SSO). The app CANNOT sign the user out of this.
 *   "session" — our own OAuth session cookie. The app CAN sign out.
 *   null      — not authenticated.
 */
export type TapisAuthSource = "tapis" | "session" | null;

export async function getTapisAuthSource(
   request: Request,
): Promise<TapisAuthSource> {
   if (request.headers.get(TAPIS_COOKIE_NAME)) return "tapis";

   const cookieHeader = request.headers.get("Cookie") ?? "";
   if (parseCookieValue(cookieHeader, TAPIS_COOKIE_NAME)) return "tapis";

   const session = await sessionStorage.getSession(cookieHeader);
   return session.get("access_token") ? "session" : null;
}

/**
 * Gets the logged-in username — shown in the header UI.
 *
 * If the user arrived with a raw X-Tapis-Token cookie (already authenticated via
 * another Tapis app), there is no session, so we decode the username straight
 * from that token. This is the identity half of "if the X-Tapis-Token cookie is
 * present, skip our own login."
 */
export async function getTapisUsername(
   request: Request,
): Promise<string | null> {
   // Same precedence as getTapisToken: header, then cookie, then session.
   const headerToken = request.headers.get(TAPIS_COOKIE_NAME);
   if (headerToken) return usernameFromToken(headerToken);

   const cookieHeader = request.headers.get("Cookie") ?? "";

   const rawToken = parseCookieValue(cookieHeader, TAPIS_COOKIE_NAME);
   if (rawToken) return usernameFromToken(rawToken);

   const session = await sessionStorage.getSession(cookieHeader);
   return session.get("username") ?? null;
}

/**
 * Parses a specific cookie value from a Cookie header string.
 */
function parseCookieValue(cookieHeader: string, name: string): string | null {
   const match = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`));
   if (!match) return null;
   const value = match.slice(name.length + 1);
   return value ? decodeURIComponent(value) : null;
}

// ─── Session management ───────────────────────────────────────────────────────

/**
 * Stores the token and username in the signed session cookie.
 * Redirects to the next path after storing.
 */
export async function createTokenSession(
   token: string,
   next = "/",
): Promise<Response> {
   const username = usernameFromToken(token);
   const session = await sessionStorage.getSession();

   session.set("access_token", token);
   session.set("username", username);

   return redirect(next, {
      headers: {
         "Set-Cookie": await sessionStorage.commitSession(session),
      },
   });
}

/**
 * Signs the user out and redirects home.
 *
 * Clears BOTH our OAuth session cookie AND the raw X-Tapis-Token SSO cookie —
 * otherwise, since getTapisToken reads X-Tapis-Token first, that cookie would
 * survive session teardown and the user would stay logged in.
 *
 * Note: a token injected as an X-Tapis-Token *header* by a Tapis gateway / Pod
 * cannot be cleared from here — for that setup, sign-out happens at Tapis.
 */
export async function destroyTokenSession(request: Request): Promise<Response> {
   const session = await sessionStorage.getSession(
      request.headers.get("Cookie"),
   );

   const headers = new Headers();
   headers.append("Set-Cookie", await sessionStorage.destroySession(session));
   // Expire the raw Tapis SSO cookie (best-effort — must match its path).
   const secure = APP_BASE_URL.startsWith("https://") ? " Secure;" : "";
   headers.append(
      "Set-Cookie",
      `${TAPIS_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly;${secure} SameSite=Lax`,
   );

   return redirect("/", { headers });
}

// ─── Tapis Files API ──────────────────────────────────────────────────────────

export interface TapisFile {
   name: string;
   path: string;
   size: number;
   type: "file" | "dir";
   mimeType?: string;
}

export async function listTapisFiles(
   token: string,
   systemId: string,
   path = "/",
): Promise<TapisFile[]> {
   // Strip leading slash from path — Tapis adds it between systemId and path
   const cleanPath = path.startsWith("/") ? path : "/" + path;
   const url = `${TAPIS_BASE_URL}/v3/files/ops/${systemId}/${cleanPath}`;

   console.log("Listing Tapis files:", url); // temporary

   const response = await fetch(url, {
      headers: {
         "X-Tapis-Token": token,
         "Content-Type": "application/json",
      },
   });

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tapis files API error (${response.status}): ${text}`);
   }

   const data = await response.json();
   return (data?.result ?? []).map((f: Record<string, unknown>) => ({
      name: String(f.name ?? ""),
      path: String(f.path ?? ""),
      size: Number(f.size ?? 0),
      type: f.type === "dir" ? "dir" : "file",
      mimeType: f.mimeType ? String(f.mimeType) : undefined,
   }));
}

export async function downloadTapisFile(
   token: string,
   systemId: string,
   path: string,
): Promise<Blob> {
   const cleanPath = path.startsWith("/") ? path : "/" + path;
   const url = `${TAPIS_BASE_URL}/v3/files/content/${systemId}/${cleanPath}`;

   console.log("Downloading from Tapis:", url); // temporary — remove after confirming

   const response = await fetch(url, {
      headers: {
         "X-Tapis-Token": token,
         // Tell Tapis we want the raw file, not a JSON listing
         Accept: "application/octet-stream",
      },
   });

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tapis download failed (${response.status}): ${text}`);
   }

   return response.blob();
}

/**
 * Uploads (inserts) a text file to a Tapis system path.
 * Used to stage the exported operations.json pipeline so a job can reference it
 * as a file input. `destPath` is the full destination path including filename.
 */
export async function uploadTapisTextFile(
   token: string,
   systemId: string,
   destPath: string,
   contents: string,
   filename = "operations.json",
): Promise<void> {
   const cleanPath = destPath.startsWith("/") ? destPath : "/" + destPath;
   const url = `${TAPIS_BASE_URL}/v3/files/ops/${systemId}${cleanPath}`;

   const form = new FormData();
   form.append("file", new Blob([contents], { type: "application/json" }), filename);

   const response = await fetch(url, {
      method: "POST",
      headers: { "X-Tapis-Token": token },
      body: form,
   });

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tapis upload failed (${response.status}): ${text}`);
   }
}

// ─── Tapis Jobs API ────────────────────────────────────────────────────────────
// Docs: https://tapis-project.github.io/live-docs/?service=Jobs

export interface TapisJob {
   uuid: string;
   name: string;
   appId: string;
   appVersion: string;
   status: string;
   created: string;
   lastUpdated: string;
   ended?: string;
   remoteOutcome?: string;
   execSystemId?: string;
   archiveSystemId?: string;
   archiveSystemDir?: string;
}

/** Input needed to build and submit a pre-processing job. */
export interface SubmitJobInput {
   name: string;
   appId: string;
   appVersion: string;
   sourceSystemId: string;
   inputDir: string;
   outputDir: string;
   execSystemId: string;
   archiveSystemId: string;
   nodeCount: number;
   coresPerNode: number;
   memoryMB: number;
   maxMinutes: number;
   imageExtensions?: string;
   /** SLURM allocation account, passed as a scheduler option (--account=...). */
   allocationAccount?: string;
   /** The exported pipeline JSON to stage as operations.json. */
   pipelineJson: string;
}

/** Trim, and strip a single leading slash for use inside a tapis:// URL. */
function normalizeDir(path: string): string {
   const trimmed = path.trim();
   return trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Stages the pipeline to the input directory, then submits the Tapis job.
 * Returns the created job's uuid.
 */
export async function submitTapisJob(
   token: string,
   input: SubmitJobInput,
): Promise<string> {
   const inputDir = normalizeDir(input.inputDir);
   const outputDir = normalizeDir(input.outputDir);
   const pipelinePath = `${inputDir}/operations.json`;

   // 1. Stage the pipeline next to the images so a fileInput can reference it.
   await uploadTapisTextFile(
      token,
      input.sourceSystemId,
      pipelinePath,
      input.pipelineJson,
   );

   // 2. Build the job request body (POST /v3/jobs/submit).
   const envVariables = input.imageExtensions?.trim()
      ? [{ key: "IMAGE_EXTENSIONS", value: input.imageExtensions.trim() }]
      : [];

   // SLURM allocation → batch scheduler directive (-A <account>).
   const schedulerOptions = input.allocationAccount?.trim()
      ? [{ name: "slurm account", arg: `-A ${input.allocationAccount.trim()}` }]
      : [];

   // Pass the entrypoint args through the job body so the app definition does
   // not need FIXED appArgs. Paths are relative to the job working dir and match
   // the fileInput targetPaths below (input/, operations.json) and the output dir.
   const appArgs = [
      { name: "input-dir", arg: "--input input" },
      { name: "output-dir", arg: "--output output" },
      { name: "pipeline", arg: "--pipeline operations.json" },
   ];

   // System-specific execution: queue + whether to override the working dirs.
   const profile = execSystemProfile(input.execSystemId);
   const scratchBase =
      "/fs/scratch/" + input.allocationAccount + "/harvest_jobs/${JobUUID}";
   const execDirs = profile.isOSC
      ? {
           execSystemExecDir: scratchBase,
           execSystemInputDir: scratchBase,
           execSystemOutputDir: scratchBase + "/output",
        }
      : {};

   const body = {
      name: input.name,
      appId: input.appId,
      appVersion: input.appVersion,
      description: "Recursive OpenCV pre-processing from the Image Playground",
      execSystemId: input.execSystemId,
      execSystemLogicalQueue: profile.queue,
      archiveSystemId: input.archiveSystemId,
      archiveSystemDir: `${outputDir}`,
      archiveOnAppError: true,
      nodeCount: input.nodeCount,
      coresPerNode: input.coresPerNode,
      memoryMB: input.memoryMB,
      maxMinutes: input.maxMinutes,
      parameterSet: { appArgs, envVariables, schedulerOptions },
      ...execDirs,
      fileInputs: [
         {
            name: "input-images",
            sourceUrl: `tapis://${input.sourceSystemId}/${inputDir}`,
            targetPath: "input",
         },
         {
            name: "pipeline",
            sourceUrl: `tapis://${input.sourceSystemId}/${pipelinePath}`,
            targetPath: "operations.json",
         },
      ],
   };

   const response = await fetch(`${TAPIS_BASE_URL}/v3/jobs/submit`, {
      method: "POST",
      headers: {
         "X-Tapis-Token": token,
         "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
   });

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tapis job submit failed (${response.status}): ${text}`);
   }

   const data = await response.json();
   const uuid = data?.result?.uuid;
   if (typeof uuid !== "string") {
      throw new Error(`Job submitted but no uuid returned: ${JSON.stringify(data)}`);
   }
   return uuid;
}

/** Lists the caller's jobs, most-recently-created first. */
export async function listTapisJobs(
   token: string,
   limit = 50,
): Promise<TapisJob[]> {
   const url =
      `${TAPIS_BASE_URL}/v3/jobs/list` +
      `?limit=${limit}&orderBy=created(desc)&computeTotal=false`;

   const response = await fetch(url, {
      headers: { "X-Tapis-Token": token, "Content-Type": "application/json" },
   });

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tapis jobs list failed (${response.status}): ${text}`);
   }

   const data = await response.json();
   return (data?.result ?? []).map(toTapisJob);
}

/** Cancels a running/queued job. */
export async function cancelTapisJob(token: string, uuid: string): Promise<void> {
   const response = await fetch(`${TAPIS_BASE_URL}/v3/jobs/${uuid}/cancel`, {
      method: "POST",
      headers: { "X-Tapis-Token": token, "Content-Type": "application/json" },
   });

   if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tapis job cancel failed (${response.status}): ${text}`);
   }
}

function toTapisJob(j: Record<string, unknown>): TapisJob {
   return {
      uuid: String(j.uuid ?? ""),
      name: String(j.name ?? ""),
      appId: String(j.appId ?? ""),
      appVersion: String(j.appVersion ?? ""),
      status: String(j.status ?? "UNKNOWN"),
      created: String(j.created ?? ""),
      lastUpdated: String(j.lastUpdated ?? ""),
      ended: j.ended ? String(j.ended) : undefined,
      remoteOutcome: j.remoteOutcome ? String(j.remoteOutcome) : undefined,
      execSystemId: j.execSystemId ? String(j.execSystemId) : undefined,
      archiveSystemId: j.archiveSystemId ? String(j.archiveSystemId) : undefined,
      archiveSystemDir: j.archiveSystemDir ? String(j.archiveSystemDir) : undefined,
   };
}
