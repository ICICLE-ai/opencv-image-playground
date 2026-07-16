# Publishing packages to GitHub Packages

This guide explains how to turn a package in this monorepo into a published npm
library on **GitHub Packages** (`npm.pkg.github.com`) so it can be consumed from
other repositories.

It has two halves:

1. **[Preparing a package](#part-1--prepare-a-package-for-publishing)** — the one-time
   setup that makes a workspace package publishable (naming, `package.json`
   fields, build step).
2. **[Publishing](#part-3--publish)** — authenticating and pushing new versions.

> **Registry note:** npm libraries go to `npm.pkg.github.com`, **not** `ghcr.io`.
> `ghcr.io` is a container (Docker/OCI) registry — it does not host npm packages.

Already-published examples to copy from:

- [`@icicle-ai/opencv-image-playground-core`](../packages/core)
- [`@icicle-ai/opencv-image-playground`](../packages/playground) (the `<ImagePlayground>` component)

---

## Prerequisites (one-time per machine)

- **Node + pnpm** (this repo uses `pnpm` workspaces).
- A **GitHub Personal Access Token (classic)** with these scopes:
  - `write:packages` — publish
  - `read:packages` — install/resolve
  - `repo` — **only if** the repository is private
  - Create at: GitHub → Settings → Developer settings → **Personal access tokens (classic)**.

---

## Part 1 — Prepare a package for publishing

Skip to [Part 3](#part-3--publish) if the package is already set up (like the two above).
Do this once per new package.

### 1a. Name it correctly (scope rules)

GitHub Packages requires the npm **scope** to match the **org** that owns the repo.
This repo is under `ICICLE-ai`, so every package must be scoped `@icicle-ai`.

An npm name is `@scope/name` — the scope is **one path segment**. You cannot nest:

| Name | Valid? |
| --- | --- |
| `@icicle-ai/opencv-image-playground` | ✅ scope `icicle-ai`, name `opencv-image-playground` |
| `@icicle-ai/opencv-image-playground-core` | ✅ two distinct packages need two distinct names |
| `@icicle-ai/opencv-image-playground/core` | ❌ three segments — **not a legal package name** |

If you rename an existing package, update **every** reference — the `name` field,
all `import`/`from "…"` statements, and any `workspace:^` dependency entries in
other packages that depend on it:

```bash
grep -rl "@icicle-ai/old-name" apps packages \
    --include="*.ts" --include="*.tsx" --include="*.json" \
  | xargs sed -i '' -e 's#@icicle-ai/old-name#@icicle-ai/new-name#g'
pnpm install   # re-link the workspace
```

### 1b. Add a build step (tsup)

Published packages must ship compiled **JavaScript + type declarations**, not raw
`.ts`. Inside the monorepo, `main` can point at `./src/index.ts`; a consuming repo
cannot use that. We use [`tsup`](https://tsup.egoist.dev/) (a thin wrapper around
esbuild + a `.d.ts` generator).

Install it as a dev dependency of the package:

```bash
pnpm -F @icicle-ai/<package-name> add -D tsup
```

Create `tsup.config.ts` in the package root. **Plain library** (e.g. `core`):

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,       // emit .d.ts type declarations
  clean: true,     // wipe dist/ before each build
  sourcemap: true,
});
```

**React component library** (e.g. `playground`) — additionally externalize the
peer deps so React/Mantine aren't bundled into your output:

```ts
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
```

> tsup automatically externalizes anything listed in `dependencies` /
> `peerDependencies`, so the `external` list is belt-and-suspenders. The important
> thing is that runtime deps stay **declared in `package.json`** — the consuming
> repo installs them; you don't bundle them.

### 1c. Set the `package.json` publish fields

Point `main`/`types` at the build output, expose a proper `exports` map, allow-list
`dist`, remove `private`, and route publishing to GitHub Packages. A complete
example (from `core`):

```jsonc
{
  "name": "@icicle-ai/opencv-image-playground-core",
  "version": "0.1.0",
  "type": "module",

  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist"],

  "publishConfig": { "registry": "https://npm.pkg.github.com" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ICICLE-ai/opencv-image-playground.git"
  },

  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "tsup": "^8.5.1" }
}
```

Field-by-field:

| Field | Why it matters |
| --- | --- |
| **no `"private": true`** | npm refuses to publish a package marked private. |
| `main` / `module` / `types` | Point at `dist/`, not `src/`. |
| `exports` | Modern resolution map; keep it in sync with `main`/`types`. |
| `files: ["dist"]` | Only ship the build output (not `src`, configs, tests). |
| `publishConfig.registry` | Sends the publish to GitHub Packages. **Without it, publish goes to public npmjs.com.** |
| `repository` | Links the package to the repo so it inherits the repo's permissions. |
| `version` | You can never re-publish the same version — bump it every release. |

### 1d. Build and check the output

```bash
pnpm -F @icicle-ai/<package-name> build
ls packages/<dir>/dist   # expect index.js, index.d.ts, index.js.map
```

**Build order matters.** If package B depends on package A (via `workspace:^`),
build **A first** — B's type-declaration step reads A's emitted `dist/index.d.ts`.
Here: build `core` before `playground`.

### 1e. Add a README, LICENSE, and examples

**README (the "how to use" doc).** npm renders the package-root `README.md` on the
package page (github.com/orgs/ICICLE-ai/packages). Create `README.md` next to the
package's `package.json` with install steps, usage, and the exported API. See
[`packages/playground/README.md`](../packages/playground/README.md) and
[`packages/core/README.md`](../packages/core/README.md) for examples.

**LICENSE.** Add a `LICENSE` file to the package root and a `license` field to
`package.json`:

```jsonc
"license": "MIT",
"author": "ICICLE-ai"
```

The `license` value is an [SPDX identifier](https://spdx.org/licenses/) (the license
*type*, e.g. `MIT`, `Apache-2.0`) — **not** the copyright holder. The copyright
holder (ICICLE-ai) goes in the `LICENSE` file's copyright line and the `author`
field. This repo uses MIT with copyright `ICICLE-ai`; the root [`LICENSE`](../LICENSE)
is copied into each package.

> **These ship automatically.** npm **always** bundles `README.md`, `LICENSE`, and
> `package.json` into the published tarball — even though `files` is `["dist"]`.
> You do **not** need to add them to `files`.

**Runnable examples (optional).** Only `README.md` renders on the package page. To
also ship a folder of runnable examples in the tarball, create it and add it to
`files`:

```jsonc
"files": ["dist", "examples"]
```

Those files are included for anyone who unpacks the package, but won't render on the
registry page — for most packages a good `README.md` is enough.

---

## Part 2 — Authenticate

The most reliable method (writes auth to `~/.npmrc`, nothing to hand-edit):

```bash
npm login --scope=@icicle-ai --registry=https://npm.pkg.github.com --auth-type=legacy
```

At the prompts:

- **Username:** your GitHub username
- **Password:** your **PAT** (`ghp_…`), *not* your GitHub password
- **Email:** any email

`--auth-type=legacy` is required — without it, newer npm attempts browser login,
which GitHub Packages doesn't support here.

Verify:

```bash
npm whoami --registry=https://npm.pkg.github.com   # prints your GitHub username
```

<details>
<summary>Alternative: a project <code>.npmrc</code> instead of <code>npm login</code></summary>

Create `.npmrc` at the repo root — **and add `.npmrc` to `.gitignore`** (it holds a token):

```
@icicle-ai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then, **in the same terminal** you publish from:

