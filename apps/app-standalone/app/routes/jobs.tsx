import { useEffect, useRef, useState } from "react";
import {
  Container, Title, Text, Paper, Grid, TextInput, NumberInput, Button,
  Table, Badge, Group, Stack, Alert, Code, Anchor, Divider, Tooltip,
  ActionIcon, ScrollArea, Select, ThemeIcon, Center,
} from "@mantine/core";
import {
  IconArrowLeft, IconRefresh, IconX, IconAlertCircle, IconCheck,
  IconServer2, IconRocket, IconInbox,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import {
  useLoaderData, useActionData, useNavigation, useRevalidator,
  Form, Link, redirect, data,
} from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import {
  getTapisToken, getTapisUsername, buildAuthUrl, TAPIS_CONFIGURED,
  JOB_DEFAULTS, listTapisJobs, submitTapisJob, cancelTapisJob,
  type TapisJob,
} from "~/lib/tapis.server";
import { isJobActive } from "~/lib/jobStatus";
import { loadStoredPipeline } from "~/lib/pipelineStorage";

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  if (!TAPIS_CONFIGURED) throw redirect("/");

  const token = await getTapisToken(request);
  // Requirement: an X-Tapis-Token cookie counts as auth (getTapisToken prefers
  // it). Only when there's no token at all do we send the user through login.
  if (!token) throw redirect(await buildAuthUrl("/jobs"));

  const username = await getTapisUsername(request);

  let jobs: TapisJob[] = [];
  let jobsError: string | null = null;
  try {
    // Only show pre-processing jobs from our app.
    jobs = (await listTapisJobs(token)).filter(
      (j) => j.appId === JOB_DEFAULTS.appId,
    );
  } catch (err) {
    jobsError = String(err);
  }

  return { jobs, jobsError, username, defaults: JOB_DEFAULTS };
}

// ─── Action — submit a new job or cancel an existing one ──────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const token = await getTapisToken(request);
  if (!token) return data({ ok: false, error: "Not authenticated" }, { status: 401 });

  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "cancel") {
    const uuid = String(form.get("uuid") ?? "");
    if (!uuid) return data({ ok: false, error: "Missing job uuid" }, { status: 400 });
    try {
      await cancelTapisJob(token, uuid);
      return data({ ok: true, message: "Cancellation requested" });
    } catch (err) {
      return data({ ok: false, error: String(err) }, { status: 500 });
    }
  }

  if (intent === "submit") {
    const pipelineJson = String(form.get("pipelineJson") ?? "");
    if (!pipelineJson) {
      return data(
        { ok: false, error: "No pipeline found. Build one in the editor first." },
        { status: 400 },
      );
    }

    const num = (key: string, fallback: number) => {
      const v = Number(form.get(key));
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };

    try {
      const uuid = await submitTapisJob(token, {
        name: String(form.get("name") || `opencv-preprocess-${Date.now()}`),
        // appId/appVersion are fixed server-side, not user-editable.
        appId: JOB_DEFAULTS.appId,
        appVersion: JOB_DEFAULTS.appVersion,
        sourceSystemId: String(form.get("sourceSystemId") ?? ""),
        inputDir: String(form.get("inputDir") ?? ""),
        outputDir: String(form.get("outputDir") ?? ""),
        execSystemId: String(form.get("execSystemId") ?? ""),
        archiveSystemId: String(form.get("archiveSystemId") ?? ""),
        nodeCount: num("nodeCount", 1),
        coresPerNode: num("coresPerNode", 1),
        memoryMB: num("memoryMB", 4096),
        maxMinutes: num("maxMinutes", 120),
        imageExtensions: String(form.get("imageExtensions") ?? ""),
        allocationAccount: String(form.get("allocationAccount") ?? ""),
        pipelineJson,
      });
      return data({ ok: true, message: `Job submitted: ${uuid}` });
    } catch (err) {
      return data({ ok: false, error: String(err) }, { status: 500 });
    }
  }

  return data({ ok: false, error: "Unknown action" }, { status: 400 });
}

// ─── Status badge colours ─────────────────────────────────────────────────────

