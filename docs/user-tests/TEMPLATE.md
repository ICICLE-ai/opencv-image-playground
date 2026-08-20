<!--
Copy this file to docs/user-tests/YYYY-MM-DD-<short-slug>.md and fill it in.
Delete every instruction comment and any section that genuinely does not apply.
See ../TESTING.md for the rules.
-->

# User Test — <short title of what was tested>

| | |
| --- | --- |
| **Date** | YYYY-MM-DD |
| **Tester** | Name (GitHub handle) |
| **Pull request / issue** | #NN |
| **Commit tested** | `<short SHA>` |
| **Result** | Pass / Pass with issues / Fail |

## Environment

| | |
| --- | --- |
| OS | e.g. macOS 15.5 / Ubuntu 24.04 |
| Browser | e.g. Chrome 140 (skip if not applicable) |
| Node / pnpm | e.g. 20.11.0 / 9.0.0 |
| Python | e.g. 3.11.9 |
| Run as | Dev server / `docker compose -f docker-compose.yaml up --build` / deployed URL |

## Scope

<!-- One or two sentences. What is this change supposed to do, from a user's point of view? -->

## Preconditions

<!-- What must be true before step 1. Sample image committed at a path, a signed-in
     Tapis session, a configured environment variable, a registered Tapis app. -->

- 

## Test cases

<!-- Number them. Write steps a stranger could follow. Fill "Expected" before you run. -->

| # | Steps | Expected result | Actual result | Pass/Fail |
| --- | --- | --- | --- | --- |
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |

## Edge cases

<!-- The boundaries you pushed: empty input, very large image, unsupported format,
     zero / negative / maximum parameter value, an operation removed mid-pipeline. -->

| # | Steps | Expected result | Actual result | Pass/Fail |
| --- | --- | --- | --- | --- |
| 1 |  |  |  |  |

## Failure cases

<!-- Things that SHOULD fail. Confirm they fail cleanly with a useful message
     rather than hanging, crashing, or silently producing a wrong image. -->

| # | Steps | Expected failure | Actual behaviour | Pass/Fail |
| --- | --- | --- | --- | --- |
| 1 |  |  |  |  |

## Regression check

<!-- The neighbouring behaviour you did not intend to touch, and confirmed still works. -->

- 

## Evidence

<!-- Screenshots, a short recording, terminal output, the exported operations.json.
     Public, synthetic, or de-identified data only. -->

## Issues found

<!-- Anything that failed or looked wrong. Link the issue you opened, or note the
     commit that fixed it in this same pull request. "None" is a valid answer. -->

- 

## Not tested

<!-- Be honest. Paths you could not reach — no HPC allocation, no Tapis tenant,
     no Windows machine. A stated gap is useful; a silent one is not. -->

- 
