import { ScrollArea, Text, Stack, Button, Accordion } from "@mantine/core";
import { OP_CATEGORIES, getOpsByCategory } from "@opencv-image-playground/core";
import { usePipeline } from "../../contexts/PipelineContext";

const CATEGORY_LABELS: Record<string, string> = {
    filter: "Filter",
    edge: "Edge detection",
    threshold: "Thresholding",
    morphology: "Morphology",
    color: "Color space",
    geometry: "Geometric transform"
}

export function OpPanel() {
    const { addStep } = usePipeline();

    return (
        <ScrollArea h="100%" type="hover">
            <Text size="xs" c="dimmed" mb="xs" px={4}>
                Click an operation to add it to the pipeline
            </Text>
            <Accordion
                multiple
                defaultValue={["filter", "edge"]}
                variant="separated"
                radius="sm"
            >
                {OP_CATEGORIES.map((category) => {
                    const ops = getOpsByCategory(category);
                    if (ops.length === 0) return null;
                    return (
                        <Accordion.Item value={category} key={category}>
                            <Accordion.Control>
                                <Text size="sm" fw={500}>
                                    {CATEGORY_LABELS[category] || category}
                                </Text>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap={4}>
                                    {ops.map(([key, def]) => (
                                        <Button
                                            key={key}
                                            variant="subtle"
                                            size="xs"
                                            justify="start"
                                            fullWidth
                                            title={def.description}
                                            onClick={() => addStep(key)}
                                        >
                                            {def.name}
                                        </Button>
                                    ))}
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    )
                })}
            </Accordion>
        </ScrollArea>
    );
}
