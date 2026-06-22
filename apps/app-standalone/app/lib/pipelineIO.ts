import { PipelineSchema, type Pipeline } from "@opencv-image-playground/core";

// Serialize pipeline to JSON and trigger browser download
export function exportPipeline(pipeline: Pipeline): void {
  const json = JSON.stringify(pipeline, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `operations.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Open file picker, read JSON, validate with Zod
export function importPipeline(): Promise<Pipeline | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        const raw = JSON.parse(text);
        const pipeline = PipelineSchema.parse(raw);
        resolve(pipeline);
      } catch (e) {
        reject(new Error(`Invalid pipeline file: ${e}`));
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}