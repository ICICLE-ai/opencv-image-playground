# Setup

How to install, configure, run, and deploy the OpenCV Image Playground.
See [HOW_TO_USE.md](HOW_TO_USE.md) once it's running.

## 1. Prerequisites

| Tool | Version | Install |
| --- | --- | --- |
| Node | ≥ 20 | `nvm install 20` |
| pnpm | 9.x | `npm i -g pnpm@9` |
| Python | ≥ 3.11 | — |
| uv | latest | `pip install uv` |
| Docker | any recent | for the all-in-one / image builds |
| Apptainer | ≥ 1.x | only to build the Tapis batch container |

## 2. Install

```bash
pnpm install                       # JS workspace (all packages + app)
```

Python bridge (for live preview):

```bash
cd packages/python-bridge
uv pip install -e .
```

## 3. Configure environment

The app reads config from environment variables (via `apps/app-standalone/.env`
in dev). Tapis features are **optional** — without them the editor still works;
the `/jobs` page and Tapis file browser require them.

| Variable | Required | Purpose |
| --- | --- | --- |
| `BRIDGE_URL` | yes | URL of the python-bridge (e.g. `http://localhost:8000`). |
| `TAPIS_BASE_URL` | Tapis | Tenant base URL, e.g. `https://icicleai.tapis.io`. |
| `TAPIS_CLIENT_ID` | Tapis | OAuth2 client id. |
| `TAPIS_CLIENT_KEY` | Tapis | OAuth2 client **key** (secret). Never commit. |
| `APP_BASE_URL` | Tapis | Public URL of this app (no trailing slash). |
| `APP_SECRET` | Tapis | Signing secret for the session cookie. `openssl rand -hex 32`. |
| `TAPIS_CALLBACK_URL` | optional | OAuth callback; defaults to `${APP_BASE_URL}/auth/callback`. |
| `TAPIS_SYSTEM_ID` | Tapis | Default source system (holds input images). |
| `TAPIS_SYSTEMS` | optional | Comma-separated systems for the submit-form dropdowns. Defaults to `pitzer-tapis,expanse-tapis,expanse-tapis-static,cardinal-tapis,ascend-tapis`. |
| `TAPIS_APP_ID` | optional | Registered Tapis app id. Default `opencv-preprocess`. |
| `TAPIS_APP_VERSION` | optional | App version. Default `0.1.0`. |
| `TAPIS_EXEC_SYSTEM_ID` | optional | Default exec system. Falls back to `TAPIS_SYSTEM_ID`. |
| `TAPIS_ARCHIVE_SYSTEM_ID` | optional | Default archive (output) system. Falls back to `TAPIS_SYSTEM_ID`. |
| `SLURM_ACCOUNT` | optional | Default SLURM allocation for the submit form (e.g. `PAS2699`). |

> ⚠️ The exact names the code reads are `APP_SECRET` and `TAPIS_CALLBACK_URL`.
> If your `.env` still uses `SESSION_SECRET` / `TAPIS_REDIRECT_URI`, rename them.
> Keep real secrets out of git — see the k8s note in the deploy section.

## 4. Run locally

### Option A — Docker (everything at once)

```bash
docker compose up --build
# app   → http://localhost:3000
# bridge→ http://localhost:8000
```

### Option B — Dev servers (hot reload)

```bash
# terminal 1 — python bridge
cd packages/python-bridge && uv run uvicorn main:app --reload --port 8000

# terminal 2 — app (Vite dev server)
cd apps/app-standalone && pnpm dev        # http://localhost:5173+
```

Health check: `GET http://localhost:8000/health` → `{ "ok": true, "opencv": "4.x.x" }`.

### Building the Docker images manually

`docker compose up --build` builds both images for you. To build them directly —
e.g. to run one standalone or push to a registry — **run from the repo root**;
the frontend build context must be the root so the workspace packages
(`core`, `playground`) are visible.

