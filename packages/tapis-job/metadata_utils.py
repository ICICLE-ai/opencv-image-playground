"""
metadata_utils.py — capture and restore metadata around an OpenCV batch run,
using exiftool rather than re-encoding through Pillow.

Why exiftool instead of Pillow:
    Pillow's Image.save() approach (see the earlier version of this module)
    requires decoding and *re-encoding* the JPEG pixel data just to attach
    metadata, even when using qtables=... to match the original compression
    settings as closely as possible. exiftool instead edits the metadata
    segments (APP1/EXIF, APP2/ICC, PNG text chunks, TIFF IFD tags) directly
    and leaves the compressed pixel data completely untouched — verified
    byte-for-byte identical before/after in testing. That's a strictly
    better guarantee than "same quality settings": zero generational loss,
    full stop, and no dependency on the pipeline's chosen JPEG quality.

    It also means TIFF's structural tags (ImageWidth/ImageLength/strip
    offsets/etc.) can't accidentally get clobbered by hand-copied tags: `-n
    -TagsFromFile ... -all:all` (without `-unsafe`) already excludes
    ExifTool's built-in "Unsafe" tag group, which covers exactly these
    structural fields, rather than relying on a manually maintained
    exclusion list.

Requirements:
    The `exiftool` binary must be present in the container
    (Debian/Ubuntu: `apt-get install -y libimage-exiftool-perl`).
    Add that to Singularity.def alongside the Python dependencies.

Design (same two-task shape as before):
    1. capture_tree()  — before OpenCV processing, record *whether* each
       source image has metadata worth restoring (used for reporting only —
       the actual bytes are read from the source file again at restore
       time, not carried through Python).
    2. batch_run_recursive() — unchanged, does the pixel processing.
    3. restore_tree()  — for each output file, run exiftool with
       -TagsFromFile pointed at the *original* source file (input_dir must
       still exist on disk at this point, which it does inside the
       container for the lifetime of the job).

Important:
    - Metadata failures are reported but never change the pixel-processing
      exit code.
    - EXIF thumbnails are removed (`-ThumbnailImage=`) because they were
      generated from the original, now-superseded pixels.
    - EXIF Orientation is reset to 1 (see the same rationale as before: the
      output pixels are the final stored orientation, since cv2 never
      applies the source orientation tag on read).
    - EXIF ExifImageWidth/ExifImageHeight are corrected to the processed
      image's actual dimensions.
    - Structural/pixel-layout tags (TIFF ImageWidth, StripOffsets, etc.) are
      never copied — ExifTool's default "Unsafe" exclusion handles this.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Optional

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}

# exiftool can read BMP (for the capture-report presence check) but cannot
# write to it at all — "Writing of BMP files is not yet supported" is a
# permanent exiftool limitation, not a per-file error. Skip these
# proactively in restore_tree rather than reporting one failure per BMP.
WRITE_UNSUPPORTED_EXTENSIONS = {".bmp"}

EXIFTOOL_BIN = os.environ.get("EXIFTOOL_PATH") or shutil.which("exiftool") or "exiftool"

# Whether cv2.imread (inside opencv_executor) applies the source EXIF
# orientation tag when loading determines which mode is correct.
#
# CONFIRMED against this project's actual opencv_executor/core.py
# (process_file calls cv2.imread(str(input_path)) with no flags — no
# IMREAD_IGNORE_ORIENTATION): OpenCV's default flags already apply EXIF
# orientation on load (verified empirically — a synthetic JPEG with a known
# asymmetric marker and Orientation=6 came out of cv2.imread() with the same
# size and marker position as Pillow's trusted ImageOps.exif_transpose
# ground truth). cv2.imwrite never writes an orientation tag back out. So by
# the time this module runs, output pixels are already in their final,
# correct visual orientation with no tag attached — "reset" is the right
# default for THIS codebase.
#
#   "reset" (default, confirmed correct here): writes Orientation=1 on the
#       output, since the pixels are already right-side-up.
#   "copy": only relevant if core.py's cv2.imread call is ever changed to
#       pass cv2.IMREAD_IGNORE_ORIENTATION or similar — re-check this
#       assumption if that call site changes.
#
# Override via the ORIENTATION_MODE environment variable if needed.
ORIENTATION_MODE = os.environ.get("ORIENTATION_MODE", "reset").strip().lower()
if ORIENTATION_MODE not in ("reset", "copy"):
    ORIENTATION_MODE = "reset"


@dataclass
class MetadataResult:
    file: str
    success: bool
    stage: str
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def check_exiftool_available() -> tuple[bool, Optional[str]]:
    """Call once at startup so a missing binary is a clear, early failure
    rather than N per-file failures deep into a batch."""
    try:
        result = subprocess.run(
            [EXIFTOOL_BIN, "-ver"], capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return True, None
        return False, result.stderr.strip() or "exiftool returned non-zero"
    except FileNotFoundError:
        return False, (
            "exiftool binary not found — install libimage-exiftool-perl "
            "in the container, or run with --no-preserve-metadata"
        )
    except Exception as exc:
        return False, str(exc)


# ------------------------------------------------------------- Task 1 -----

def _has_metadata(path: Path) -> tuple[bool, Optional[str]]:
    """Cheap presence check via exiftool -j, used only for the capture
    report — the restore step re-reads the source file directly and doesn't
    depend on anything captured here."""
    try:
        result = subprocess.run(
            [EXIFTOOL_BIN, "-j", "-q", str(path)],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            return False, result.stderr.strip() or "exiftool read failed"
        data = json.loads(result.stdout)[0]

        # Fields every file has regardless of embedded metadata, universal
        # across formats (some added by the OS, e.g. Windows' FileCreateDate
        # and Zone.Identifier marker on downloaded files).
        universal = {
            "SourceFile", "ExifToolVersion", "FileName", "Directory",
            "FileSize", "FileModifyDate", "FileAccessDate",
            "FileInodeChangeDate", "FileCreateDate", "FilePermissions",
            "FileType", "FileTypeExtension", "MIMEType",
            "ImageWidth", "ImageHeight", "ImageSize", "Megapixels",
            "ZoneIdentifier",
        }

        # Per-format baseline/structural fields present on EVERY file of
        # that type, camera/editor or not — verified empirically against a
        # bare Pillow-generated file of each format with no metadata added.
        per_format_boilerplate = {
            "JPEG": {"JFIFVersion", "EncodingProcess", "BitsPerSample",
                     "ColorComponents", "YCbCrSubSampling"},
            "PNG": {"BitDepth", "ColorType", "Compression", "Filter", "Interlace"},
            "BMP": {"BMPVersion", "Planes", "BitDepth", "Compression",
                    "ImageLength", "NumColors", "NumImportantColors",
                    "PixelsPerMeterX", "PixelsPerMeterY"},
            "TIFF": {"ExifByteOrder", "BitsPerSample", "Compression",
                     "PhotometricInterpretation", "StripOffsets",
                     "SamplesPerPixel", "RowsPerStrip", "StripByteCounts",
                     "PlanarConfiguration"},
        }
        file_type = data.get("FileType", "")
        boilerplate = universal | per_format_boilerplate.get(file_type, set())

        # Special case: JPEG's JFIF header always carries XResolution/
        # YResolution/ResolutionUnit, even with no DPI ever set — but unlike
        # the fields above, these aren't ALWAYS boilerplate: a real DPI
        # (e.g. 300/300/inches) uses these exact same tag names and IS
        # meaningful metadata worth restoring. Only treat them as
        # boilerplate when they match Pillow/libjpeg's specific
        # no-DPI-set default (1, 1, "None") — verified against a bare JPEG.
        if file_type == "JPEG" and (
            data.get("XResolution") == 1
            and data.get("YResolution") == 1
            and data.get("ResolutionUnit") == "None"
        ):
            boilerplate |= {"XResolution", "YResolution", "ResolutionUnit"}

        meaningful = set(data.keys()) - boilerplate
        return bool(meaningful), None
    except Exception as exc:
        return False, str(exc)


def capture_tree(
    input_dir: Path,
    extensions: tuple[str, ...],
) -> tuple[dict[str, bool], dict[str, Any]]:
    """Check every matching source image for metadata worth restoring.
    Returns a relpath -> has_metadata map (used only to decide whether to
    bother calling restore per file) plus a summary report."""
    presence: dict[str, bool] = {}
    failures: list[dict[str, Any]] = []
    inspected = 0
    with_metadata = 0

    for path in input_dir.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in extensions:
            continue
        inspected += 1
        relative = path.relative_to(input_dir).as_posix()
        has_meta, error = _has_metadata(path)
        if error:
            failures.append(MetadataResult(relative, False, "capture", error).to_dict())
            continue
        presence[relative] = has_meta
        if has_meta:
            with_metadata += 1

    report = {
        "inspected": inspected,
        "captured": len(presence),
        "with_metadata": with_metadata,
        "without_metadata": len(presence) - with_metadata,
        "capture_failed": len(failures),
        "capture_failure_details": failures,
    }
    return presence, report


# ------------------------------------------------------------- Task 2 -----

def _image_size(path: Path) -> Optional[tuple[int, int]]:
    try:
        result = subprocess.run(
            [EXIFTOOL_BIN, "-j", "-ImageWidth", "-ImageHeight", str(path)],
            capture_output=True, text=True, timeout=60,
        )
        data = json.loads(result.stdout)[0]
        return int(data["ImageWidth"]), int(data["ImageHeight"])
    except Exception:
        return None


def restore_metadata(source_path: Path, output_path: Path) -> tuple[bool, Optional[str]]:
    """Copy metadata from the original source file onto the already
    processed output file, in place, without touching pixel data."""
    size = _image_size(output_path)
    if size is None:
        return False, "could not read processed image dimensions"
    width, height = size

    cmd = [
        EXIFTOOL_BIN,
        "-n",                       # numeric tag values, not print-conversion strings
        "-overwrite_original",      # no .jpg_original backup file left behind
        "-P",                       # preserve the output file's filesystem mtime
        "-q", "-q",                 # quiet except real errors
        "-TagsFromFile", str(source_path),
        "-all:all",                 # copy everything *except* ExifTool's "Unsafe" tags
                                     # (structural/pixel-layout fields — see module docstring)
        "-icc_profile",             # -all:all does NOT copy ICC profiles by default
                                     # (ExifTool excludes this binary-blob group from
                                     # "all" unless requested explicitly). NOTE: this
                                     # must be the bare pseudo-tag "-icc_profile", NOT
                                     # "-ICC_Profile:all" — the latter is a silent
                                     # no-op (exits 0, reports "updated", copies
                                     # nothing) rather than an error, so it's easy to
                                     # ship believing it works. Verified empirically.
        f"-EXIF:ExifImageWidth={width}",
        f"-EXIF:ExifImageHeight={height}",
        f"-XMP-exif:PixelXDimension={width}",
        f"-XMP-exif:PixelYDimension={height}",
        "-ThumbnailImage=",         # drop the now-stale embedded thumbnail
        "-PreviewImage=",           # ...and any larger embedded preview (common in
        "-JpgFromRaw=",             # ...camera JPEG/RAW-derived files) — same staleness issue
    ]
    if ORIENTATION_MODE == "reset":
        # Pixels are assumed already right-side-up (see ORIENTATION_MODE docs).
        cmd.append("-EXIF:Orientation=1")
    # else "copy": -all:all already copied the source orientation tag through
    # unchanged — nothing further to add.
    cmd.append(str(output_path))
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except Exception as exc:
        return False, str(exc)

    if result.returncode != 0:
        return False, result.stderr.strip() or "exiftool exited non-zero"
    return True, None


def restore_tree(
    output_dir: Path,
    input_dir: Path,
    presence: dict[str, bool],
    extensions: tuple[str, ...],
) -> dict[str, Any]:
    """Restore metadata onto every output file whose relative path matches a
    captured source entry that actually had metadata."""
    attempted = 0
    succeeded = 0
    skipped_no_metadata = 0
    skipped_no_source = 0
    skipped_unsupported_format = 0
    failures: list[dict[str, Any]] = []

    for path in output_dir.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in extensions:
            continue
        relative = path.relative_to(output_dir).as_posix()

        if path.suffix.lower() in WRITE_UNSUPPORTED_EXTENSIONS:
            skipped_unsupported_format += 1
            continue

        if not presence.get(relative):
            skipped_no_metadata += 1
            continue

        source_path = input_dir / relative
        if not source_path.is_file():
            skipped_no_source += 1
            continue

        attempted += 1
        success, error = restore_metadata(source_path, path)
        if success:
            succeeded += 1
        else:
            failures.append(MetadataResult(relative, False, "restore", error).to_dict())

    return {
        "restore_attempted": attempted,
        "restore_succeeded": succeeded,
        "restore_failed": len(failures),
        "restore_skipped_no_metadata": skipped_no_metadata,
        "restore_skipped_no_source": skipped_no_source,
        "restore_skipped_unsupported_format": skipped_unsupported_format,
        "restore_failure_details": failures,
    }