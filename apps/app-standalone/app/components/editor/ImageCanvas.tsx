import { useCallback, useRef, useState } from "react";
import {
  Box, Center, Group, Image, Loader,
  Stack, Text, Button, Overlay,
  Tooltip,
  ActionIcon,
} from "@mantine/core";
import { IconUpload, IconPhoto, IconZoomIn, IconZoomReset, IconZoomOut, IconArrowsMinimize, IconArrowsMaximize } from "@tabler/icons-react";
import { useFileSource } from "~/contexts/FileSourceContext";
import { set } from "zod/v4";

interface StepResult {
  id: string;
  ok: boolean;
  image_b64: string | null;
  error: string | null;
}

interface Props {
  originalUrl: string | null;
  processedUrl: string | null;
  isProcessing: boolean;
  currentFile: File | null;
  onFileChange: (file: File, url: string) => void;
}

type ExpandedPanel = "both" | "original" | "processed"

interface ZoomState {
    scale: number;
    x: number;
    y: number;
}

const MIN_SCALE = 1;
const MAX_SCLAE = 8;
const ZOOM_STEP = 0.4;

export function ImageCanvas({
  originalUrl,
  processedUrl,
  isProcessing,
  currentFile,
  onFileChange,
}: Props) {
  const fileSource = useFileSource();
  const [expanded, setExpanded] = useState<ExpandedPanel>("both");
  const [zoom, setZoom] = useState<ZoomState>({scale: 1, x: 0, y: 0});
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y:0 });

  const handleUpload = async () => {
    const file = await fileSource.pickFile();
    if (!file) return;
    const url = URL.createObjectURL(file);
    onFileChange(file, url);
    setZoom({ scale: 1, x: 0, y: 0 });
  };

  const zoomIn = () => 
    setZoom((z) => ({ ...z, scale: Math.min(MAX_SCLAE, z.scale + ZOOM_STEP)}));

  const zoomOut = () => 
    setZoom((z) => ({ 
        scale: Math.max(MIN_SCALE, z.scale - ZOOM_STEP),
        //Reset pan when zooming back to 1
        x: z.scale - ZOOM_STEP <= MIN_SCALE ? 0 : z.x,
        y: z.scale - ZOOM_STEP <= MIN_SCALE ? 0 : z.y
    }));

  const zoomReset = () => setZoom({ scale: 1, x: 0, y: 0});

  // ----- Pan handlers ------------------------

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom.scale <= 1) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX - zoom.x, y: e.clientY - zoom.y}
    e.preventDefault();
  }, [zoom]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setZoom((z) => ({
        ...z,
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y
    }))
  }, []);

  const onMouseUp = useCallback(() => {
    isPanning.current  = false;
  }, []);
  
  // --------------------------------------------

  // -------- Scroll to zoom -------------------
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => {
        const next = Math.min(MAX_SCLAE, Math.max(MIN_SCALE, z.scale + delta));
        return {
            scale: next,
            x: next === 1 ? 0 : z.x,
            y: next === 1 ? 0 : z.y
        }
    })
  } , [])
  // -------------------------------------------

  // ---- Image style (shared between both panels) ---------------

  const imgStyle: React.CSSProperties = {
    transform: `scale(${zoom.scale} translate(${zoom.x / zoom.scale}px, ${zoom.y / zoom.scale}px))`,
    transformOrigin: "center center",
    transition: isPanning.current ? "none" : "transform 0.1s ease",
    cursor: zoom.scale > 1 ? "grab" : "default",
    maxWidth: "100%",
    display: "block",
  }

  // --------- Toggle panel expansion -----------------------------

  const togglePanel = (panel: "original" | "processed") => {
    setExpanded((current) => {
        if (current === "both") return panel;
        if (current === panel) return "both";
        return panel;
    })
  }

  // ----------------------------------------------


  // No image loaded yet — show upload prompt
  if (!originalUrl) {
    return (
      <Center h="100%">
        <Stack align="center" gap="md">
          <IconPhoto size={48} color="gray" />
          <Text c="dimmed" size="sm">No image loaded</Text>
          <Button
            leftSection={<IconUpload size={14} />}
            onClick={handleUpload}
          >
            Open image
          </Button>
        </Stack>
      </Center>
    );
  }

  const showOriginal = expanded === "both" || expanded === "original";
  const showProcessed = expanded === "both" || expanded === "processed";

  return (
    <Box 
        h="100%" 
        style={{ display: "flex", flexDirection: "column" }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
    >

      {/* Toolbar */}
      <Group
        px="md"
        py={6}
        gap={"xs"}
        style={{ borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}
      >
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconUpload size={12} />}
          onClick={handleUpload}
        >
          Change image
        </Button>
        {currentFile && (
          <Text size="xs" c="dimmed" style={{ flex: 1 }}>
            {currentFile.name} · {(currentFile.size / 1024).toFixed(0)} KB
          </Text>
        )}
        {/* Zoom Controls */}
        <Tooltip label="Zoom out"><ActionIcon variant="subtle" size="sm" onClick={zoomOut} disabled={zoom.scale <= MIN_SCALE}><IconZoomOut size={14} /></ActionIcon></Tooltip>
        <Text size="xs" c="dimmed" w={36} ta="center">{Math.round(zoom.scale * 100)}%</Text>
        <Tooltip label="Zoom in"><ActionIcon variant="subtle" size="sm" onClick={zoomIn} disabled={zoom.scale >= MAX_SCLAE}><IconZoomIn size={14} /></ActionIcon></Tooltip>
        <Tooltip label="Reset zoom"><ActionIcon variant="subtle" size="sm" onClick={zoomReset} disabled={zoom.scale === 1}><IconZoomReset size={14} /></ActionIcon></Tooltip>
      </Group>

      {/* Side by side view */}
      <Group
        align="stretch"
        gap={0}
        style={{ flex: 1, overflow: "hidden", minHeight: 0 }}
        wrap="nowrap"
        onWheel={onWheel}
      >
        {/* Original */}
        {showOriginal && (
          <Box
            style={{
              flex: expanded === "original" ? 1 : "1 1 50%",
              overflow: "hidden",
              borderRight: showProcessed
                ? "1px solid var(--mantine-color-default-border)"
                : undefined,
              display: "flex",
              flexDirection: "column",
              minHeight: 0
            }}
          >
            {/* Panel header */}
            <Group
              px="xs"
              py={4}
              justify="space-between"
              style={{ borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}
            >
              <Text size="xs" c="dimmed">Original</Text>
              <Tooltip label={expanded === "original" ? "Show both" : "Expand"}>
                <ActionIcon variant="subtle" size="xs" onClick={() => togglePanel("original")}>
                  {expanded === "original"
                    ? <IconArrowsMinimize size={12} />
                    : <IconArrowsMaximize size={12} />
                  }
                </ActionIcon>
              </Tooltip>
            </Group>

            {/* Image */}
            <Box
              style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}
              onMouseDown={onMouseDown}
            >
              <img
                src={originalUrl}
                alt="Original"
                style={imgStyle}
                draggable={false}
              />
            </Box>
          </Box>
        )}

        {/* Processed */}
        {showProcessed && (
          <Box
            style={{
              flex: expanded === "processed" ? 1 : "1 1 50%",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              minHeight: 0
            }}
          >
            {/* Panel header */}
            <Group
              px="xs"
              py={4}
              justify="space-between"
              style={{ borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}
            >
              <Text size="xs" c="dimmed">Processed</Text>
              <Tooltip label={expanded === "processed" ? "Show both" : "Expand"}>
                <ActionIcon variant="subtle" size="xs" onClick={() => togglePanel("processed")}>
                  {expanded === "processed"
                    ? <IconArrowsMinimize size={12} />
                    : <IconArrowsMaximize size={12} />
                  }
                </ActionIcon>
              </Tooltip>
            </Group>

            {/* Image */}
            <Box
              style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}
              onMouseDown={onMouseDown}
            >
              {processedUrl ? (
                <>
                  <img
                    src={processedUrl}
                    alt="Processed"
                    style={imgStyle}
                    draggable={false}
                  />
                  {isProcessing && (
                    <Overlay backgroundOpacity={0.3} blur={2} style={{ position: "absolute" }}>
                      <Center h="100%"><Loader size="sm" /></Center>
                    </Overlay>
                  )}
                </>
              ) : (
                <Center h="100%">
                  {isProcessing
                    ? <Loader size="sm" />
                    : <Text size="xs" c="dimmed">Add a step to see output</Text>
                  }
                </Center>
              )}
            </Box>
          </Box>
        )}
      </Group>
    </Box>
  );
}