function statusColor(status: string): string {
  if (status === "FINISHED") return "green";
  if (status === "FAILED") return "red";
  if (status === "CANCELLED") return "gray";
  if (status === "RUNNING" || status === "ARCHIVING") return "blue";
  return "yellow"; // PENDING / QUEUED / STAGING_* / etc.
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const { jobs, jobsError, username, defaults } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();

  const submitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "submit";

  // The pipeline built in the editor, handed over via localStorage.
  const [pipeline, setPipeline] = useState<{ name?: string; steps?: unknown[] } | null>(null);
  const [pipelineJson, setPipelineJson] = useState("");
  useEffect(() => {
    const p = loadStoredPipeline<{ name?: string; steps?: unknown[] }>();
    if (p) {
      setPipeline(p);
      setPipelineJson(JSON.stringify(p));
    }
  }, []);

  const enabledSteps =
    pipeline?.steps?.filter((s) => (s as { enabled?: boolean }).enabled !== false)
      .length ?? 0;

  // Surface action results as notifications.
  const lastActionRef = useRef<unknown>(null);
  useEffect(() => {
    if (!actionData || actionData === lastActionRef.current) return;
    lastActionRef.current = actionData;
    if ("message" in actionData) {
      notifications.show({ title: "Success", message: actionData.message, color: "green", icon: <IconCheck size={16} /> });
      revalidator.revalidate();
    } else {
      notifications.show({ title: "Error", message: actionData.error, color: "red", icon: <IconAlertCircle size={16} /> });
    }
  }, [actionData, revalidator]);

  // Auto-refresh the job list while any job is still active.
  const hasActive = jobs.some((j) => isJobActive(j.status));
  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 8000);
    return () => clearInterval(id);
  }, [hasActive, revalidator]);

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" align="center" mb="xl" wrap="nowrap">
        <Group gap="sm" align="center" wrap="nowrap">
          <Tooltip label="Back to editor">
            <ActionIcon variant="subtle" size="lg" color="gray" component={Link} to="/" aria-label="Back to editor">
              <IconArrowLeft size={18} />
            </ActionIcon>
          </Tooltip>
          <ThemeIcon size={42} radius="md" variant="light" color="indigo">
            <IconServer2 size={22} />
          </ThemeIcon>
          <div>
            <Title order={3}>Tapis batch jobs</Title>
            <Text size="sm" c="dimmed">
              Submit and monitor recursive OpenCV pre-processing jobs
            </Text>
          </div>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {username && (
            <Badge variant="light" color="gray" size="lg" radius="sm">{username}</Badge>
          )}
          <Tooltip label="Refresh">
            <ActionIcon
              variant="light"
              size="lg"
              onClick={() => revalidator.revalidate()}
              loading={revalidator.state === "loading"}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* ── Submit form ── */}
      <Paper withBorder p="lg" radius="md" mb="xl">
        <Group gap="xs" mb="md">
          <ThemeIcon variant="light" size="md" radius="md" color="indigo">
            <IconRocket size={16} />
          </ThemeIcon>
          <Title order={4}>Submit pre-processing job</Title>
        </Group>

        {pipeline ? (
          <Alert color="blue" variant="light" mb="md" icon={<IconCheck size={16} />}>
            Pipeline <b>{pipeline.name ?? "Untitled"}</b> — {enabledSteps} enabled step(s).
            This pipeline (operations.json) will be uploaded to the input system and
            applied to every image in every subdirectory.
          </Alert>
        ) : (
          <Alert color="orange" variant="light" mb="md" icon={<IconAlertCircle size={16} />}>
            No pipeline found. <Anchor component={Link} to="/">Build one in the editor</Anchor> first —
            it is carried over automatically.
          </Alert>
        )}

        <Form method="post">
          <input type="hidden" name="intent" value="submit" />
          <input type="hidden" name="pipelineJson" value={pipelineJson} />

          <Stack gap="sm">
            <Grid>
              <Grid.Col span={12}>
                <TextInput
                  name="name" label="Job name"
                  placeholder={`opencv-preprocess-${Date.now()}`}
                />
              </Grid.Col>
            </Grid>

            <Divider label="Data" labelPosition="left" />
            <Grid>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Select
                  name="sourceSystemId" label="Source system"
                  data={defaults.systems} defaultValue={defaults.sourceSystemId}
                  required allowDeselect={false} searchable
                  description="System holding the input images"
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput
                  name="inputDir" label="Input directory" required
                  placeholder="/path/to/images"
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput
                  name="outputDir" label="Output directory" required
                  placeholder="/path/to/results"
                  description="Processed images archived here"
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Select
                  name="archiveSystemId" label="Archive (output) system"
                  data={defaults.systems} defaultValue={defaults.archiveSystemId}
                  required allowDeselect={false} searchable
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput
                  name="imageExtensions" label="Image extensions"
                  placeholder=".jpg,.jpeg,.png,.bmp,.tiff,.tif"
                  description="Optional — leave blank for defaults"
                />
              </Grid.Col>
            </Grid>

            <Divider label="Compute parameters" labelPosition="left" />
            <Grid>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Select
                  name="execSystemId" label="Exec system"
                  data={defaults.systems} defaultValue={defaults.execSystemId}
                  required allowDeselect={false} searchable
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput
                  name="allocationAccount" label="Allocation account (SLURM)"
                  defaultValue={defaults.slurmAccount}
                  placeholder="e.g. PAS2699"
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 1 }}>
                <NumberInput name="nodeCount" label="Nodes" defaultValue={1} min={1} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 1 }}>
                <NumberInput name="coresPerNode" label="Cores" defaultValue={1} min={1} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 1 }}>
                <NumberInput name="memoryMB" label="Mem (MB)" defaultValue={4096} min={256} step={256} />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 1 }}>
                <NumberInput name="maxMinutes" label="Minutes" defaultValue={120} min={1} />
              </Grid.Col>
            </Grid>

            <Group justify="flex-end" mt="md">
              <Button
                type="submit"
                size="md"
                leftSection={<IconRocket size={16} />}
                loading={submitting}
                disabled={!pipeline}
              >
                Submit job
              </Button>
            </Group>
          </Stack>
        </Form>
      </Paper>

      {/* ── Jobs table ── */}
      <Group gap="xs" mb="sm">
        <Title order={4}>Your jobs</Title>
        {jobs.length > 0 && (
          <Badge variant="light" color="gray" radius="sm">{jobs.length}</Badge>
        )}
      </Group>

      {jobsError ? (
        <Alert color="red" radius="md" icon={<IconAlertCircle size={16} />}>{jobsError}</Alert>
      ) : jobs.length === 0 ? (
        <Paper withBorder radius="md" py={48}>
          <Center>
            <Stack align="center" gap={6}>
              <ThemeIcon variant="light" color="gray" size={48} radius="xl">
                <IconInbox size={24} />
              </ThemeIcon>
              <Text c="dimmed" size="sm">No pre-processing jobs yet</Text>
              <Text c="dimmed" size="xs">Submit one above to see it here</Text>
            </Stack>
          </Center>
        </Paper>
      ) : (
        <Paper withBorder radius="md">
          <ScrollArea>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md" miw={720}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>App</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Last updated</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {jobs.map((job) => (
                  <Table.Tr key={job.uuid}>
                    <Table.Td>
                      <Text size="sm" fw={600}>{job.name}</Text>
                      <Code fz={10} c="dimmed">{job.uuid}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(job.status)} variant="dot">
                        {job.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" fw={500}>{job.appId}</Text>
                      <Text size="xs" c="dimmed">{job.appVersion}</Text>
                    </Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{formatDate(job.created)}</Text></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{formatDate(job.lastUpdated)}</Text></Table.Td>
                    <Table.Td>
                      {isJobActive(job.status) && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="cancel" />
                          <input type="hidden" name="uuid" value={job.uuid} />
                          <Tooltip label="Cancel job">
                            <ActionIcon type="submit" variant="light" color="red" aria-label="Cancel">
                              <IconX size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Form>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      )}
    </Container>
  );
}
