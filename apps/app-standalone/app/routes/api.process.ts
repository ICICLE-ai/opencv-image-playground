import type { ActionFunctionArgs } from "react-router";

const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://localhost:8000";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Proxy the multipart form data directly to FastAPI
  const response = await fetch(`${BRIDGE_URL}/process`, {
    method: "POST",
    body: request.body,
    headers: {
      "content-type": request.headers.get("content-type") ?? "",
    },
    // @ts-expect-error — Node 18+ needs this to stream the body
    duplex: "half",
  });

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}