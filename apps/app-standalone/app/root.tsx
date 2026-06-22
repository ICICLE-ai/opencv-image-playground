import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { theme } from "~/lib/theme";
import { getTapisToken } from "~/lib/tapis.server";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

// ─── Loader — runs server-side on every request ───────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const tapisToken = await getTapisToken(request);
  return {
    hasTapisAuth: tapisToken !== null,
    tapisBaseUrl: process.env.TAPIS_BASE_URL ?? "",
    tapisConfigured: Boolean(process.env.TAPIS_CLIENT_ID),
  };
}

export type RootLoader = typeof loader;

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <ColorSchemeScript />
        <Meta />
        <Links />
      </head>
      <body>
        <MantineProvider theme={theme}>
          <Notifications position="top-right" />
          <Outlet />
        </MantineProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}