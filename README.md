# OpenCV Image Playground

A browser-based OpenCV pipeline builder with two ways to run:

1. **Interactive editor** — build a pre-processing pipeline (blur, threshold, edges,
   morphology, colour, …) and preview it live on a single image in the browser.
2. **Batch on HPC** — submit that same pipeline as a [Tapis](https://tapis-project.github.io/live-docs/?service=Jobs)
   job that applies it to **every image in every subdirectory** of an input
   folder on a chosen system, archiving the results to an output folder.

📖 **[SETUP.md](SETUP.md)** — install, configure, run locally, and deploy.
📖 **[HOW_TO_USE.md](HOW_TO_USE.md)** — using the editor, submitting Tapis jobs, and the container CLI.
📖 **[docs/PUBLISHING.md](docs/PUBLISHING.md)** — building and publishing the packages to GitHub Packages.
📖 **[docs/TESTING.md](docs/TESTING.md)** — how changes are verified, what CI runs, and what contributors must do before a pull request is mergeable.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  app-standalone  (React Router SSR + Mantine)               │
│    /        editor  →  live preview via python-bridge        │
│    /jobs    submit / monitor / cancel Tapis batch jobs       │
│    server   Tapis OAuth2, Files API, Jobs API (token-safe)   │
└───────────────┬───────────────────────────┬─────────────────┘
                │ HTTP                       │ HTTPS (X-Tapis-Token)
        ┌───────▼────────┐          ┌────────▼──────────┐
        │ python-bridge  │          │   Tapis tenant     │
        │ FastAPI + cv2  │          │  Systems / Jobs    │
        └────────────────┘          └────────┬───────────┘
                                             │ runs
                                    ┌────────▼───────────┐
                                    │ preprocess.sif      │
                                    │ (Singularity/       │
                                    │  Apptainer)         │
                                    └─────────────────────┘
```

## Monorepo layout

| Path | What it is |
| --- | --- |
| [apps/app-standalone](apps/app-standalone) | React Router SSR app — the editor, the `/jobs` page, and all server-side Tapis logic. |
| [packages/playground](packages/playground) | Reusable `<ImagePlayground>` React component (the editor UI). |
| [packages/core](packages/core) | TypeScript op registry, Zod pipeline schema, shared types. |
| [packages/python-bridge](packages/python-bridge) | FastAPI + OpenCV service powering the live preview (`/health`, `/process`). |
| [packages/opencv-executor](packages/opencv-executor) | Python library + CLI that applies an exported `operations.json` to images. |
| [packages/tapis-job](packages/tapis-job) | Singularity container + `preprocess.py` entrypoint + Tapis app/job templates. |

## Quick start

```bash
pnpm install
docker compose up --build      # app → :3000, bridge → :8000
```

See **[SETUP.md](SETUP.md)** for the dev-server workflow, environment variables,
and deployment.

## Tech stack

- **Frontend:** React 19, React Router 7 (SSR), Mantine 9, Tailwind 4
- **Preview backend:** FastAPI, OpenCV (`opencv-python-headless`)
- **Batch:** Python + OpenCV in a Singularity/Apptainer container, run via Tapis
- **Tooling:** pnpm workspaces, Turborepo, `uv` (Python)