```bash
export NODE_AUTH_TOKEN=ghp_yourtokenhere
```

The auth line must actually be present — an **empty `.npmrc` produces `ENEEDAUTH`**.
Confirm pnpm sees it: `pnpm config get //npm.pkg.github.com/:_authToken` should
not print `undefined`.
</details>

---

## Part 3 — Publish

Bump the `version` in each package's `package.json` first (a version can only be
published once). Then publish **dependencies before dependents**:

```bash
cd /path/to/opencv-image-playground

pnpm -F @icicle-ai/opencv-image-playground-core publish --no-git-checks
pnpm -F @icicle-ai/opencv-image-playground      publish --no-git-checks
```

- `--no-git-checks` skips pnpm's "dirty tree / not on a release branch" guard —
  needed when publishing from a feature branch.
- On publish, pnpm rewrites `workspace:^` dependencies to the real published
  version automatically, which is why `core` must be published first.

**Verify:**

```bash
npm view @icicle-ai/opencv-image-playground --registry=https://npm.pkg.github.com
```

or browse **github.com/orgs/ICICLE-ai/packages**.

---

## Part 4 — Consume the package in another repo

In the **other** repository, create `.npmrc`:

```
@icicle-ai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Export a token with `read:packages`, then install:

```bash
export NODE_AUTH_TOKEN=ghp_readtokenhere
pnpm add @icicle-ai/opencv-image-playground \
         @mantine/core @mantine/hooks @mantine/notifications react react-dom
```

Peer deps (React 19, Mantine 9) are installed by the consumer. `<ImagePlayground>`
needs `MantineProvider` + `Notifications` in the host tree:

```tsx
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ImagePlayground, localFileSource } from "@icicle-ai/opencv-image-playground";

export function App() {
  return (
    <MantineProvider>
      <Notifications />
      <ImagePlayground fileSources={[localFileSource]} />
    </MantineProvider>
  );
}
```

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `sh: tsup: command not found` | tsup not installed in the package | `pnpm -F <pkg> add -D tsup` |
| `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND … "@icicle-ai/x/y"` | Illegal nested package name (extra `/`) | Rename to a single-segment name, e.g. `@icicle-ai/x-y`; fix all references |
| `Could not resolve "zod"` / `Cannot find module 'zod'` | A runtime dep was dropped from `package.json` (so pnpm didn't link it) | Re-add it: `pnpm -F <pkg> add zod` |
| `ENEEDAUTH … need auth` | No auth line reaching the registry (missing/empty `.npmrc`, or token env var not set) | Run `npm login … --auth-type=legacy`; verify with `pnpm config get //npm.pkg.github.com/:_authToken` |
| `401 Unauthorized` | Token missing `write:packages`, or expired | Regenerate the PAT with the right scopes; re-login |
| `403 Forbidden` / "not permitted" | Your account lacks package-write access to the `ICICLE-ai` org, or org policy blocks creation | Ask an org admin for package permissions |
| `404 Not Found` on publish | Package scope ≠ org name | Scope must be `@icicle-ai` |
| `You cannot publish over the previously published versions` | `version` already exists | Bump `version` in `package.json` |

---

## Quick checklist for a new release

1. Bump `version` in each changed package's `package.json`.
2. Build dependencies first: `pnpm -F <dep> build`, then `pnpm -F <dependent> build`.
3. `npm whoami --registry=https://npm.pkg.github.com` (authenticated?).
4. `pnpm -F <dep> publish --no-git-checks`, then the dependents.
5. Verify at github.com/orgs/ICICLE-ai/packages.
