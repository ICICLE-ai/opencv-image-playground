#!/usr/bin/env python3
"""
preprocess.py — Tapis batch pre-processing entrypoint.

Runs *inside* the Singularity/Apptainer container. Takes an input directory, an
output directory, and an exported ``operations.json`` pipeline (produced by the
OpenCV Image Playground), then applies every enabled step to **every image in
every subdirectory** under the input, mirroring the folder structure into the
output directory.

It is a thin wrapper around the ``opencv_executor`` library — all the real image
work lives there (see ``opencv_executor.batch_run_recursive``).

Configuration is read from CLI arguments first, then from environment variables
(so a Tapis app can supply values either as ``appArgs`` or as ``envVariables``):

    --input   / INPUT_DIR      Directory of images to process (recursed).
    --output  / OUTPUT_DIR     Directory to write processed images into.
    --pipeline/ PIPELINE_FILE  Path to the operations.json pipeline file.
    --extensions / IMAGE_EXTENSIONS
                               Comma-separated list of file extensions to treat
                               as images. Defaults to the common raster formats.

On completion a ``preprocess_summary.json`` report is written into the output
directory. The process exits:
    0  every image processed successfully (or there were no images to process),
    2  some images failed but others succeeded (partial success),
    1  a fatal/configuration error occurred (nothing could run).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from opencv_executor import batch_run_recursive, load_pipeline, PipelineError

DEFAULT_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif")

# Exit codes — meaningful to Tapis, which surfaces the job as FAILED on non-zero.
EXIT_OK = 0
EXIT_FATAL = 1
EXIT_PARTIAL = 2


def _log(msg: str) -> None:
    """Timestamped line-buffered log — shows up in the Tapis job output files."""
    print(f"[preprocess] {msg}", flush=True)


def _resolve(cli_value: str | None, env_key: str) -> str | None:
    """CLI argument wins; otherwise fall back to the environment variable."""
    if cli_value:
        return cli_value
    env_value = os.environ.get(env_key)
    return env_value if env_value else None


def _parse_extensions(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return DEFAULT_EXTENSIONS
    exts = []
    for part in raw.split(","):
        part = part.strip().lower()
        if not part:
            continue
        exts.append(part if part.startswith(".") else f".{part}")
    return tuple(exts) if exts else DEFAULT_EXTENSIONS


def parse_config(argv: list[str] | None = None) -> dict:
    parser = argparse.ArgumentParser(
        prog="preprocess",
        description="Recursively apply an OpenCV Image Playground pipeline to a "
                    "directory tree of images.",
    )
    parser.add_argument("--input", help="Input image directory (recursed). "
                                        "Falls back to $INPUT_DIR.")
    parser.add_argument("--output", help="Output directory. Falls back to $OUTPUT_DIR.")
    parser.add_argument("--pipeline", help="Path to operations.json. "
                                           "Falls back to $PIPELINE_FILE.")
    parser.add_argument("--extensions", help="Comma-separated image extensions. "
                                             "Falls back to $IMAGE_EXTENSIONS.")
    args = parser.parse_args(argv)

    input_dir = _resolve(args.input, "INPUT_DIR")
    output_dir = _resolve(args.output, "OUTPUT_DIR")
    pipeline_file = _resolve(args.pipeline, "PIPELINE_FILE")
    extensions = _parse_extensions(_resolve(args.extensions, "IMAGE_EXTENSIONS"))

    missing = [
        name
        for name, value in (
            ("input (--input/$INPUT_DIR)", input_dir),
            ("output (--output/$OUTPUT_DIR)", output_dir),
            ("pipeline (--pipeline/$PIPELINE_FILE)", pipeline_file),
        )
        if not value
    ]
    if missing:
        parser.error("missing required configuration: " + ", ".join(missing))

    return {
        "input_dir": Path(input_dir),
        "output_dir": Path(output_dir),
        "pipeline_file": Path(pipeline_file),
        "extensions": extensions,
    }


def main(argv: list[str] | None = None) -> int:
    started = time.time()

    try:
        cfg = parse_config(argv)
    except SystemExit as e:
        # argparse already printed a helpful message.
        return EXIT_FATAL if e.code else EXIT_OK

    input_dir: Path = cfg["input_dir"]
    output_dir: Path = cfg["output_dir"]
    pipeline_file: Path = cfg["pipeline_file"]
    extensions: tuple[str, ...] = cfg["extensions"]

    _log(f"input     : {input_dir}")
    _log(f"output    : {output_dir}")
    _log(f"pipeline  : {pipeline_file}")
    _log(f"extensions: {', '.join(extensions)}")

    if not input_dir.is_dir():
        _log(f"FATAL: input directory does not exist: {input_dir}")
        return EXIT_FATAL

    try:
        pipeline = load_pipeline(pipeline_file)
    except PipelineError as e:
        _log(f"FATAL: {e}")
        return EXIT_FATAL

    enabled_steps = [
        s.get("op") for s in pipeline.get("steps", []) if s.get("enabled", True)
    ]
    _log(f"pipeline '{pipeline.get('name', 'unnamed')}' with "
         f"{len(enabled_steps)} enabled step(s): {', '.join(enabled_steps) or '(none)'}")

    def on_progress(i: int, total: int, rel_path: str) -> None:
        _log(f"[{i}/{total}] {rel_path}")

    try:
        summary = batch_run_recursive(
            input_dir,
            output_dir,
            pipeline,
            extensions=extensions,
            on_progress=on_progress,
        )
    except Exception as e:  # defensive — batch_run_recursive shouldn't raise per-file
        _log(f"FATAL: unexpected error during batch run: {e}")
        return EXIT_FATAL

    elapsed = time.time() - started
    summary["elapsed_seconds"] = round(elapsed, 2)
    summary["pipeline_name"] = pipeline.get("name")
    summary["input_dir"] = str(input_dir)
    summary["output_dir"] = str(output_dir)

    # Persist a machine-readable report next to the outputs.
    report_path = output_dir / "preprocess_summary.json"
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(summary, indent=2))
        _log(f"wrote summary report: {report_path}")
    except OSError as e:
        _log(f"WARNING: could not write summary report: {e}")

    _log(
        f"done in {elapsed:.1f}s — "
        f"{summary['succeeded']}/{summary['total']} succeeded, "
        f"{summary['failed']} failed"
    )
    for failure in summary["failed_details"]:
        _log(f"  FAILED {failure['file']}: {failure['error']}")

    if summary["total"] == 0:
        _log("no matching images found — nothing to do")
        return EXIT_OK
    if summary["failed"] and summary["succeeded"] == 0:
        return EXIT_FATAL
    if summary["failed"]:
        return EXIT_PARTIAL
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
