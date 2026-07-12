# tapis-job — containerized batch pre-processing for Tapis

Runs an exported **OpenCV Image Playground** pipeline (`operations.json`) against
**every image in every subdirectory** of an input directory, mirroring the
folder structure into an output directory. Packaged as a Singularity/Apptainer
container so it can be launched as a [Tapis job](https://tapis-project.github.io/live-docs/?service=Jobs).

This is step 2 of the preprocessing workflow: the standalone app (step 1)
submits a Tapis job that runs *this* container; the portal app (step 3) is built
around the Tapis app defined here.

## Contents

| File | Purpose |
| --- | --- |
| [`preprocess.py`](preprocess.py) | Container entrypoint. Thin wrapper over `opencv_executor.batch_run_recursive`. |
| [`Singularity.def`](Singularity.def) | Apptainer definition that bundles the library + entrypoint into a `.sif`. |
| [`tapis/app.json`](tapis/app.json) | Tapis **app** definition template (register once). |
| [`tapis/job-request.json`](tapis/job-request.json) | Tapis **job submission** body template (per run). |

The actual image operations live in the `opencv-executor` package
([`../opencv-executor`](../opencv-executor)); this package only adds the
recursive directory walk, the Tapis-friendly entrypoint, and the container.

## Entrypoint

Configuration comes from CLI args first, then environment variables (so a Tapis
app can supply values as `appArgs` **or** `envVariables`):

| CLI | Env var | Meaning |
| --- | --- | --- |
| `--input` | `INPUT_DIR` | Directory of images to process (recursed). **Required.** |
| `--output` | `OUTPUT_DIR` | Directory to write processed images into. **Required.** |
| `--pipeline` | `PIPELINE_FILE` | Path to `operations.json`. **Required.** |
| `--extensions` | `IMAGE_EXTENSIONS` | Comma-separated extensions. Default: `.jpg,.jpeg,.png,.bmp,.tiff,.tif` |

A `preprocess_summary.json` report is written into the output directory. Exit
codes: `0` all succeeded (or nothing to do), `2` partial success, `1` fatal /
config error — Tapis marks the job `FAILED` on any non-zero code.

## Build the container

Build **from the repository root** so the `%files` paths in the definition
resolve:

```bash
apptainer build preprocess.sif packages/tapis-job/Singularity.def
```

Smoke-test locally:

```bash
apptainer run \
  --bind /data/in:/in --bind /data/out:/out \
  --bind "$PWD/operations.json:/pipeline.json" \
  preprocess.sif --input /in --output /out --pipeline /pipeline.json
```

Then stage `preprocess.sif` onto your Tapis execution system (e.g. under an
`apps/` directory) and set `containerImage` in `tapis/app.json` to its path.

## Register the Tapis app (once)

Fill in the `REPLACE_ME_*` values in [`tapis/app.json`](tapis/app.json) and
register it:

```bash
curl -X POST -H "X-Tapis-Token: $JWT" -H "Content-Type: application/json" \
  -d @packages/tapis-job/tapis/app.json \
  "$TAPIS_BASE_URL/v3/apps"
```

## Submit a job (per run)

The standalone app builds this request from the form (input dir, output dir,
selected systems, and the compute-parameter columns → `nodeCount`,
`coresPerNode`, `memoryMB`, `maxMinutes`). To submit by hand, fill in
[`tapis/job-request.json`](tapis/job-request.json) and POST it:

```bash
curl -X POST -H "X-Tapis-Token: $JWT" -H "Content-Type: application/json" \
  -d @packages/tapis-job/tapis/job-request.json \
  "$TAPIS_BASE_URL/v3/jobs/submit"
```

`archiveSystemDir` is where processed images land — the "output directory on the
selected Tapis system." The job stages the input directory and `operations.json`
in, runs the container recursively, and archives the mirrored output tree back
out.
