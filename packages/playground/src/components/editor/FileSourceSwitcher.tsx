import { Select } from "@mantine/core";
import { IconFolder } from "@tabler/icons-react";

interface SourceOption {
    id: string;
    label: string;
}

interface Props {
    sources: SourceOption[];
    value: string;
    onChange: (value: string) => void;
}

export function FileSourceSwitcher({ sources, value, onChange }: Props) {
    return (
        <Select
            size="xs"
            value={value}
            onChange={(v) => v && onChange(v)}
            data={sources.map((s) => ({ value: s.id, label: s.label }))}
            leftSection={<IconFolder size={12} />}
            styles={{
                input: { minWidth: 160 },
            }}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
        />
    );
}
