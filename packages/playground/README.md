# @icicle-ai/opencv-image-playground

A drop-in React component — `<ImagePlayground>` — for building and previewing
OpenCV image pre-processing pipelines in the browser. Chain operations (blur,
threshold, edges, morphology, colour, geometry), preview them live on an image,
and import/export the pipeline as `operations.json`.

The processing runs **client-side** via [`@techstark/opencv-js`](https://www.npmjs.com/package/@techstark/opencv-js) —
no backend required.

## Install

This package is published to **GitHub Packages**. In the consuming repo, add an
`.npmrc` that routes the `@icicle-ai` scope to GitHub Packages:

```
@icicle-ai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then export a token with `read:packages` and install (peer deps included):

```bash
export NODE_AUTH_TOKEN=ghp_yourtoken
pnpm add @icicle-ai/opencv-image-playground \
         @mantine/core @mantine/hooks @mantine/notifications react react-dom
```

## Peer dependencies

You provide these in the host app:

| Package | Version |
| --- | --- |
| `react`, `react-dom` | `>= 19` |
| `@mantine/core`, `@mantine/hooks`, `@mantine/notifications` | `^9.3.0` |

`<ImagePlayground>` renders Mantine components and fires notifications, so the
host tree **must** include `MantineProvider` and `Notifications`.

## Usage

```tsx
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ImagePlayground, localFileSource } from "@icicle-ai/opencv-image-playground";

// Mantine styles (once, at your app root)
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

export function App() {
  return (
    <MantineProvider>
      <Notifications />
      <ImagePlayground
        fileSources={[localFileSource]}
        onPipelineChange={(pipeline) => console.log(pipeline)}
      />
    </MantineProvider>
  );
}
```

## `<ImagePlayground>` props

All props are optional.

| Prop | Type | Description |
| --- | --- | --- |
| `fileSources` | `FileSource[]` | Pickable image sources; the first is the default. Defaults to `[localFileSource]`. |
| `headerActions` | `ReactNode` | Host-owned controls rendered on the right of the header (e.g. auth buttons). |
| `title` | `string` | Header title. Defaults to `"cv-gui"`. |
| `initialPipeline` | `Pipeline` | Pipeline to start from. |
| `onPipelineChange` | `(pipeline: Pipeline) => void` | Called whenever the pipeline changes. |

## Custom file sources

`localFileSource` (local file upload) is provided. To offer images from
elsewhere (an object store, a remote API, …), pass your own `FileSource`
implementations:

```tsx
import type { FileSource, RemoteFile } from "@icicle-ai/opencv-image-playground";

const mySource: FileSource = {
  id: "my-store",
  label: "My store",
  // …list/read files per the FileSource interface
};

<ImagePlayground fileSources={[localFileSource, mySource]} />;
```

## Exported API

```ts
// Main component
import { ImagePlayground } from "@icicle-ai/opencv-image-playground";
import type { ImagePlaygroundProps } from "@icicle-ai/opencv-image-playground";

// File sources
import {
  FileSourceProvider,
  useFileSource,
  localFileSource,
} from "@icicle-ai/opencv-image-playground";
import type { FileSource, RemoteFile } from "@icicle-ai/opencv-image-playground";

// Pipeline context (for building custom UIs around the same state)
import { PipelineProvider, usePipeline } from "@icicle-ai/opencv-image-playground";

// Types
import type { StepResult } from "@icicle-ai/opencv-image-playground";
```

The pipeline data model (`Pipeline`, `PipelineStep`, the op registry) lives in
[`@icicle-ai/opencv-image-playground-core`](https://github.com/ICICLE-ai/opencv-image-playground/tree/main/packages/core).

## License

MIT © ICICLE-ai. See [LICENSE](./LICENSE).
