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

# Build the Remix app
WORKDIR /repo/apps/app-standalone
RUN pnpm build

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

# Copy workspace package sources (consumed as TS source, main: ./src/index.ts)
COPY --from=builder /repo/packages/core/src \
     ./packages/core/src
COPY --from=builder /repo/packages/playground/src \
     ./packages/playground/src

WORKDIR /repo/apps/app-standalone

EXPOSE 3000

CMD ["pnpm", "start"]