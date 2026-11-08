"""Command line interface: score an answer set from a JSON file or stdin.

Examples::

    python -m riskcore.cli --answers answers.json
    echo '{"a1":["no_caregiver"],"b1_2":5}' | python -m riskcore.cli --stdin --alert-only
    python -m riskcore.cli --dump-config > questionnaire.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from .config import Config, ConfigError, load_config, load_default_config
from .engine import ScoringError, domain_summary, evaluate, rank_contributions


def _parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="riskcore", description="Score a screening answer set.")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--answers", type=Path, help="JSON file with answers keyed by item key")
    source.add_argument("--stdin", action="store_true", help="read the answers object from stdin")
    parser.add_argument("--config-dir", type=Path, default=None, help="override the config/ directory")
    parser.add_argument("--role", default=None, help="calibration role (default: the configured default role)")
    parser.add_argument("--alerts-only", action="store_true", help="print only the alert block and the net score")
    parser.add_argument("--summary", action="store_true", help="print the alert block plus the top contributions")
    parser.add_argument("--dump-config", action="store_true", help="print the resolved configuration and exit")
    parser.add_argument("--date", default=None, help="override the generated_at date (YYYY-MM-DD), for reproducible ids")
    return parser.parse_args(argv)


def _load_answers(args: argparse.Namespace) -> Mapping[str, Any]:
    if args.stdin or args.answers is None:
        raw = sys.stdin.read()
        if not raw.strip():
            return {}
        return json.loads(raw)
    return json.loads(args.answers.read_text(encoding="utf-8-sig"))


def _resolve_config(args: argparse.Namespace) -> Config:
    return load_config(args.config_dir) if args.config_dir else load_default_config()


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv)
    try:
        config = _resolve_config(args)
    except ConfigError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return 2

    if args.dump_config:
        print(json.dumps(config.to_dict(), indent=2, ensure_ascii=False))
        return 0

    try:
        answers = _load_answers(args)
    except json.JSONDecodeError as exc:
        print(f"invalid answers JSON: {exc}", file=sys.stderr)
        return 2

    stamp = None
    if args.date:
        from datetime import datetime, timezone

        stamp = datetime.fromisoformat(args.date).replace(tzinfo=timezone.utc)

    try:
        result = evaluate(config, answers, role=args.role, generated_at=stamp)
    except ScoringError as exc:
        print(f"invalid answers: {exc}", file=sys.stderr)
        return 1

    payload = result.to_dict()
    if args.alerts_only:
        payload = {"eval_id": payload["eval_id"], "alert": payload["alert"], "scores": payload["scores"]}
    elif args.summary:
        payload = {
            "eval_id": payload["eval_id"],
            "alert": payload["alert"],
            "scores": payload["scores"],
            "hard_flags": payload["hard_flags"],
            "top_contributions": [
                {"key": item.key, "title": item.title, "net": round(item.net, 2), "risk": round(item.risk, 2)}
                for item in rank_contributions(result, limit=5)
            ],
            "domains": domain_summary(result),
            "coverage": payload["coverage"],
        }
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
