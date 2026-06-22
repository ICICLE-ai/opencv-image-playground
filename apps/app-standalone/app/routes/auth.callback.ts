import type { LoaderFunctionArgs } from "react-router";
import {
  exchangeCodeForToken,
  createTokenSession,
  parseOAuthState,
  TAPIS_CONFIGURED,
} from "~/lib/tapis.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (!TAPIS_CONFIGURED) {
    return new Response("Tapis not configured", { status: 400 });
  }

  const url = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error");

  if (error) {
    console.error("Tapis auth error:", error);
    return new Response(`Auth error: ${error}`, { status: 400 });
  }

  if (!code) {
    return new Response("Missing authorization code", { status: 400 });
  }

  // Parse signed state — gets the "next" path to redirect to after login
  const next = await parseOAuthState(state);

  try {
    const token = await exchangeCodeForToken(code);
    return createTokenSession(token, next);
  } catch (err) {
    console.error("Token exchange failed:", err);
    return new Response(
      `Authentication failed: ${err}. Please try again.`,
      { status: 500 }
    );
  }
}