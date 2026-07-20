# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /repo

# Copy workspace config AND lockfile
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json pnpm-lock.yaml ./

# Copy package.json files for all packages
COPY packages/core/package.json         ./packages/core/
COPY packages/playground/package.json   ./packages/playground/
COPY apps/app-standalone/package.json   ./apps/app-standalone/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/core/        ./packages/core/
COPY packages/playground/  ./packages/playground/
COPY apps/app-standalone/  ./apps/app-standalone/

# Build workspace deps first (core → playground), then the app. Their dist/ must
# exist before app-standalone's `import "@icicle-ai/opencv-image-playground"` can
# resolve — its exports map points at ./dist/index.js.
WORKDIR /repo
RUN pnpm --filter @icicle-ai/opencv-image-playground-core build \
 && pnpm --filter @icicle-ai/opencv-image-playground build \
 && pnpm --filter app-standalone build

# ─── Stage 2: Runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN npm install -g pnpm

WORKDIR /repo

# Copy workspace config AND lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json       ./packages/core/
COPY packages/playground/package.json ./packages/playground/
COPY apps/app-standalone/package.json ./apps/app-standalone/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built app from builder stage
COPY --from=builder /repo/apps/app-standalone/build \
     ./apps/app-standalone/build

# Copy workspace package build output (main: ./dist/index.js) so the server
# bundle can resolve the @icicle-ai/* packages at runtime.
COPY --from=builder /repo/packages/core/dist \
     ./packages/core/dist
COPY --from=builder /repo/packages/playground/dist \
     ./packages/playground/dist

WORKDIR /repo/apps/app-standalone

EXPOSE 3000

CMD ["pnpm", "start"]