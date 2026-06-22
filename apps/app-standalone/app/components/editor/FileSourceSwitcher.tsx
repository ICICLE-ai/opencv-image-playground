import { Select, Group, Text } from "@mantine/core";
import { IconDatabase, IconFolder } from "@tabler/icons-react";

export type FileSourceId = "local" | "tapis";

interface Props {
    value: FileSourceId;
    onChange: (value: FileSourceId) => void;
    tapisAvailable: boolean;
}

export function FileSourceSwitcher({ value, onChange, tapisAvailable }: Props) {
    const options = [
        {
            value: "local",
            label: "Local file system",
        },
        ...(tapisAvailable
            ? [{ value: "tapis", label: "Tapis file system" }]
            : []
        ),
    ]

    return (
        <Select
            size="xs"
            value={value}
            onChange={(v) => v && onChange(v as FileSourceId)}
            data={options}
            leftSection={
                value === "tapis"
                    ? <IconDatabase size={12} />
                    : <IconFolder size={12} />
            }
            styles={{
                input: { minWidth: 160 },
            }}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
        />
    );
}