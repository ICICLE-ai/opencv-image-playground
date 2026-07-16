import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    "react", "react-dom",
    "@mantine/core", "@mantine/hooks", "@mantine/notifications",
    "@icicle-ai/opencv-image-playground-core",
  ],
});
