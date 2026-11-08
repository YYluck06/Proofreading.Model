#!/usr/bin/env python3
"""Generate the TypeScript configuration module consumed by the Cloudflare Worker.

``config/*.json`` is the single source of truth. Both the Python engine and the
Worker read the same data; for the Worker it is emitted as a checked-in
TypeScript module so the bundle has no runtime JSON fetch and the build stays
hermetic.

Usage::

    python tools/sync_worker_config.py            # write the generated module
    python tools/sync_worker_config.py --check    # fail if the module is stale (CI)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "core"))

from riskcore import load_default_config  # noqa: E402

TARGET = REPO_ROOT / "apps" / "worker" / "src" / "generated" / "config.ts"

HEADER = """// AUTO-GENERATED FILE - DO NOT EDIT BY HAND.
// Source: config/questionnaire.json, config/scoring.json, config/calibration.json
// Regenerate with: python tools/sync_worker_config.py
// CI fails when this file is out of date.
import type { EngineConfig } from "../types.js";

export const CONFIG = __PAYLOAD__ satisfies EngineConfig;
"""


def build_payload() -> dict:
    config = load_default_config()
    data = config.to_dict()
    return {
        "questionnaire_version": data["questionnaire_version"],
        "engine_version": data["engine_version"],
        "title": data["title"],
        "description": data["description"],
        "scale": data["scale"],
        "sections": data["sections"],
        "groups": data["groups"],
        "core_items": data["core_items"],
        "thresholds": data["thresholds"],
        "neutral_coefficient": data["neutral_coefficient"],
        "coverage_floor": data["coverage_floor"],
        "protection_cap": data["protection_cap"],
        "alerts": data["alerts"],
        "disclaimer": data["disclaimer"],
        "calibration": {
            "default_role": config.calibration.default_role,
            "version": config.calibration.version,
            "maps": config.calibration.maps,
        },
    }


def render(payload: dict) -> str:
    body = json.dumps(payload, indent=2, ensure_ascii=True, sort_keys=False)
    return HEADER.replace("__PAYLOAD__", body)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the generated file is current")
    args = parser.parse_args(argv)

    rendered = render(build_payload())
    if args.check:
        existing = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
        if existing != rendered:
            print(f"{TARGET.relative_to(REPO_ROOT)} is out of date. Run: python tools/sync_worker_config.py", file=sys.stderr)
            return 1
        print(f"{TARGET.relative_to(REPO_ROOT)} is up to date.")
        return 0

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(rendered, encoding="utf-8", newline="\n")
    print(f"wrote {TARGET.relative_to(REPO_ROOT)} ({len(rendered)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