```bash
# Frontend (React Router app) — Dockerfile lives in apps/app-standalone,
# but the build context is the repo root (the trailing ".").
docker build -f apps/app-standalone/Dockerfile -t oip-frontend:local .
docker run --rm -p 3000:3000 \
  -e BRIDGE_URL=http://host.docker.internal:8000 \
  oip-frontend:local                 # → http://localhost:3000

# Python bridge (context is the package dir itself)
docker build -t oip-bridge:local packages/python-bridge
docker run --rm -p 8000:8000 oip-bridge:local
```

Pass Tapis config to the frontend with more `-e` flags (or `--env-file .env`):
`TAPIS_BASE_URL`, `TAPIS_CLIENT_ID`, `TAPIS_CLIENT_KEY`, `APP_BASE_URL`,
`APP_SECRET`, `TAPIS_SYSTEM_ID`, … (see the table in §3).

> The frontend Dockerfile copies `packages/core` **and** `packages/playground`
> (both consumed as TS source and bundled at build time). If you add another
> workspace package the app imports, copy it in both build stages too.

## 5. Build the Tapis batch container

Only needed for the batch/`/jobs` workflow. Build **from the repo root** so the
`%files` paths resolve, then stage the `.sif` on your exec system.

```bash
apptainer build preprocess.sif packages/tapis-job/pre-process-pipeline.def
```

Details, plus registering the Tapis app and submitting jobs by hand, are in
[packages/tapis-job/README.md](packages/tapis-job/README.md).

## 6. Register the Tapis app (once)

Fill the `REPLACE_ME_*` values in
[packages/tapis-job/tapis/app.json](packages/tapis-job/tapis/app.json)
(`containerImage`, exec/archive systems) and register it:

```bash
curl -X POST -H "X-Tapis-Token: $JWT" -H "Content-Type: application/json" \
  -d @packages/tapis-job/tapis/app.json \
  "$TAPIS_BASE_URL/v3/apps"
```

> The app submitted by the `/jobs` page passes its entrypoint args
> (`--input`/`--output`/`--pipeline`) in the **job body**, so the registered app
> should **not** declare conflicting `FIXED` appArgs of the same name.

## 7. Deploy

Images are published to GHCR and run on Kubernetes (NRP Nautilus) via
[k8s/deployment.yaml](k8s/deployment.yaml).

```bash
# build + push (Nautilus is amd64)
docker build --platform linux/amd64 \
  -t ghcr.io/icicle-ai/opencv-image-playground:vX.Y.Z \
  -f apps/app-standalone/Dockerfile .
docker build --platform linux/amd64 \
  -t ghcr.io/icicle-ai/opencv-image-playground-bridge:vX.Y.Z \
  packages/python-bridge

docker push ghcr.io/icicle-ai/opencv-image-playground:vX.Y.Z
docker push ghcr.io/icicle-ai/opencv-image-playground-bridge:vX.Y.Z

# bump the image tags in k8s/deployment.yaml, then:
kubectl apply -f k8s/deployment.yaml
kubectl rollout status deployment/cv-gui-app
kubectl rollout status deployment/cv-gui-bridge
```

> 🔐 Provision `cv-gui-secret` (`TAPIS_CLIENT_KEY`, `APP_SECRET`) **out of band**
> (kubectl / vault) — do not commit real secret values in the manifest.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/jobs` redirects to Tapis login repeatedly | Set `TAPIS_*` env vars and confirm `APP_BASE_URL` matches the registered callback exactly. |
| Editor loads but no processed preview | The python-bridge isn't reachable — check `BRIDGE_URL` and `/health`. |
| Container: `Errno 13` opening `preprocess.py` | Rebuild the `.sif`; the def sets `chmod -R a+rX /opt/app`. |
| Job: `missing required configuration: input/output/pipeline` | The app args aren't reaching the container — the `/jobs` submit passes them in the body; ensure the app has no conflicting `FIXED` appArgs. |
