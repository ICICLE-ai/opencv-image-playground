# User Tests

This directory is the project's test record.

We do not yet run automated unit tests (see
[docs/TESTING.md](../TESTING.md#current-position-on-unit-tests)). Until we do, the
evidence that a change works is a human exercising it and writing down what
happened. That write-up lives here.

## Adding one

1. Copy [TEMPLATE.md](TEMPLATE.md) to `YYYY-MM-DD-<short-slug>.md`.
   Example: `2026-08-19-gaussian-blur-radius.md`.
2. Fill it in while you test, not afterwards — write the expected result before
   you run the step.
3. Commit it in the same pull request as the code it verifies, and link it from
   the pull request's "Validation performed" section.

## Rules

- One document per pull request that needs one.
- Never edit a past document. A retest gets a new dated file.
- Public, synthetic, or de-identified images only — this is a public repository.
- Record failures and gaps. A document containing only passes is usually
  incomplete.

Full guidance, including which changes require a user test at all, is in
[docs/TESTING.md](../TESTING.md#user-test-documentation).
