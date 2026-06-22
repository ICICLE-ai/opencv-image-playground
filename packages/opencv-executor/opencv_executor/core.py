"""
Core pipeline loading and execution logic.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .ops import OP_MAP


class PipelineError(Exception):
    """Raised when a pipeline file is invalid or an op fails unrecoverably."""


def load_pipeline(path: str | Path) -> dict[str, Any]:
    """
    Load and validate an operations.json file.
    Raises PipelineError if the file is malformed or missing required fields.
    """
    path = Path(path)
    if not path.exists():
        raise PipelineError(f"Pipeline file not found: {path}")

    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        raise PipelineError(f"Invalid JSON in {path}: {e}")

    if "steps" not in data:
        raise PipelineError(f"Pipeline file missing 'steps' key: {path}")

    for i, step in enumerate(data["steps"]):
        if "op" not in step:
            raise PipelineError(f"Step {i} missing 'op' key")
        if step["op"] not in OP_MAP:
            raise PipelineError(f"Step {i} uses unknown op: '{step['op']}'")

    return data


def run_pipeline(image: np.ndarray, pipeline: dict[str, Any]) -> np.ndarray:
    """
    Apply every enabled step in the pipeline to a single image.
    Returns the final processed image.
    If a step fails, raises PipelineError with context about which step failed.
    """
    current = image

    for i, step in enumerate(pipeline["steps"]):
        if not step.get("enabled", True):
            continue

        op_fn = OP_MAP[step["op"]]
        try:
            current = op_fn(current, step.get("params", {}))
        except Exception as e:
            raise PipelineError(
                f"Step {i} ('{step['op']}') failed: {e}"
            ) from e

    return current


def process_file(input_path: str | Path, output_path: str | Path, pipeline: dict[str, Any]) -> None:
    """Read an image file, run the pipeline, write the result to disk."""
    input_path = Path(input_path)
    output_path = Path(output_path)

    img = cv2.imread(str(input_path))
    if img is None:
        raise PipelineError(f"Could not read image: {input_path}")

    result = run_pipeline(img, pipeline)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), result)


def batch_run(
    input_dir: str | Path,
    output_dir: str | Path,
    pipeline: dict[str, Any],
    extensions: tuple[str, ...] = (".jpg", ".jpeg", ".png", ".bmp", ".tiff"),
    on_progress: callable | None = None,
) -> dict[str, Any]:
    """
    Apply a pipeline to every image in input_dir, writing results to output_dir.
    Returns a summary dict with counts of succeeded/failed files and error details.

    on_progress, if provided, is called as on_progress(current_index, total, filename)
    after each file — useful for showing a progress bar in calling code.
    """
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(
        f for f in input_dir.iterdir()
        if f.is_file() and f.suffix.lower() in extensions
    )

    succeeded = []
    failed = []

    for i, file in enumerate(files):
        output_path = output_dir / file.name
        try:
            process_file(file, output_path, pipeline)
            succeeded.append(file.name)
        except PipelineError as e:
            failed.append({"file": file.name, "error": str(e)})

        if on_progress:
            on_progress(i + 1, len(files), file.name)

    return {
        "total": len(files),
        "succeeded": len(succeeded),
        "failed": len(failed),
        "failed_details": failed,
    }