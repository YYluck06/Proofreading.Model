#!/usr/bin/env python3
"""Generate the cross-language parity fixtures.

``tests/fixtures/parity_cases.json`` records, for a fixed set of answer maps, the
complete output of the Python engine. ``tests/python/test_engine.py`` asserts the
Python engine still produces it and ``tests/node/engine.test.mjs`` asserts the
TypeScript engine produces the same thing. Together they make the two
implementations provably equivalent for every band, every cap branch and every
normalisation shape.

Usage::

    python tools/generate_parity_fixtures.py          # rewrite the fixtures
    python tools/generate_parity_fixtures.py --check  # fail if they are stale
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "core"))

from riskcore import evaluate, load_default_config  # noqa: E402
from riskcore.config import Config, Item  # noqa: E402

TARGET = REPO_ROOT / "tests" / "fixtures" / "parity_cases.json"
FROZEN_NOW = datetime(2026, 1, 15, 9, 30, 0, tzinfo=timezone.utc)


def leaf_items(config: Config) -> List[Item]:
    items: List[Item] = []
    for section in config.sections:
        items.extend(section.items)
    return items


def full_answers(config: Config, mode: str) -> Dict[str, Any]:
    """Build a complete answer map: ``mode`` is 'benign', 'high_risk' or 'middling'."""
    answers: Dict[str, Any] = {}
    for item in leaf_items(config):
        entry: Dict[str, Any] = {}
        if item.options:
            if mode == "benign":
                chosen = max(item.options, key=lambda option: (option.protection, -option.risk))
            elif mode == "high_risk":
                chosen = max(item.options, key=lambda option: (option.risk, -option.protection))
            else:
                chosen = sorted(item.options, key=lambda option: option.risk)[len(item.options) // 2]
            entry["options"] = [chosen.id]
        if item.scale:
            if mode == "benign":
                entry["scale"] = 5 if item.scale.map_to == "protection" else 0
            elif mode == "high_risk":
                entry["scale"] = 0 if item.scale.map_to == "protection" else 5
            else:
                entry["scale"] = 3
        answers[item.key] = entry
    return answers


def cases(config: Config) -> List[Dict[str, Any]]:
    everything = full_answers(config, "middling")
    core_only = {
        key: everything[key]
        for key in ("a1", "a2", "a3_1", "a3_2", "b1_1", "b1_2", "c1", "d1", "e2")
        if key in everything
    }
    return [
        {
            "name": "empty_answers",
            "description": "No answers at all: coverage 0, alert must be 'insufficient'.",
            "role": "default",
            "answers": {},
        },
        {
            "name": "benign_complete",
            "description": "Every item answered in the most protective direction: alert 'green'.",
            "role": "default",
            "answers": full_answers(config, "benign"),
        },
        {
            "name": "high_risk_complete",
            "description": "Every item answered in the most risky direction: hard flags, 30% protection cap, alert 'red'.",
            "role": "default",
            "answers": full_answers(config, "high_risk"),
        },
        {
            "name": "middling_complete",
            "description": "Median-risk option everywhere, scale 3: exercises the 50%/80% cap branches.",
            "role": "default",
            "answers": everything,
        },
        {
            "name": "coverage_below_floor",
            "description": "Only the core domains answered: coverage under the floor short-circuits to 'insufficient'.",
            "role": "default",
            "answers": core_only,
        },
        {
            "name": "mixed_answer_shapes",
            "description": "Scalars, numeric strings and {option, scale} objects must normalise identically.",
            "role": "default",
            "answers": {
                "a1": "single_parent",
                "a2": "neglectful",
                "a3_1": 3,
                "a3_2": {"scale": "4"},
                "b1_1": {"scale": 2},
                "b1_2": 1,
                "b2": {"options": ["occasional_extreme"], "scale": 5},
                "b3": 2,
                "c1": {"option": "delinquent_peers", "scale": 4},
                "d1": {"options": ["occasional_absence"], "scale": 2},
                "e1a": 3,
                "f1": 5,
                "f2": 2,
                "g2": {"option": "impulse_spending", "scale": 2},
            },
        },
        {
            "name": "hard_flag_single_item",
            "description": "One hard trigger alone: cap drops to 30% even with modest totals.",
            "role": "default",
            "answers": {
                "a1": {"options": ["guardian_engaged"]},
                "a2": "violent",
                "a3_1": 1,
                "a3_2": 1,
                "b1_1": 1,
                "b1_2": 1,
            },
        },
    ]


def build() -> Dict[str, Any]:
    config = load_default_config()
    rendered: List[Dict[str, Any]] = []
    for case in cases(config):
        evaluation = evaluate(config, case["answers"], role=case["role"], generated_at=FROZEN_NOW)
        payload = evaluation.to_dict()
        payload.pop("generated_at", None)
        rendered.append(
            {
                "name": case["name"],
                "description": case["description"],
                "role": case["role"],
                "answers": case["answers"],
                "expected": payload,
            }
        )
    return {
        "generated_at": FROZEN_NOW.isoformat(),
        "engine_version": config.engine_version,
        "questionnaire_version": config.questionnaire_version,
        "note": "Generated by tools/generate_parity_fixtures.py. Do not edit by hand.",
        "cases": rendered,
    }


def render(fixture: Dict[str, Any]) -> str:
    return json.dumps(fixture, indent=2, ensure_ascii=True, sort_keys=False) + "\n"


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the fixtures are current")
    args = parser.parse_args(argv)

    rendered = render(build())
    if args.check:
        existing = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
        if existing != rendered:
            print(f"{TARGET.relative_to(REPO_ROOT)} is out of date. Run: python tools/generate_parity_fixtures.py", file=sys.stderr)
            return 1
        print(f"{TARGET.relative_to(REPO_ROOT)} is up to date.")
        return 0

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(rendered, encoding="utf-8", newline="\n")
    print(f"wrote {TARGET.relative_to(REPO_ROOT)} ({len(rendered)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
