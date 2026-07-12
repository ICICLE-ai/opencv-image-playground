import {
  Paper, Group, Text, ActionIcon,
  Collapse, Stack, Switch, Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconGripVertical, IconTrash,
  IconChevronDown, IconChevronUp,
  IconAlertCircle, IconCheck,
} from "@tabler/icons-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { OP_REGISTRY , type PipelineStep} from "@opencv-image-playground/core";
import { usePipeline } from "../../contexts/PipelineContext";
import { ParamEditor } from "../params/ParamEditor";

interface StepResult {
  id: string;
  ok: boolean;
  error: string | null;
}

interface Props {
  step: PipelineStep;
  index: number;
  result: StepResult | null;
}

export function PipelineStepCard({ step, index, result }: Props) {
  const { removeStep, toggleStep } = usePipeline();
  const [paramsOpen, { toggle: toggleParams }] = useDisclosure(false);
  const opDef = OP_REGISTRY[step.op];
  const hasParams = opDef && Object.keys(opDef.params).length > 0;

  // dnd-kit — makes this card draggable
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      withBorder
      p="xs"
      radius="sm"
      opacity={step.enabled ? 1 : 0.5}
    >
      <Group gap="xs" wrap="nowrap">

        {/* Drag handle */}
        <ActionIcon
          variant="transparent"
          color="gray"
          size="sm"
          style={{ cursor: "grab" }}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical size={14} />
        </ActionIcon>

        {/* Step number */}
        <Text size="xs" c="dimmed" w={16} ta="center">
          {index + 1}
        </Text>

        {/* Op name */}
        <Text size="xs" fw={500} style={{ flex: 1 }}>
          {opDef?.name ?? step.op}
        </Text>

        {/* Status indicator */}
        {result && (
          <Tooltip label={result.error ?? "OK"} disabled={result.ok}>
            <ActionIcon
              variant="transparent"
              size="xs"
              color={result.ok ? "green" : "red"}
            >
              {result.ok
                ? <IconCheck size={12} />
                : <IconAlertCircle size={12} />
              }
            </ActionIcon>
          </Tooltip>
        )}

        {/* Enable / disable toggle */}
        <Switch
          size="xs"
          checked={step.enabled}
          onChange={() => toggleStep(step.id)}
        />

        {/* Expand params */}
        {hasParams && (
          <ActionIcon variant="subtle" size="sm" onClick={toggleParams}>
            {paramsOpen
              ? <IconChevronUp size={14} />
              : <IconChevronDown size={14} />
            }
          </ActionIcon>
        )}

        {/* Remove */}
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          onClick={() => removeStep(step.id)}
        >
          <IconTrash size={14} />
        </ActionIcon>

      </Group>

      {/* Param editor — collapses in and out */}
      {hasParams && (
        <Collapse expanded={paramsOpen}>
          <Stack gap="xs" pt="xs" pl={32}>
            <ParamEditor step={step} opDef={opDef} />
          </Stack>
        </Collapse>
      )}
    </Paper>
  );
}
