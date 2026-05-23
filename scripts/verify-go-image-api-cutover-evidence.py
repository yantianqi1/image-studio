#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from go_image_api_cutover_bundle import (  # noqa: E402
    CutoverBundleValidationError,
    validate_cutover_evidence_bundle,
)


EXIT_INVALID_BUNDLE = 69


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Verify an archived Go image API cutover evidence bundle.")
    parser.add_argument("evidence_dir", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        manifest = validate_cutover_evidence_bundle(args.evidence_dir)
    except CutoverBundleValidationError as exc:
        print(f"invalid cutover evidence bundle: {exc}", file=sys.stderr)
        return EXIT_INVALID_BUNDLE
    decision = manifest["cutover_decision"]
    print(f"phase8_status={decision['phase8_status']}")
    print(f"go_image_api_read_default_allowed={str(decision['go_image_api_read_default_allowed']).lower()}")
    print(f"go_image_api_create_default_allowed={str(decision['go_image_api_create_default_allowed']).lower()}")
    print(f"next_action={decision['next_action']}")
    return int(manifest["checker_exit_code"])


if __name__ == "__main__":
    sys.exit(main())
