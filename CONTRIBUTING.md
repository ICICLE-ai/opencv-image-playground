# Contributing

Thank you for helping improve this project. Contributions may include bug reports, documentation improvements, tests, examples, workflow or configuration artifacts, data/annotation schemas, and code changes.

## Before contributing

1. Read the README and relevant documentation.
2. Review open issues and pull requests to avoid duplicate work.
3. Do not submit credentials, private keys, proprietary data, restricted data, sensitive locations, personally identifiable information, or material that you are not authorized to share.
4. Use the issue templates to report a problem or propose a change before beginning a substantial contribution.

## Contribution pathway

The project welcomes contributions in increasing order of technical and maintenance responsibility:

1. Execute an example and report a problem.
2. Improve documentation or examples.
3. Add or improve a test.
4. Propose a workflow, configuration, annotation, or other non-code artifact.
5. Prepare a bounded code contribution.

For domain-specific contribution requirements, follow the repository's contribution specification in `docs/`.

## Testing

Before opening a pull request, read `docs/TESTING.md`. It defines how change is verified here, what CI checks on every pull request, and what you must do for a change to be mergeable and deployable.

In short:

1. Run the local pre-submit checks — `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm -r run typecheck` — plus the Python install-and-import checks if you touched a Python package.
2. Three workflows must pass on your pull request: **Build**, **Repository health**, and **Secret Scan**.
3. If your change alters behavior a user can observe, exercise it yourself and commit a user test document in `docs/user-tests/`, starting from `docs/user-tests/TEMPLATE.md`.
4. If your change touches the build, the containers, the Kubernetes manifests, or environment variables, verify it runs under `docker compose -f docker-compose.yaml up --build`.

Unit tests are not currently required — that suite is deliberately deferred and will be added later. Because of that, the user test document is the project's test record and is not optional when it applies. Volunteered tests are welcome; ask a maintainer where to put them rather than introducing a test framework in an unrelated pull request.

## Pull requests

A pull request should:

- Reference the related issue or explain the problem being addressed.
- Be limited to one coherent change.
- Include a user test document when the change is user-visible, per `docs/TESTING.md`.
- Update documentation when user-visible behavior, interfaces, configuration, installation, or limitations change.
- Identify dependencies, data assumptions, security implications, and maintenance implications.
- State known verification gaps rather than leaving them implicit.
- Not include secrets, large unreviewed binary assets, private datasets, or unlicensed materials.

Maintainers may request changes, defer a contribution, or decline it when the change lacks a clear maintenance owner, conflicts with project scope, introduces unacceptable security or data risks, or cannot be reviewed with available resources.

## License and contributor rights

By submitting a contribution, you represent that you have the right to submit it and that it may be distributed under this repository's license. If your employer, institution, funder, or data provider imposes restrictions, obtain authorization before contributing.

## Security issues

Do not report suspected vulnerabilities in a public issue. Follow `SECURITY.md`.
