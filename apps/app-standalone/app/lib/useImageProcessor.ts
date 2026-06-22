import { useState, useEffect, useCallback } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { usePipeline } from "~/contexts/PipelineContext";

export interface StepResult {
  id: string;
  ok: boolean;
  image_b64: string | null;
  error: string | null;
}

export function useImageProcessor() {
  const { state } = usePipeline();
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [results, setResults] = useState<StepResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Debounce pipeline steps — waits 350ms after last change before sending
  // This prevents a request firing on every single slider tick
  const [debouncedSteps] = useDebouncedValue(state.pipeline.steps, 350);

  const process = useCallback(async (file: File, steps: typeof debouncedSteps) => {
    if (!file || steps.length === 0) {
      setResults([]);
      return;
    }

    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("steps", JSON.stringify(
        steps.map(({ id, op, params, enabled }) => ({ id, op, params, enabled }))
      ));

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Processing failed");

      const data = await response.json();
      setResults(data.steps);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Re-process whenever debounced steps change
  useEffect(() => {
    if (currentFile) {
      process(currentFile, debouncedSteps);
    }
  }, [debouncedSteps, currentFile, process]);

  // Derive the processed URL from results
  // Find the last successful step result
  const lastGood = [...results].reverse().find((r) => r.ok && r.image_b64);
  const processedUrl = lastGood
    ? `data:image/png;base64,${lastGood.image_b64}`
    : null;

  const handleFileChange = useCallback((file: File, url: string) => {
    setCurrentFile(file);
    setOriginalUrl(url);
    setResults([]);
  }, []);

  return {
    currentFile,
    originalUrl,
    results,
    isProcessing,
    processedUrl,
    handleFileChange,
  };
}