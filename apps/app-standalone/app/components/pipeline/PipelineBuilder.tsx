import { ScrollArea, Stack, Text, Center, ThemeIcon } from "@mantine/core";
import { IconRoute } from "@tabler/icons-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { usePipeline } from "~/contexts/PipelineContext";
import { PipelineStepCard } from "./PipelineStepCard";

interface StepResult {
  id: string;
  ok: boolean;
  error: string | null;
}

interface Props {
  results: StepResult[];
}

export function PipelineBuilder({ results }: Props) {
  const { state, reorderSteps } = usePipeline();
  const { steps } = state.pipeline;

  // dnd-kit sensors — handles both mouse and keyboard dragging
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);

    const reordered = [...steps];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    reorderSteps(reordered);
  }

  if (steps.length === 0) {
    return (
      <Center h="100%">
        <Stack align="center" gap="xs">
          <ThemeIcon variant="light" color="gray" size="xl" radius="xl">
            <IconRoute size={20} />
          </ThemeIcon>
          <Text size="xs" c="dimmed" ta="center">
            Add operations from the left panel
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <ScrollArea h="100%" type="hover">
      <Text size="xs" c="dimmed" mb="xs">
        {steps.length} step{steps.length !== 1 ? "s" : ""} · drag to reorder
      </Text>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={steps.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <Stack gap="xs">
            {steps.map((step, index) => (
              <PipelineStepCard
                key={step.id}
                step={step}
                index={index}
                result={results.find((r) => r.id === step.id) ?? null}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
    </ScrollArea>
  );
}