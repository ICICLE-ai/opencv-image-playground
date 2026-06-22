import { useState, useCallback, useRef } from "react";
import {
  Modal, Stack, Text, Button, Group,
  Breadcrumbs, Anchor, LoadingOverlay,
  ScrollArea, Table, ActionIcon, Badge,
  TextInput, Select, Divider, Alert,
  Box,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconFolder, IconPhoto, IconArrowUp,
  IconAlertCircle, IconRefresh, IconSearch,
} from "@tabler/icons-react";
import type { FileSource } from "./FileSourceContext";

interface TapisFile {
  name: string;
  path: string;
  size: number;
  type: "file" | "dir";
}

interface TapisSystem {
  id: string;
  label: string;
}

// Image extensions we accept
const IMAGE_EXTS = /\.(jpg|jpeg|png|bmp|tiff|tif|webp|gif)$/i;

interface Props {
  // Default system to show in the dropdown
  defaultSystemId?: string;
  // List of systems to show in the dropdown
  // If not provided we fetch from Tapis
  systems?: TapisSystem[];
}

export function useTapisFileSource({ defaultSystemId = "", systems = [] }: Props) {
  const [opened, { open, close }] = useDisclosure(false);

  // ── State ──────────────────────────────────────────────────────────────────
  const [systemId, setSystemId]     = useState(defaultSystemId);
  const [currentPath, setCurrentPath] = useState("/");
  const [manualPath, setManualPath]   = useState("");
  const [files, setFiles]             = useState<TapisFile[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Holds the resolve function of the current pickFile() Promise
  const resolveRef = useRef<((f: File | null) => void) | null>(null);

  // ── Load files ─────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async (sysId: string, path: string) => {
    if (!sysId) {
      setError("Please select a Tapis system first");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Normalise path — must start with /
      const normPath = path.startsWith("/") ? path : `/${path}`;

      const res = await fetch(
        `/api/tapis/files?systemId=${encodeURIComponent(sysId)}&path=${encodeURIComponent(normPath)}`
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }

      const data = await res.json();
      const items: TapisFile[] = (data.files ?? []);

      // Sort: directories first, then files alphabetically
      items.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === "dir" ? -1 : 1;
      });

      setFiles(items);
      setCurrentPath(normPath);
      setManualPath(normPath);
    } catch (err) {
      setError(String(err));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Handle system change ────────────────────────────────────────────────────
  const handleSystemChange = (value: string | null) => {
    if (!value) return;
    setSystemId(value);
    setFiles([]);
    setCurrentPath("/");
    setManualPath("/");
    setError(null);
    loadFiles(value, "/");
  };

  // ── Navigate into a directory ───────────────────────────────────────────────
  // This was the bug — the old code set state but then called loadFiles
  // with the OLD currentPath. We now pass the path directly to loadFiles.
  const navigateTo = useCallback((path: string) => {
    loadFiles(systemId, path);
  }, [systemId, loadFiles]);

  // ── Navigate up one level ───────────────────────────────────────────────────
  const navigateUp = () => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    const parent = parts.length === 0 ? "/" : `/${parts.join("/")}`;
    navigateTo(parent);
  };

  // ── Handle manual path input ────────────────────────────────────────────────
  const handleManualNavigate = () => {
    if (manualPath) navigateTo(manualPath);
  };

  // ── Select a file ───────────────────────────────────────────────────────────
  const handleSelect = async (file: TapisFile) => {
    // If directory — navigate into it
    if (file.type === "dir") {
      navigateTo(file.path);
      return;
    }

    // Only accept images
    if (!IMAGE_EXTS.test(file.name)) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/tapis/download?systemId=${encodeURIComponent(systemId)}&path=${encodeURIComponent(file.path)}`
      );

      if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);

      const blob = await res.blob();
      const tapisFile = new File([blob], file.name, {
        type: blob.type || "image/jpeg",
      });

      resolveRef.current?.(tapisFile);
      close();
    } catch (err) {
      setError(`Failed to download: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Cancel ──────────────────────────────────────────────────────────────────
  const handleCancel = () => {
    resolveRef.current?.(null);
    close();
  };

  // ── Open modal ──────────────────────────────────────────────────────────────
  const handleOpen = () => {
    // Load files if a system is already selected
    if (systemId) loadFiles(systemId, currentPath);
    open();
  };

  // ── Breadcrumbs ─────────────────────────────────────────────────────────────
  const breadcrumbs = currentPath
    .split("/")
    .filter(Boolean)
    .map((segment, i, arr) => ({
      label: segment,
      path: `/${arr.slice(0, i + 1).join("/")}`,
    }));

  // ── FileSource interface ────────────────────────────────────────────────────
  const fileSource: FileSource = {
    id: "tapis",
    label: "Tapis file system",
    pickFile: () =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        handleOpen();
      }),
  };

  // ── Modal ───────────────────────────────────────────────────────────────────
  const FileBrowserModal = (
    <Modal
      opened={opened}
      onClose={handleCancel}
      title="Browse Tapis files"
      size="xl"
      styles={{ body: { padding: 0 } }}
    >
      <Stack gap={0}>

        {/* ── System selector + path input ── */}
        <Stack gap="sm" p="md">
          {/* System dropdown */}
          <Select
            label="Tapis system"
            placeholder="Select a system..."
            value={systemId || null}
            onChange={handleSystemChange}
            data={
              systems.length > 0
                ? systems.map(s => ({ value: s.id, label: s.label }))
                : systemId
                  ? [{ value: systemId, label: systemId }]
                  : []
            }
            searchable
          />

          {/* Manual path input */}
          <TextInput
            label="Path"
            placeholder="/home/username/images"
            value={manualPath}
            onChange={(e) => setManualPath(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualNavigate();
            }}
            rightSection={
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={handleManualNavigate}
                disabled={!systemId}
              >
                <IconSearch size={14} />
              </ActionIcon>
            }
          />
        </Stack>

        <Divider />

        {/* ── Navigation bar ── */}
        <Group px="md" py="xs" gap="xs">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={navigateUp}
            disabled={currentPath === "/" || !systemId}
            title="Go up one level"
          >
            <IconArrowUp size={14} />
          </ActionIcon>

          {/* Breadcrumbs */}
          <Breadcrumbs separator="/" style={{ flex: 1, overflow: "hidden" }}>
            <Anchor
              size="xs"
              onClick={() => navigateTo("/")}
              style={{ cursor: "pointer" }}
            >
              root
            </Anchor>
            {breadcrumbs.map((crumb) => (
              <Anchor
                key={crumb.path}
                size="xs"
                onClick={() => navigateTo(crumb.path)}
                style={{ cursor: "pointer" }}
              >
                {crumb.label}
              </Anchor>
            ))}
          </Breadcrumbs>

          {/* Refresh */}
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => loadFiles(systemId, currentPath)}
            disabled={!systemId}
            title="Refresh"
          >
            <IconRefresh size={14} />
          </ActionIcon>
        </Group>

        <Divider />

        {/* ── Error ── */}
        {error && (
          <Alert
            icon={<IconAlertCircle size={14} />}
            color="red"
            m="md"
            py="xs"
          >
            {error}
          </Alert>
        )}

        {/* ── File list ── */}
        <Box style={{ position: "relative", minHeight: 320 }}>
          <LoadingOverlay visible={loading} />
          <ScrollArea h={360}>
            {!systemId ? (
              <Text size="xs" c="dimmed" ta="center" py="xl">
                Select a Tapis system to browse files
              </Text>
            ) : files.length === 0 && !loading && !error ? (
              <Text size="xs" c="dimmed" ta="center" py="xl">
                Empty folder
              </Text>
            ) : (
              <Table highlightOnHover>
                <Table.Tbody>
                  {files.map((file) => {
                    const isImage = IMAGE_EXTS.test(file.name);
                    const isDir   = file.type === "dir";
                    const canClick = isDir || isImage;

                    return (
                      <Table.Tr
                        key={file.path}
                        style={{
                          cursor: canClick ? "pointer" : "default",
                          opacity: canClick ? 1 : 0.4,
                        }}
                        onClick={() => canClick && handleSelect(file)}
                      >
                        {/* Icon */}
                        <Table.Td w={32}>
                          {isDir
                            ? <IconFolder size={16} color="var(--mantine-color-yellow-6)" />
                            : <IconPhoto  size={16} color="var(--mantine-color-blue-6)"   />
                          }
                        </Table.Td>

                        {/* Name */}
                        <Table.Td>
                          <Text size="sm" fw={isDir ? 500 : 400}>
                            {file.name}
                          </Text>
                        </Table.Td>

                        {/* Size / badge */}
                        <Table.Td w={100} ta="right">
                          {isDir && (
                            <Badge size="xs" color="yellow" variant="light">
                              folder
                            </Badge>
                          )}
                          {!isDir && isImage && (
                            <Badge size="xs" color="blue" variant="light">
                              {(file.size / 1024).toFixed(0)} KB
                            </Badge>
                          )}
                          {!isDir && !isImage && (
                            <Badge size="xs" color="gray" variant="light">
                              not an image
                            </Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </ScrollArea>
        </Box>

        <Divider />

        {/* ── Footer ── */}
        <Group justify="flex-end" p="md">
          <Button variant="subtle" size="xs" onClick={handleCancel}>
            Cancel
          </Button>
        </Group>

      </Stack>
    </Modal>
  );

  return { fileSource, FileBrowserModal };
}