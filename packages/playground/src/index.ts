// Public API for @icicle-ai/opencv-image-playground.
// Drop <ImagePlayground/> into any Mantine app (needs MantineProvider +
// Notifications in the host tree) to get the full client-side OpenCV editor.

export { ImagePlayground } from "./ImagePlayground";
export type { ImagePlaygroundProps } from "./ImagePlayground";

export {
  FileSourceProvider,
  useFileSource,
  localFileSource,
} from "./contexts/FileSourceContext";
export type { FileSource, RemoteFile } from "./contexts/FileSourceContext";

export { PipelineProvider, usePipeline } from "./contexts/PipelineContext";

export type { StepResult } from "./lib/useImageProcessor";
