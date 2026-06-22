# cv-gui

OpenCV pipeline GUI — Remix + Mantine frontend, FastAPI + cv2 backend.

## Quick start (development)

### 1. Prerequisites
```
node >= 20    (nvm install 20)
pnpm >= 9     (npm i -g pnpm)
python >= 3.11
uv            (pip install uv)
```

### 2. Install JS dependencies
```bash
pnpm install
```

### 3. Start the Python bridge
```bash
cd packages/python-bridge
uv pip install -e .          # first time only
python main.py               # starts on :8000
```

### 4. Start the Remix app
```bash
# from repo root
pnpm dev
# app runs on :3000
```

### 5. Verify everything works
- Open http://localhost:3000
- GET http://localhost:8000/health → { "ok": true, "opencv": "4.x.x" }

## Running with Docker
```bash
docker compose up --build
```

## Project structure
```
cv-gui/
├── packages/
│   ├── core/               # TypeScript types, Zod schemas, op registry
│   └── python-bridge/      # FastAPI server, all cv2 ops
└── apps/
    └── app-standalone/     # Remix app, Mantine UI
        └── app/
            ├── contexts/   # PipelineContext, FileSourceContext
            ├── components/ # OpPanel, ImageCanvas, PipelineBuilder, ParamEditor
            ├── lib/        # useImageProcessor, pipelineIO, theme
            └── routes/     # _index.tsx (editor), api.process.ts (proxy)
```

## How to add a new cv2 op
1. Add the op definition to `packages/core/src/registry.ts`
2. Add the Python function to `packages/python-bridge/main.py`
3. Add the key to `OP_MAP` in `main.py`
That's it — the UI renders param controls automatically.
