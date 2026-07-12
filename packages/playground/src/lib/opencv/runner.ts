// Runs a pipeline entirely in the browser, mirroring the per-step loop in the
// Python bridge (packages/python-bridge/main.py): each enabled step transforms
// a running "current" image; disabled steps pass through; a failing/unknown op
// is reported without advancing the image. Every step yields a PNG data URL.

import type { ParamValue } from "@opencv-image-playground/core";
import type { CV } from "./loader";
import { JS_OP_MAP } from "./ops";

export interface StepResult {
  id: string;
  ok: boolean;
  dataUrl: string | null;
  error: string | null;
}

export interface RunStep {
  id: string;
  op: string;
  params: Record<string, ParamValue>;
  enabled: boolean;
}

export function runPipeline(cv: CV, imageData: ImageData, steps: RunStep[]): StepResult[] {
  const results: StepResult[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = (cv as any).matFromImageData(imageData); // RGBA
  const canvas = document.createElement("canvas");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const render = (mat: any): string => {
    (cv as any).imshow(canvas, mat);
    return canvas.toDataURL("image/png");
  };

  try {
    for (const step of steps) {
      if (!step.enabled) {
        results.push({ id: step.id, ok: true, dataUrl: render(current), error: null });
        continue;
      }

      const fn = JS_OP_MAP[step.op];
      if (!fn) {
        results.push({ id: step.id, ok: false, dataUrl: null, error: `Unknown op: ${step.op}` });
        continue;
      }

      try {
        const next = fn(cv, current, step.params ?? {});
        current.delete();
        current = next;
        results.push({ id: step.id, ok: true, dataUrl: render(current), error: null });
      } catch (e) {
        // Leave `current` at the last good image so later steps still see it.
        results.push({
          id: step.id,
          ok: false,
          dataUrl: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } finally {
    current.delete();
  }

  return results;
}
