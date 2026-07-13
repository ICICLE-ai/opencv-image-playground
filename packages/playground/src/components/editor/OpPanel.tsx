import { ScrollArea, Text, Stack, Button, Accordion, Group, ThemeIcon } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { OP_CATEGORIES, getOpsByCategory } from "@opencv-image-playground/core";
import { usePipeline } from "../../contexts/PipelineContext";
import { categoryMeta } from "../../lib/categoryMeta";

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
                radius="md"
            >
                {OP_CATEGORIES.map((category) => {
                    const ops = getOpsByCategory(category);
                    if (ops.length === 0) return null;
                    const meta = categoryMeta(category);
                    const Icon = meta.icon;
                    return (
                        <Accordion.Item value={category} key={category}>
                            <Accordion.Control>
                                <Group gap="xs">
                                    <ThemeIcon variant="light" color={meta.color} size="sm" radius="md">
                                        <Icon size={14} />
                                    </ThemeIcon>
                                    <Text size="sm" fw={600}>
                                        {meta.label}
                                    </Text>
                                    <Text size="xs" c="dimmed">{ops.length}</Text>
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap={2}>
                                    {ops.map(([key, def]) => (
                                        <Button
                                            key={key}
                                            variant="subtle"
                                            color="gray"
                                            size="xs"
                                            justify="start"
                                            fullWidth
                                            title={def.description}
                                            leftSection={<IconPlus size={12} />}
                                            onClick={() => addStep(key)}
                                            styles={{ label: { fontWeight: 500 } }}
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
