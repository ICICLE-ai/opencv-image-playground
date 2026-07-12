import { createContext, useContext, type ReactNode } from "react";

// -------------- Interfaces -------------------------------
// Defines what a FileSource should look like and must be capable of doing.
// Any deployment mode implements this - components never know which one.

export interface FileSource {
    id: string;
    label: string;
    pickFile: () => Promise<File | null>;
    // Optional UI (e.g. a file-browser modal) that must be mounted while this
    // source is active. ImagePlayground renders the active source's overlay so
    // hosts can bundle a picker with its source instead of wiring it separately.
    overlay?: ReactNode;
}

export interface RemoteFile {
    name: string;
    path: string;
    size: number;
    type: "file" | "dir";
    mimeType?: string;
}

// -------------- Implementations ------------------------
// This is the implementation for the "local" deployment mode, which picks a file from the user's computer.

export const localFileSource: FileSource = {
    id: "local",
    label: "Local file system",
    pickFile: async () =>
        new Promise((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = () => resolve(input.files?.[0] ?? null);
            input.oncancel = () => resolve(null);
            input.click();
        })
}

// -------------- Context -------------------------------

const FileSourceContext = createContext<FileSource | null>(null);
export function FileSourceProvider({
    source,
    children,
}: {
    source: FileSource;
    children: ReactNode;
}) {
    return (
        <FileSourceContext.Provider value={source}>
            {children}
        </FileSourceContext.Provider>
    );
}


export function useFileSource(): FileSource {
    const context = useContext(FileSourceContext);
    if (!context) {
        throw new Error("useFileSource must be used within a FileSourceProvider");
    }
    return context;
}
