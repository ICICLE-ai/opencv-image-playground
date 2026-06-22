import type { LoaderFunctionArgs } from "react-router";
import { getTapisToken, downloadTapisFile } from "~/lib/tapis.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const token = await getTapisToken(request);
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const systemId = url.searchParams.get("systemId");
  const path     = url.searchParams.get("path");

  if (!systemId || !path) {
    return new Response("Missing systemId or path", { status: 400 });
  }

  // Log what we're downloading for debugging
  console.log(`Tapis download: system=${systemId} path=${path}`);

  try {
    const blob = await downloadTapisFile(token, systemId, path);
    const arrayBuffer = await blob.arrayBuffer();
    const filename = path.split("/").pop() ?? "file";

    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Tapis download error:", err);
    return new Response(String(err), { status: 500 });
  }
}