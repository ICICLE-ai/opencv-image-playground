import { Slider, Switch, Select, Stack, Text, Group } from "@mantine/core";
import type { PipelineStep, OpDef, ParamDef, ParamValue } from "@icicle-ai/opencv-image-playground-core";
import { usePipeline } from "../../contexts/PipelineContext";

interface Props {
  step: PipelineStep;
  opDef: OpDef;
}

export function ParamEditor({ step, opDef }: Props) {
  const { updateParam } = usePipeline();

  return (
    <Stack gap="sm">
      {Object.entries(opDef.params).map(([key, def]) => (
        <ParamControl
          key={key}
          paramKey={key}
          def={def}
          value={step.params[key] ?? def.default}
          onChange={(val) => updateParam(step.id, key, val)}
        />
      ))}
    </Stack>
  );
}

interface ControlProps {
  paramKey: string;
  def: ParamDef;
  value: ParamValue;
  onChange: (val: ParamValue) => void;
}

function ParamControl({ def, value, onChange }: ControlProps) {
  switch (def.type) {

    case "int":
    case "float": {
      const numVal = typeof value === "number" ? value : def.default;
      return (
        <Stack gap={4}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">{def.label}</Text>
            <Text size="xs" fw={500}>{numVal}</Text>
          </Group>
          <Slider
            min={def.min}
            max={def.max}
            step={def.step}
            value={numVal}
            onChange={(v) => onChange(v)}
            size="xs"
            label={null}
          />
        </Stack>
      );
    }

    case "bool":
      return (
        <Switch
          label={def.label}
          size="xs"
          checked={typeof value === "boolean" ? value : def.default}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
      );

    case "enum":
      return (
        <Select
          label={def.label}
          size="xs"
          value={typeof value === "string" ? value : def.default}
          onChange={(v) => v && onChange(v)}
          data={def.options.map((o) => ({ label: o.label, value: o.value }))}
        />
      );

    default:
      return null;
  }
}
