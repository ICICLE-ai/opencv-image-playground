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
 * Reads the Tapis JWT from either:
 * 1. The raw X-Tapis-Token cookie (set by Tapis when user is already logged in)
 * 2. Our own signed session cookie (set after our OAuth2 flow)
 *
 * Checks #1 first — if the user is already authenticated via Tapis,
 * no need to go through the OAuth2 flow again.
 */
export async function getTapisToken(request: Request): Promise<string | null> {
   const cookieHeader = request.headers.get("Cookie") ?? "";

   // 1. Check for raw Tapis cookie
   const rawToken = parseCookieValue(cookieHeader, TAPIS_COOKIE_NAME);
   if (rawToken) return rawToken;

   // 2. Check our own session
   const session = await sessionStorage.getSession(cookieHeader);
   return session.get("access_token") ?? null;
}

/**
 * Gets the logged-in username — shown in the header UI.
 */
export async function getTapisUsername(
   request: Request,
): Promise<string | null> {
   const cookieHeader = request.headers.get("Cookie") ?? "";
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
 * Destroys the session cookie and redirects to home.
 */
export async function destroyTokenSession(request: Request): Promise<Response> {
   const session = await sessionStorage.getSession(
      request.headers.get("Cookie"),
   );
   return redirect("/", {
      headers: {
         "Set-Cookie": await sessionStorage.destroySession(session),
      },
   });
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
   const cleanPath = path.startsWith("/") ? path.slice(1) : path;
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
   // returns the file contents directly
   const url = `${TAPIS_BASE_URL}/v3/files/ops/${systemId}${path}`;

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
