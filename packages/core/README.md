# @icicle-ai/opencv-image-playground-core

Framework-agnostic core for the OpenCV Image Playground: the **pipeline data
model** (Zod schemas + types) and the **operation registry** that describes every
available OpenCV operation and its parameters.

No React, no OpenCV runtime — just TypeScript types, [Zod](https://zod.dev)
schemas, and plain data. Use it to build, validate, and serialize pipelines
anywhere (browser, Node, a job runner) independent of the UI in
[`@icicle-ai/opencv-image-playground`](https://github.com/ICICLE-ai/opencv-image-playground/tree/main/packages/playground).

## Install

Published to **GitHub Packages**. In the consuming repo, add an `.npmrc`:

```
@icicle-ai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then:

```bash
export NODE_AUTH_TOKEN=ghp_yourtoken
pnpm add @icicle-ai/opencv-image-playground-core
```

Peer/runtime dependency: [`zod`](https://www.npmjs.com/package/zod) (`^3`) —
installed transitively.

## What's exported

### Pipeline model

```ts
import {
  PipelineSchema,
  PipelineStepSchema,
  createPipeline,
} from "@icicle-ai/opencv-image-playground-core";
import type { Pipeline, PipelineStep } from "@icicle-ai/opencv-image-playground-core";

// Start a new pipeline
const pipeline = createPipeline("Edge detection");

// Validate untrusted input (e.g. an imported operations.json)
const parsed = PipelineSchema.parse(JSON.parse(rawJson));
```

### Operation registry

```ts
import {
  OP_REGISTRY,
  OP_CATEGORIES,
  getOpsByCategory,
  defaultParams,
} from "@icicle-ai/opencv-image-playground-core";
import type {
  OpDef,
  OpCategory,
  ParamDef,
  ParamValue,
} from "@icicle-ai/opencv-image-playground-core";

// All ops in a category
const filters = getOpsByCategory("filter"); // Array<[opId, OpDef]>

// Default parameter values for an op
const params = defaultParams(OP_REGISTRY["gaussianBlur"]);
```

Categories: `filter`, `edge`, `threshold`, `morphology`, `color`, `geometry`.

## API reference

| Export | Kind | Description |
| --- | --- | --- |
| `PipelineSchema` | Zod schema | Validates a full pipeline. |
| `PipelineStepSchema` | Zod schema | Validates a single step. |
| `createPipeline(name?)` | function | Creates an empty pipeline. |
| `Pipeline`, `PipelineStep` | type | Inferred from the schemas. |
| `OP_REGISTRY` | `Record<string, OpDef>` | Every available operation, keyed by id. |
| `OP_CATEGORIES` | readonly tuple | The category ids. |
| `getOpsByCategory(category)` | function | Ops belonging to a category. |
| `defaultParams(op)` | function | Default parameter values for an op. |
| `OpDef`, `OpCategory`, `ParamDef`, `ParamValue` | type | Registry types. |

## License

MIT © ICICLE-ai. See [LICENSE](./LICENSE).
