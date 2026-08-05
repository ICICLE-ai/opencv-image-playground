import { useState, useEffect, useCallback } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { usePipeline } from "../contexts/PipelineContext";
import { loadOpenCV } from "./opencv/loader";
import { runPipeline, type RunStep, type StepResult } from "./opencv/runner";
import { saveStoredImage, loadStoredImage } from "./imageStorage";

export type { StepResult };

// Decode an image File into RGBA ImageData (canvas-native, what opencv.js wants).
async function decodeToImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get 2D canvas context");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function useImageProcessor() {
  const { state } = usePipeline();
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [results, setResults] = useState<StepResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Debounce pipeline steps — waits 350ms after the last change before running,
  // so a slider drag doesn't kick off a run on every tick.
  const [debouncedSteps] = useDebouncedValue(state.pipeline.steps, 350);

  // Re-run whenever the debounced steps or the loaded image change.
  useEffect(() => {
    if (!imageData || debouncedSteps.length === 0) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setIsProcessing(true);

    (async () => {
      try {
        const cv = await loadOpenCV();
        // Yield a frame so the spinner paints before the (sync) heavy work.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (cancelled) return;

        const steps: RunStep[] = debouncedSteps.map(({ id, op, params, enabled }) => ({
          id, op, params, enabled,
        }));
        const res = runPipeline(cv, imageData, steps);
        if (!cancelled) setResults(res);
      } catch (err) {
        console.error(err);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedSteps, imageData]);

  // Derive the processed URL — the last successful step's output.
  const lastGood = [...results].reverse().find((r) => r.ok && r.dataUrl);
  const processedUrl = lastGood?.dataUrl ?? null;

  const applyFile = useCallback(async (file: File, url: string) => {
    setCurrentFile(file);
    setOriginalUrl(url);
    setResults([]);
    try {
      setImageData(await decodeToImageData(file));
    } catch (err) {
      console.error(err);
      setImageData(null);
    }
  }, []);

  const handleFileChange = useCallback(async (file: File, url: string) => {
    await applyFile(file, url);
    saveStoredImage(file);
  }, [applyFile]);

  // Restore the last-loaded image (if any) once, after mount — so it
  // survives a page reload or a trip to another route (e.g. /jobs).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const file = await loadStoredImage();
      if (!file || cancelled) return;
      await applyFile(file, URL.createObjectURL(file));
    })();
    return () => {
      cancelled = true;
    };
  }, [applyFile]);

  return {
    currentFile,
    originalUrl,
    results,
    isProcessing,
    processedUrl,
    handleFileChange,
  };
}
