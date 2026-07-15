import { useState, type ReactNode } from "react";
import {
  AppShell, Group, Text, ActionIcon,
  Tooltip, Badge, Box, ThemeIcon,
} from "@mantine/core";
import {
  IconDownload, IconUpload, IconWand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import type { Pipeline } from "@opencv-image-playground/core";
import { PipelineProvider, usePipeline } from "./contexts/PipelineContext";
import {
  FileSourceProvider,
  localFileSource,
  type FileSource,
} from "./contexts/FileSourceContext";
import { FileSourceSwitcher } from "./components/editor/FileSourceSwitcher";
import { OpPanel } from "./components/editor/OpPanel";
import { ImageCanvas } from "./components/editor/ImageCanvas";
import { PipelineBuilder } from "./components/pipeline/PipelineBuilder";
import { useImageProcessor } from "./lib/useImageProcessor";
import { exportPipeline, importPipeline } from "./lib/pipelineIO";

export interface ImagePlaygroundProps {
  /** Pickable file sources; the first is the default. Defaults to [localFileSource]. */
  fileSources?: FileSource[];
  /** Host-owned controls rendered on the right of the header (e.g. auth). */
  headerActions?: ReactNode;
  /** Header title. Defaults to "cv-gui". */
  title?: string;
  /** Pipeline to start from. */
  initialPipeline?: Pipeline;
  /** Called whenever the pipeline changes. */
  onPipelineChange?: (pipeline: Pipeline) => void;
}

// ─── Inner — owns layout, file source switching, and the image processor ──────

function PlaygroundInner({
  fileSources,
  headerActions,
  title,
}: {
  fileSources: FileSource[];
  headerActions?: ReactNode;
  title: string;
}) {
  const { state, markClean, loadPipeline } = usePipeline();
  const [asideOpen, setAsideOpen] = useState(true);
  const [activeSourceId, setActiveSourceId] = useState(fileSources[0].id);

  const activeSource =
    fileSources.find((s) => s.id === activeSourceId) ?? fileSources[0];

  const {
    currentFile, originalUrl, results,
    isProcessing, processedUrl, handleFileChange,
  } = useImageProcessor();

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
        notifications.show({ title: "Imported", message: pipeline.name, color: "blue" });
      }
    } catch (e) {
      notifications.show({ title: "Import failed", message: String(e), color: "red" });
    }
  };

  return (
    <FileSourceProvider source={activeSource}>
      {activeSource.overlay}
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
              <ThemeIcon size={28} radius="md" variant="light" color="indigo">
                <IconWand size={16} />
              </ThemeIcon>
              <Text fw={700} size="sm">{title}</Text>
              {state.isDirty && (
                <Badge size="xs" color="orange" variant="dot">unsaved</Badge>
              )}
            </Group>

            {/* Centre — file source switcher (only when there's a choice) */}
            {fileSources.length > 1 && (
              <FileSourceSwitcher
                sources={fileSources}
                value={activeSourceId}
                onChange={setActiveSourceId}
              />
            )}

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
                <ActionIcon variant="subtle" onClick={() => setAsideOpen((o) => !o)}>
                  {asideOpen
                    ? <IconLayoutSidebarRightCollapse size={16} />
                    : <IconLayoutSidebarRightExpand size={16} />
                  }
                </ActionIcon>
              </Tooltip>

              {headerActions}
            </Group>
          </Group>
        </AppShell.Header>

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
    </FileSourceProvider>
  );
}

// ─── Public component — self-contained editor other services can embed ────────
// Assumes a Mantine <MantineProvider> and <Notifications> are present in the host.

export function ImagePlayground({
  fileSources,
  headerActions,
  title = "cv-gui",
  initialPipeline,
  onPipelineChange,
}: ImagePlaygroundProps) {
  const sources = fileSources && fileSources.length > 0 ? fileSources : [localFileSource];

  return (
    <PipelineProvider initialPipeline={initialPipeline} onChange={onPipelineChange}>
      <PlaygroundInner
        fileSources={sources}
        headerActions={headerActions}
        title={title}
      />
    </PipelineProvider>
  );
}
