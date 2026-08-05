import { useMemo } from "react";
import { Group, Text, ActionIcon, Tooltip } from "@mantine/core";
import { IconLogout, IconLogin, IconServer2 } from "@tabler/icons-react";
import { useLoaderData, Form, Link } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import {
  ImagePlayground,
  localFileSource,
  type FileSource,
} from "@icicle-ai/opencv-image-playground";
import type { Pipeline } from "@icicle-ai/opencv-image-playground-core";
import { useTapisFileSource } from "~/contexts/TapisFileSource";
import { saveStoredPipeline, loadStoredPipeline } from "~/lib/pipelineStorage";
import {
  getTapisToken,
  getTapisUsername,
  getTapisAuthSource,
  buildAuthUrl,
  TAPIS_CONFIGURED,
  JOB_DEFAULTS,
} from "~/lib/tapis.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const tapisToken = await getTapisToken(request);
  const tapisUsername = await getTapisUsername(request);
  const authSource = await getTapisAuthSource(request);
  const configured = TAPIS_CONFIGURED;

  const tapisLoginUrl = configured ? await buildAuthUrl("/") : null;

  return {
    hasTapisAuth: tapisToken !== null,
    tapisUsername,
    tapisConfigured: configured,
    tapisSystemId: process.env.TAPIS_SYSTEM_ID ?? "",
    // Same set of systems the jobs page offers, so the file browser can
    // browse any of them — not just the default TAPIS_SYSTEM_ID.
    tapisSystems: JOB_DEFAULTS.systems,
    tapisLoginUrl,
    // Only our own OAuth session can be signed out. Under tapis_auth the token
    // is managed by the Tapis gateway, so the app can't clear it — hide logout.
    canSignOut: authSource === "session",
  };
}

// ─── Route — thin host that wires Tapis into the reusable <ImagePlayground/> ───

export default function Index() {
  const {
    hasTapisAuth,
    tapisConfigured,
    tapisUsername,
    tapisSystemId,
    tapisSystems,
    tapisLoginUrl,
    canSignOut,
  } = useLoaderData<typeof loader>();

  // Offer every system the jobs page supports. Keep the configured default
  // (if any) so it's pre-selected, and ensure it's present in the list.
  const systems = useMemo(
    () => {
      const ids = tapisSystemId
        ? [tapisSystemId, ...tapisSystems.filter((s) => s !== tapisSystemId)]
        : tapisSystems;
      return ids.map((id) => ({ id, label: id }));
    },
    [tapisSystemId, tapisSystems],
  );

  const { fileSource: tapisFileSource, FileBrowserModal } = useTapisFileSource({
    defaultSystemId: tapisSystemId,
    systems,
  });

  // Local source is always available; Tapis is offered (with its own file
  // browser modal riding along as the source's overlay) once authenticated.
  const fileSources = useMemo<FileSource[]>(() => {
    const sources: FileSource[] = [localFileSource];
    if (hasTapisAuth) {
      sources.push({ ...tapisFileSource, overlay: FileBrowserModal });
    }
    return sources;
  }, [hasTapisAuth, tapisFileSource, FileBrowserModal]);

  // Auth state — not app configuration — drives the header. A user arriving with
  // an X-Tapis-Token cookie is authenticated without OAuth, so Jobs + Logout must
  // show even when TAPIS_CLIENT_KEY (needed only for the login exchange) is unset.
  // Login is offered only when OAuth is configured AND the user is not yet authed
  // (so it's hidden whenever an X-Tapis-Token is available).
  const headerActions = hasTapisAuth
    ? (
      <Group gap={4}>
        <Tooltip label="Tapis batch jobs">
          <ActionIcon variant="subtle" component={Link} to="/jobs">
            <IconServer2 size={16} />
          </ActionIcon>
        </Tooltip>
        {tapisUsername && <Text size="xs" c="dimmed">{tapisUsername}</Text>}
        {canSignOut && (
          <Form method="post" action="/auth/logout">
            <Tooltip label="Sign out of Tapis">
              <ActionIcon variant="subtle" color="red" type="submit">
                <IconLogout size={16} />
              </ActionIcon>
            </Tooltip>
          </Form>
        )}
      </Group>
    )
    : tapisConfigured && tapisLoginUrl
      ? (
        <Tooltip label="Sign in with Tapis">
          <ActionIcon
            variant="subtle"
            color="teal"
            component="a"
            href={tapisLoginUrl}
          >
            <IconLogin size={16} />
          </ActionIcon>
        </Tooltip>
      )
      : null;

  return (
    <ImagePlayground
      fileSources={fileSources}
      headerActions={headerActions}
      restorePipeline={() => loadStoredPipeline<Pipeline>()}
      onPipelineChange={saveStoredPipeline}
    />
  );
}
