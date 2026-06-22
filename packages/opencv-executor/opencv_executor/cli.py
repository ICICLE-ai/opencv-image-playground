"""
Command-line interface for cvpipeline.
Usage:
    opencv_executor run operations.json input.jpg output.jpg
    opencv_executor batch operations.json input_folder/ output_folder/
"""

import argparse
import sys

from .core import load_pipeline, process_file, batch_run, PipelineError


def main():
    parser = argparse.ArgumentParser(prog="opencv_executor")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # cvpipeline run operations.json input.jpg output.jpg
    run_parser = subparsers.add_parser("run", help="Process a single image")
    run_parser.add_argument("pipeline", help="Path to operations.json")
    run_parser.add_argument("input", help="Input image path")
    run_parser.add_argument("output", help="Output image path")

    # cvpipeline batch operations.json input_dir/ output_dir/
    batch_parser = subparsers.add_parser("batch", help="Process a folder of images")
    batch_parser.add_argument("pipeline", help="Path to operations.json")
    batch_parser.add_argument("input_dir", help="Folder of input images")
    batch_parser.add_argument("output_dir", help="Folder to write processed images")

    args = parser.parse_args()

    try:
        pipeline = load_pipeline(args.pipeline)
    except PipelineError as e:
        print(f"Error loading pipeline: {e}", file=sys.stderr)
        sys.exit(1)

    if args.command == "run":
        try:
            process_file(args.input, args.output, pipeline)
            print(f"Wrote {args.output}")
        except PipelineError as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)

    elif args.command == "batch":
        def progress(i, total, filename):
            print(f"[{i}/{total}] {filename}")

        summary = batch_run(args.input_dir, args.output_dir, pipeline, on_progress=progress)
        print(f"\nDone: {summary['succeeded']}/{summary['total']} succeeded")
        if summary["failed"]:
            print(f"{summary['failed']} failed:")
            for failure in summary["failed_details"]:
                print(f"  {failure['file']}: {failure['error']}")


if __name__ == "__main__":
    main()