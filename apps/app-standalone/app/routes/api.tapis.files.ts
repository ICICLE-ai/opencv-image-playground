import type { LoaderFunctionArgs } from "react-router";
import { getTapisToken, listTapisFiles } from "~/lib/tapis.server";

/**
 * GET /api/tapis/files?systemId=xxx&path=/some/path
 * Lists files in a Tapis system.
 * Reads the token server-side — never exposes it to the browser.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const token = await getTapisToken(request);
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const systemId = url.searchParams.get("systemId");
  const path = url.searchParams.get("path") ?? "/";

  if (!systemId) {
    return new Response("Missing systemId", { status: 400 });
  }

  try {
    const files = await listTapisFiles(token, systemId, path);
    return new Response(JSON.stringify({ files }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
}