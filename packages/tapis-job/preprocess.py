#!/usr/bin/env python3
"""
preprocess.py — Tapis batch pre-processing entrypoint.

Runs inside the Singularity/Apptainer container. It applies an exported
operations.json pipeline recursively and mirrors the input directory structure
into the output directory.

Metadata preservation:
    1. Capture metadata from every source image.
    2. Run the existing OpenCV batch processor.
    3. Restore compatible metadata to matching output images.

Metadata failures are reported in preprocess_summary.json but do not change
the image-processing exit code.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from opencv_executor import batch_run_recursive, load_pipeline, PipelineError
import metadata_utils


DEFAULT_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif")

EXIT_OK = 0
EXIT_FATAL = 1
EXIT_PARTIAL = 2


def _log(message: str) -> None:
    print(f"[preprocess] {message}", flush=True)


def _resolve(cli_value: str | None, env_key: str) -> str | None:
    if cli_value:
        return cli_value
    env_value = os.environ.get(env_key)
    return env_value if env_value else None


def _parse_extensions(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return DEFAULT_EXTENSIONS

    extensions: list[str] = []
    for part in raw.split(","):
        extension = part.strip().lower()
        if not extension:
            continue
        extensions.append(
            extension if extension.startswith(".") else f".{extension}"
        )

    return tuple(extensions) if extensions else DEFAULT_EXTENSIONS


def _parse_env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default

    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def parse_config(argv: list[str] | None = None) -> dict:
    parser = argparse.ArgumentParser(
        prog="preprocess",
        description=(
            "Recursively apply an OpenCV Image Playground pipeline to a "
            "directory tree of images."
        ),
    )

    parser.add_argument(
        "--input",
        help="Input image directory. Falls back to $INPUT_DIR.",
    )
    parser.add_argument(
        "--output",
        help="Output directory. Falls back to $OUTPUT_DIR.",
    )
    parser.add_argument(
        "--pipeline",
        help="Path to operations.json. Falls back to $PIPELINE_FILE.",
    )
    parser.add_argument(
        "--extensions",
        help=(
            "Comma-separated image extensions. "
            "Falls back to $IMAGE_EXTENSIONS."
        ),
    )
    parser.add_argument(
        "--no-preserve-metadata",
        action="store_true",
        help=(
            "Disable metadata capture and restoration. "
            "Metadata preservation is enabled by default."
        ),
    )

    args = parser.parse_args(argv)

    input_dir = _resolve(args.input, "INPUT_DIR")
    output_dir = _resolve(args.output, "OUTPUT_DIR")
    pipeline_file = _resolve(args.pipeline, "PIPELINE_FILE")
    extensions = _parse_extensions(
        _resolve(args.extensions, "IMAGE_EXTENSIONS")
    )

    preserve_metadata = (
        not args.no_preserve_metadata
        and _parse_env_bool("PRESERVE_METADATA", True)
    )

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
        parser.error(
            "missing required configuration: " + ", ".join(missing)
        )

    return {
        "input_dir": Path(input_dir),
        "output_dir": Path(output_dir),
        "pipeline_file": Path(pipeline_file),
        "extensions": extensions,
        "preserve_metadata": preserve_metadata,
    }


def main(argv: list[str] | None = None) -> int:
    started = time.time()

    try:
        config = parse_config(argv)
    except SystemExit as exc:
        return EXIT_FATAL if exc.code else EXIT_OK

    input_dir: Path = config["input_dir"]
    output_dir: Path = config["output_dir"]
    pipeline_file: Path = config["pipeline_file"]
    extensions: tuple[str, ...] = config["extensions"]
    preserve_metadata: bool = config["preserve_metadata"]

    _log(f"input              : {input_dir}")
    _log(f"output             : {output_dir}")
    _log(f"pipeline           : {pipeline_file}")
    _log(f"extensions         : {', '.join(extensions)}")
    _log(f"preserve metadata  : {preserve_metadata}")

    if not input_dir.is_dir():
        _log(f"FATAL: input directory does not exist: {input_dir}")
        return EXIT_FATAL

    if preserve_metadata:
        exiftool_ok, exiftool_error = metadata_utils.check_exiftool_available()
        if not exiftool_ok:
            _log(f"FATAL: {exiftool_error}")
            return EXIT_FATAL

    try:
        pipeline = load_pipeline(pipeline_file)
    except PipelineError as exc:
        _log(f"FATAL: {exc}")
        return EXIT_FATAL

    enabled_steps = [
        step.get("op")
        for step in pipeline.get("steps", [])
        if step.get("enabled", True)
    ]
    _log(
        f"pipeline '{pipeline.get('name', 'unnamed')}' with "
        f"{len(enabled_steps)} enabled step(s): "
        f"{', '.join(enabled_steps) or '(none)'}"
    )

    def on_progress(index: int, total: int, relative_path: str) -> None:
        _log(f"[{index}/{total}] {relative_path}")

    captured_metadata: dict[str, dict] = {}
    metadata_report: dict = {
        "enabled": preserve_metadata,
        "capture": {},
        "restore": {},
    }

    # Task 1: capture source metadata before OpenCV processing.
    if preserve_metadata:
        captured_metadata, capture_report = metadata_utils.capture_tree(
            input_dir,
            extensions,
        )
        metadata_report["capture"] = capture_report
        _log(
            "metadata capture: "
            f"{capture_report['captured']}/{capture_report['inspected']} "
            "image(s) inspected successfully"
        )

    try:
        summary = batch_run_recursive(
            input_dir,
            output_dir,
            pipeline,
            extensions=extensions,
            on_progress=on_progress,
        )
    except Exception as exc:
        _log(f"FATAL: unexpected error during batch run: {exc}")
        return EXIT_FATAL

    # Task 2: restore compatible metadata to processed outputs.
    if preserve_metadata and captured_metadata:
        restore_report = metadata_utils.restore_tree(
            output_dir,
            input_dir,
            captured_metadata,
            extensions,
        )
        metadata_report["restore"] = restore_report
        _log(
            "metadata restore: "
            f"{restore_report['restore_succeeded']}/"
            f"{restore_report['restore_attempted']} succeeded"
        )

    elapsed = time.time() - started
    summary["elapsed_seconds"] = round(elapsed, 2)
    summary["pipeline_name"] = pipeline.get("name")
    summary["input_dir"] = str(input_dir)
    summary["output_dir"] = str(output_dir)
    summary["metadata"] = metadata_report

    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "preprocess_summary.json"

    try:
        report_path.write_text(
            json.dumps(summary, indent=2, default=str),
            encoding="utf-8",
        )
        _log(f"wrote summary report: {report_path}")
    except OSError as exc:
        _log(f"WARNING: could not write summary report: {exc}")

    _log(
        f"done in {elapsed:.1f}s — "
        f"{summary['succeeded']}/{summary['total']} succeeded, "
        f"{summary['failed']} failed"
    )

    for failure in summary.get("failed_details", []):
        _log(
            f"  FAILED {failure.get('file', '<unknown>')}: "
            f"{failure.get('error', '<unknown error>')}"
        )

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