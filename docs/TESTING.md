# Testing Model

This document defines how change is verified in this repository, what an external
contributor must do before a pull request can be merged, and what must be true
before a change is deployed.

It is written to be **adopted unchanged across our repositories**. Everything in
[Levels of verification](#levels-of-verification), [Merge criteria](#merge-criteria),
[Deployment criteria](#deployment-criteria) and [User test documentation](#user-test-documentation)
is repository-agnostic. Only the concrete commands in Level 0 and the workflow
inventory in Level 1 are specific to this repository — see
[Adopting this model in another repository](#adopting-this-model-in-another-repository).

---

## Current position on unit tests

**We are not requiring unit tests at this time.** Writing a unit-test suite for the
existing surface area is a large, up-front cost that we are deliberately deferring.
It will be added later; when it is, it becomes a fourth blocking CI gate and this
document is updated in the same pull request.

This is a decision about *automated* tests, not about verification. Until unit tests
exist, the evidence that a change works comes from **manual functional verification
recorded in a user test document** (Level 2). That evidence is not optional — it is
the thing standing in for the tests we have not written.

What contributors should do in the meantime:

- Keep new logic in small, pure, exported functions where practical, so it is
  cheap to cover once the suite lands.
- Do not add a testing framework, runner, or configuration in an unrelated pull
  request. Framework selection is a maintainer decision.
- If a change is genuinely risky and you *want* to add a test, say so in the pull
  request and a maintainer will tell you where to put it. Volunteered tests are
  welcome; they are simply not demanded.
- Record known verification gaps in the "Reviewer notes" section of the pull
  request, so the gap is visible rather than assumed away.

Planned direction, for information only — not yet in effect:

| Area | Intended tooling |
| --- | --- |
| TypeScript packages (`packages/core`, `packages/playground`) | Vitest |
| React app (`apps/app-standalone`) | Vitest + React Testing Library |
| Python packages (`packages/python-bridge`, `packages/opencv-executor`) | pytest |

---

## Levels of verification

Every change passes through four levels. Levels 0–1 are mechanical. Levels 2–3 are
judgement calls scoped by what the change touches.

| Level | What it is | Who runs it | When | Blocks merge |
| --- | --- | --- | --- | --- |
| 0 | Local pre-submit checks | Contributor | Before opening or updating a pull request | Indirectly (Level 1 will fail) |
| 1 | Automated CI gates (GitHub Actions) | GitHub | Every pull request | **Yes** |
| 2 | Manual functional verification, recorded as a user test document | Contributor | Any user-visible or behavioural change | **Yes**, when applicable |
| 3 | Deployment verification | Contributor and reviewer | Changes to build, container, or deployment surface, and every release | **Yes**, when applicable |

### Which levels apply to my change?

| Change type | Level 0 | Level 1 | Level 2 (user test doc) | Level 3 (deploy check) |
| --- | --- | --- | --- | --- |
| Documentation, comments only | — | Automatic | — | — |
| Refactor with no behaviour change | Required | Automatic | Short note in the pull request | — |
| New or changed operation, UI, or API behaviour | Required | Automatic | **Required** | — |
| Dependency add, remove, or upgrade | Required | Automatic | Required if user-visible | **Required** |
| Dockerfile, `docker-compose.yaml`, `k8s/`, environment variables | Required | Automatic | — | **Required** |
| Release or version bump | Required | Automatic | Required | **Required** |

When in doubt, do the extra level. A reviewer removing a requirement is a cheap
conversation; a reviewer discovering an unverified change is not.

---

## Level 0 — Local pre-submit checks

Run these before pushing. They are the same commands CI runs, so a failure here is
a failure there.

```bash
# 1. Install exactly what the lockfile says. Fails if a manifest and
#    pnpm-lock.yaml disagree — the same check CI makes.
pnpm install --frozen-lockfile

# 2. Build the workspace. Turborepo resolves the order from
#    tasks.build.dependsOn: core -> playground -> app-standalone.
pnpm build

# 3. Typecheck every package. Must run AFTER build: playground and
#    app-standalone resolve their types out of packages/core/dist.
pnpm -r run typecheck
```

If you touched a Python package:

```bash
# opencv-executor: installs, imports, and the CLI responds
cd packages/opencv-executor
pip install .
python -c "import opencv_executor, opencv_executor.cli"
opencv-executor --help

# python-bridge: installs and the entry module imports
cd ../python-bridge
pip install .
python -c "import main"
```

Notes:

- Node 20 and pnpm 9.0.0 are what CI uses (`engines.node`, `packageManager`).
  `corepack enable` gives you the pinned pnpm without installing it globally.
- Python 3.11 is what CI uses; both `pyproject.toml` files declare
  `requires-python >= 3.11`.
- If you added a dependency, commit the updated `pnpm-lock.yaml`. A stale lockfile
  is the single most common CI failure on this repository.

---

## Level 1 — Automated CI gates (the tests we run today)

Three workflows run against every pull request. All three must be green. None of
them can be waived by a contributor; a maintainer overrides only with a written
reason in the pull request.

| Workflow | File | Triggers | What it proves |
| --- | --- | --- | --- |
| **Build** | [.github/workflows/build.yml](../.github/workflows/build.yml) | Pull requests (opened, synchronize, reopened), any base branch | The workspace installs, builds, and typechecks; the Python packages install and import |
| **Repository health** | [.github/workflows/repository-health.yml](../.github/workflows/repository-health.yml) | Pull requests; pushes to `main` | The files that make the repository contributable still exist |
| **Secret Scan** | [.github/workflows/secret-scan.yml](../.github/workflows/secret-scan.yml) | Pull requests; pushes to `main`; weekly cron (Mondays, 06:00 UTC); manual dispatch | No credentials or keys are present in the change or the history |

### Build

Two independent jobs.

**`node` — Build workspace (node)**

1. Checkout, Node 20, `corepack enable` (pnpm version comes from the root
   `packageManager` field, not from a third-party action).
2. `pnpm install --frozen-lockfile` — fails on any lockfile/manifest drift.
3. `pnpm build` — Turborepo builds `core`, then `playground`, then
   `app-standalone`.
4. `pnpm -r run typecheck` — run per-package via pnpm rather than
   `turbo run typecheck`, because `turbo.json` declares only `build` and `dev`.

**`python` — Build packages (python)**

1. Checkout, Python 3.11.
2. `packages/opencv-executor`: `pip install .`, import `opencv_executor` and
   `opencv_executor.cli`, run `opencv-executor --help`.
3. `packages/python-bridge`: `pip install .`, import `main`.

This is an **install-and-import smoke gate**, not a test suite. It catches broken
imports, missing dependencies, bad packaging metadata, and type errors. It does
not catch wrong behaviour — that is what Level 2 is for.

Note: Build runs on pull requests only, not on pushes to `main`. Land changes
through a pull request so they are built.

### Repository health

Asserts the presence of: `LICENSE`, `README.md`, `CONTRIBUTING.md`,
`CODE_OF_CONDUCT.md`, `SECURITY.md`, `CITATION.cff`, `docs/RELEASE_CHECKLIST.md`,
`docs/MAINTAINER_ROLES.md`, and `docs/TESTING.md`. Deleting or renaming any of
these fails the pull request.

### Secret Scan

Two independent detectors, so a miss by one is caught by the other.

- **gitleaks** (pinned to 8.30.1, checksum-verified download). On a pull request it
  scans only the commits the pull request adds (`base..head`). On a push to `main`,
  on the weekly cron, and on manual dispatch it scans the **full history** —
  detection rules improve over time, so old commits are rescanned.
- **TruffleHog** (pinned to the commit tagged v3.97.0). Runs on push and pull
  request only. Reports findings that are `verified` or `unknown`; inconclusive
  verifications are kept rather than discarded.

If Secret Scan fails: **rotate the credential first**, then remove it from the
history. A force-push that hides a leaked key does not un-leak it. Report it under
[SECURITY.md](../SECURITY.md) rather than in a public issue.

### What CI does *not* check today

Be explicit about this when you review. CI does not run unit tests, integration
tests, linting, formatting checks, end-to-end browser tests, container image
builds, or performance checks. Everything in that list is currently a human
responsibility under Levels 2 and 3.

---

## Level 2 — Manual functional verification

For any change that alters behaviour a user can observe, you must exercise the
change and **record what you did in a user test document**. Because we have no
unit tests, this document is the project's test record.

Minimum bar:

1. Run the change the way a user would — the editor in the browser, the CLI, the
   API, the Tapis job path, whichever your change touches.
2. Exercise the happy path, at least one edge case, and at least one failure case.
3. Confirm you did not break the neighbouring path you did not intend to touch.
4. Capture a screenshot or short recording for any visual change.
5. Write it up using the template below and commit it in the same pull request.

---

## Level 3 — Deployment verification

Required when the change touches the build, the container images, the compose or
Kubernetes manifests, environment variables, or when cutting a release.

```bash
# Build and run both services. Note the explicit -f: the repository root also
# contains a compose.yaml that is ICICLE component metadata, not a Compose file,
# and docker compose would otherwise pick it up first.
docker compose -f docker-compose.yaml up --build

# Bridge health, once the container reports healthy
curl -f http://localhost:8000/health

# App
open http://localhost:3000
```

Verify:

- [ ] Both images build from a clean state.
- [ ] `bridge` passes its healthcheck; `app` starts only after it does.
- [ ] The editor loads and a live preview round-trips through the bridge.
- [ ] Any new environment variable is documented in [SETUP.md](../SETUP.md) and
      present in `docker-compose.yaml` and the `k8s/` manifests, with a sane
      behaviour when it is unset.
- [ ] No secret is baked into an image or committed to a manifest.

For a release, the above is necessary but not sufficient — complete
[docs/RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) as well.

---

## Merge criteria

A pull request is mergeable when all of the following are true. This is the
checklist a reviewer works through.

- [ ] The pull request describes the problem and links the related issue.
- [ ] It is one coherent change.
- [ ] **Build** is green.
- [ ] **Repository health** is green.
- [ ] **Secret Scan** is green.
- [ ] Level 0 commands were run locally, and the lockfile is committed if
      dependencies changed.
- [ ] A user test document is included, or the pull request states why the change
      needs none (documentation-only, pure refactor, and so on).
- [ ] Screenshots or a recording are attached for any user-visible change.
- [ ] Documentation is updated where behaviour, interfaces, configuration,
      installation, or limitations changed.
- [ ] New or changed dependencies are named, with a reason.
- [ ] Known verification gaps are stated in "Reviewer notes" rather than left
      implicit.
- [ ] At least one maintainer has approved.

A pull request is **not** blocked for the absence of unit tests. It **is** blocked
for the absence of a user test document when one applies.

## Deployment criteria

A change is deployable when it is mergeable, and in addition:

- [ ] Level 3 deployment verification was performed and recorded.
- [ ] The tagged commit is identified and traceable to its build.
- [ ] [docs/RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) is complete.
- [ ] Release notes state current capabilities, known limitations, breaking
      changes, and **known test gaps** — including that unit tests are not yet in
      place.
- [ ] A rollback path is known: the previous image tag or the previous release
      tag is identified.

---

## User test documentation

A user test document is a short, plain-language record of a human exercising the
software and observing what happened. It is written from the user's point of view,
not the implementer's — a reader who did not write the code should be able to
repeat every step and get the same result.

### Where they live and how they are named

```
docs/user-tests/
├── TEMPLATE.md
├── README.md
└── YYYY-MM-DD-<short-slug>.md      e.g. 2026-08-19-gaussian-blur-radius.md
```

One document per pull request that needs one. Commit it in the same pull request
as the code, and link it from the "Validation performed" section of the pull
request.

### What every user test document must contain

| Section | Contents |
| --- | --- |
| Header | Date, author, pull request or issue link, commit SHA tested |
| Environment | OS, browser, Node/Python version, how it was run (dev server, Docker Compose, deployed URL) |
| Scope | One or two sentences: what this change is supposed to do |
| Preconditions | What must be true before starting — sample image, signed-in Tapis session, configured environment variable |
| Test cases | A numbered table: steps → expected result → actual result → pass/fail |
| Edge cases | What you tried at the boundary — empty input, huge image, unsupported format, zero or negative parameter |
| Failure cases | What you tried that *should* fail, and confirmation it failed cleanly with a useful message rather than crashing |
| Regression check | The adjacent behaviour you confirmed still works |
| Evidence | Screenshots, recordings, terminal output, exported `operations.json` |
| Result | Pass / Pass with issues / Fail, plus anything left unverified |

### Rules for writing them

1. **Write steps someone else can follow.** "Click *Open image*, select
   `docs/images/sample.png`" — not "load an image".
2. **State expected before actual.** Decide what should happen, then record what
   did. Writing the expectation afterwards is not a test.
3. **Record failures.** A document with only passes is usually an incomplete
   document. A found-and-fixed bug belongs in the record.
4. **Use committed or synthetic data.** Never attach private, restricted, or
   personally identifying images. This is a public repository.
5. **Keep it short.** One page is normal. Ten test cases beats forty shallow ones.
6. **Do not edit old documents.** They are a historical record. A retest gets a
   new dated file.
7. **Say what you did not test.** An honest gap is useful; a silent gap is a
   defect waiting to be found by a user.

Start from [docs/user-tests/TEMPLATE.md](user-tests/TEMPLATE.md).

---

## Adopting this model in another repository

The model is intended to be identical across our repositories, so a contributor
who has worked on one already knows how the next one works.

Copy as-is:

- This document's structure, the four levels, the applicability matrix, the merge
  and deployment criteria, and the whole
  [User test documentation](#user-test-documentation) section.
- `docs/user-tests/` with its `TEMPLATE.md` and `README.md`.
- `.github/workflows/repository-health.yml` and
  `.github/workflows/secret-scan.yml` — both are repository-agnostic.
- The "Validation performed" section of `.github/PULL_REQUEST_TEMPLATE.md`.

Adapt per repository:

- **Level 0 commands** — the concrete build and typecheck invocations.
- **Level 1 inventory** — the Build workflow's jobs reflect this repository's
  stack (pnpm/Turborepo plus two Python packages). The *shape* stays the same:
  install from a locked manifest, build, typecheck, smoke-import.
- **Level 3** — the deployment surface: compose file, Kubernetes manifests,
  health endpoints.

Constant across every repository, whatever the stack:

1. CI proves the project still **builds and installs**.
2. A human proves it still **works**, and writes that down.
3. No secrets, ever, in history or images.
4. The absence of unit tests is stated openly, not hidden.

---

## Related documents

- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to contribute
- [SETUP.md](../SETUP.md) — install, configure, run, deploy
- [HOW_TO_USE.md](../HOW_TO_USE.md) — user-facing behaviour, useful when writing test cases
- [docs/RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) — pre-release gate
- [docs/MAINTAINER_ROLES.md](MAINTAINER_ROLES.md) — who approves what
- [SECURITY.md](../SECURITY.md) — reporting a vulnerability or a leaked credential
