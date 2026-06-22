import type { LoaderFunctionArgs } from "react-router";
import {
  buildAuthUrl,
  getTapisToken,
  TAPIS_CONFIGURED,
} from "~/lib/tapis.server";
import { redirect } from "react-router";

/**
 * GET /auth/start
 *
 * Entry point for the OAuth2 flow.
 * If the user already has a token, redirect to home.
 * Otherwise redirect to Tapis login page.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  if (!TAPIS_CONFIGURED) {
    return new Response("Tapis not configured — check your .env file", {
      status: 400,
    });
  }

  // Already logged in — no need to go through the flow again
  const existing = await getTapisToken(request);
  if (existing) return redirect("/");

  // Get the "next" path from query params so we can redirect back after login
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/";

  // Build the Tapis authorize URL with signed state and redirect
  const authUrl = await buildAuthUrl(next);
  return redirect(authUrl);
}