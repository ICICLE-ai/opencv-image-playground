import { useMemo } from "react";
import { Group, Text, ActionIcon, Tooltip } from "@mantine/core";
import { IconLogout, IconLogin, IconServer2 } from "@tabler/icons-react";
import { useLoaderData, Form, Link } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import {
  ImagePlayground,
  localFileSource,
  type FileSource,
} from "@opencv-image-playground/playground";
import { useTapisFileSource } from "~/contexts/TapisFileSource";
import { saveStoredPipeline } from "~/lib/pipelineStorage";
import {
  getTapisToken,
  getTapisUsername,
  buildAuthUrl,
  TAPIS_CONFIGURED,
} from "~/lib/tapis.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const tapisToken = await getTapisToken(request);
  const tapisUsername = await getTapisUsername(request);
  const configured = TAPIS_CONFIGURED;

  const tapisLoginUrl = configured ? await buildAuthUrl("/") : null;

  return {
    hasTapisAuth: tapisToken !== null,
    tapisUsername,
    tapisConfigured: configured,
    tapisSystemId: process.env.TAPIS_SYSTEM_ID ?? "",
    tapisLoginUrl,
  };
}

// ─── Route — thin host that wires Tapis into the reusable <ImagePlayground/> ───

export default function Index() {
  const {
    hasTapisAuth,
    tapisConfigured,
    tapisUsername,
    tapisSystemId,
    tapisLoginUrl,
  } = useLoaderData<typeof loader>();

  const { fileSource: tapisFileSource, FileBrowserModal } = useTapisFileSource({
    defaultSystemId: tapisSystemId,
    systems: tapisSystemId ? [{ id: tapisSystemId, label: tapisSystemId }] : [],
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

  const headerActions = tapisConfigured
    ? hasTapisAuth
      ? (
        <Group gap={4}>
          <Tooltip label="Tapis batch jobs">
            <ActionIcon variant="subtle" component={Link} to="/jobs">
              <IconServer2 size={16} />
            </ActionIcon>
          </Tooltip>
          {tapisUsername && <Text size="xs" c="dimmed">{tapisUsername}</Text>}
          <Form method="post" action="/auth/logout">
            <Tooltip label="Sign out of Tapis">
              <ActionIcon variant="subtle" color="red" type="submit">
                <IconLogout size={16} />
              </ActionIcon>
            </Tooltip>
          </Form>
        </Group>
      )
      : (
        <Tooltip label="Sign in with Tapis">
          <ActionIcon
            variant="subtle"
            color="teal"
            component="a"
            href={tapisLoginUrl ?? "#"}
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
      onPipelineChange={saveStoredPipeline}
    />
  );
}
