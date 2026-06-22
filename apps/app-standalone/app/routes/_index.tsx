import { useState } from "react";
import {
  AppShell, Group, Text, ActionIcon,
  Tooltip, Badge,
  Box,
} from "@mantine/core";
import {
  IconDownload, IconUpload,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconLogout, IconLogin,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useLoaderData, Form } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { PipelineProvider, usePipeline } from "~/contexts/PipelineContext";
import {
  FileSourceProvider,
  localFileSource,
} from "~/contexts/FileSourceContext";
import { useTapisFileSource } from "~/contexts/TapisFileSource";
import {
  FileSourceSwitcher,
  type FileSourceId,
} from "~/components/editor/FileSourceSwitcher";
import { OpPanel } from "~/components/editor/OpPanel";
import { ImageCanvas } from "~/components/editor/ImageCanvas";
import { PipelineBuilder } from "~/components/pipeline/PipelineBuilder";
import { useImageProcessor } from "~/lib/useImageProcessor";
import { exportPipeline, importPipeline } from "~/lib/pipelineIO";
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

  const tapisLoginUrl = configured
    ? await buildAuthUrl("/")
    : null;

  return {
    hasTapisAuth: tapisToken !== null,
    tapisUsername,
    tapisConfigured: configured,
    tapisSystemId: process.env.TAPIS_SYSTEM_ID ?? "",
    tapisLoginUrl,
  };
}

// ─── Editor shell ─────────────────────────────────────────────────────────────

function EditorShell({
  asideOpen,
  onToggleAside,
  fileBrowserModal,
}: {
  asideOpen: boolean;
  onToggleAside: () => void;
  fileBrowserModal?: React.ReactNode;
}) {
  const {
    currentFile, originalUrl, results,
    isProcessing, processedUrl, handleFileChange,
  } = useImageProcessor();

  return (
    <>
      {fileBrowserModal}
      <AppShell
        header={{ height: 52 }}
        navbar={{ width: 240, breakpoint: "sm" }}
        aside={{
          width: 300,
          breakpoint: "md",
          collapsed: { desktop: !asideOpen },
        }}
        padding={0}
      >
        <AppShell.Navbar p="xs"><OpPanel /></AppShell.Navbar>
        <AppShell.Main>
          <Box style={{ height: "calc(100vh - 52px)", display: "flex", flexDirection: "column" }}>
            <ImageCanvas
              originalUrl={originalUrl}
              processedUrl={processedUrl}
              isProcessing={isProcessing}
              currentFile={currentFile}
              onFileChange={handleFileChange}
            />
          </Box>
        </AppShell.Main>
        <AppShell.Aside p="xs">
          <PipelineBuilder results={results} />
        </AppShell.Aside>
      </AppShell>
    </>
  );
}

// ─── Main editor — owns file source switching ─────────────────────────────────

function Editor() {
  const {
    hasTapisAuth,
    tapisConfigured,
    tapisUsername,
    tapisSystemId,
    tapisLoginUrl,
  } = useLoaderData<typeof loader>();

  const { state, markClean, loadPipeline } = usePipeline();
  const [asideOpen, setAsideOpen] = useState(true);

  // Default to Tapis if authenticated, otherwise local
  const [sourceId, setSourceId] = useState<FileSourceId>(
    hasTapisAuth ? "tapis" : "local"
  );

  const { fileSource: tapisFileSource, FileBrowserModal } = useTapisFileSource({
    defaultSystemId: tapisSystemId,
    // Add more systems here if you have multiple
    systems: tapisSystemId
      ? [{ id: tapisSystemId, label: tapisSystemId }]
      : [],
  });

  // Pick the active file source based on dropdown selection
  const activeSource = sourceId === "tapis" && hasTapisAuth
    ? tapisFileSource
    : localFileSource;

  const handleExport = () => {
    exportPipeline(state.pipeline);
    markClean();
    notifications.show({
      title: "Exported",
      message: "operations.json downloaded",
      color: "green",
    });
  };

  const handleImport = async () => {
    try {
      const pipeline = await importPipeline();
      if (pipeline) {
        loadPipeline(pipeline);
        notifications.show({
          title: "Imported",
          message: pipeline.name,
          color: "blue",
        });
      }
    } catch (e) {
      notifications.show({
        title: "Import failed",
        message: String(e),
        color: "red",
      });
    }
  };

  return (
    <FileSourceProvider source={activeSource}>
      <AppShell
        header={{ height: 52 }}
        navbar={{ width: 240, breakpoint: "sm" }}
        aside={{
          width: 300,
          breakpoint: "md",
          collapsed: { desktop: !asideOpen },
        }}
        padding={0}
      >
        {/* ── Header ── */}
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">

            {/* Left */}
            <Group gap="xs">
              <Text fw={600} size="sm">cv-gui</Text>
              {state.isDirty && (
                <Badge size="xs" color="orange" variant="dot">unsaved</Badge>
              )}
            </Group>

            {/* Centre — file source switcher */}
            <FileSourceSwitcher
              value={sourceId}
              onChange={setSourceId}
              tapisAvailable={hasTapisAuth}
            />

            {/* Right */}
            <Group gap="xs">
              <Tooltip label="Import operations.json">
                <ActionIcon variant="subtle" onClick={handleImport}>
                  <IconUpload size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Export operations.json">
                <ActionIcon
                  variant="subtle"
                  onClick={handleExport}
                  disabled={state.pipeline.steps.length === 0}
                >
                  <IconDownload size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={asideOpen ? "Collapse pipeline" : "Expand pipeline"}>
                <ActionIcon
                  variant="subtle"
                  onClick={() => setAsideOpen(o => !o)}
                >
                  {asideOpen
                    ? <IconLayoutSidebarRightCollapse size={16} />
                    : <IconLayoutSidebarRightExpand size={16} />
                  }
                </ActionIcon>
              </Tooltip>

              {/* Tapis auth */}
              {tapisConfigured && (
                hasTapisAuth ? (
                  <Group gap={4}>
                    {tapisUsername && (
                      <Text size="xs" c="dimmed">{tapisUsername}</Text>
                    )}
                    <Form method="post" action="/auth/logout">
                      <Tooltip label="Sign out of Tapis">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          type="submit"
                        >
                          <IconLogout size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Form>
                  </Group>
                ) : (
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
              )}
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="xs"><OpPanel /></AppShell.Navbar>

        <AppShell.Main>
          <EditorShell
            asideOpen={asideOpen}
            onToggleAside={() => setAsideOpen(o => !o)}
            fileBrowserModal={sourceId === "tapis" ? FileBrowserModal : undefined}
          />
        </AppShell.Main>

        <AppShell.Aside p="xs">
          <PipelineBuilder results={[]} />
        </AppShell.Aside>
      </AppShell>
    </FileSourceProvider>
  );
}

// ─── Route ────────────────────────────────────────────────────────────────────

export default function Index() {
  return (
    <PipelineProvider>
      <Editor />
    </PipelineProvider>
  );
}