"""Behaviour and cross-language parity tests for the Python scoring engine."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from riskcore import (
    ConfigError,
    ScoringError,
    domain_summary,
    evaluate,
    load_config,
    load_default_config,
    rank_contributions,
    round_half_up,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "parity_cases.json"


@pytest.fixture(scope="module")
def config():
    return load_default_config()


@pytest.fixture(scope="module")
def fixtures() -> dict:
    return json.loads(FIXTURES.read_text(encoding="utf-8"))


def _strip(evaluation: dict) -> dict:
    payload = dict(evaluation)
    payload.pop("generated_at", None)
    return payload


@pytest.mark.parametrize("case", json.loads(FIXTURES.read_text(encoding="utf-8"))["cases"], ids=lambda case: case["name"])
def test_parity_fixtures(config, fixtures, case):
    """The engine must still reproduce the checked-in parity fixtures exactly."""
    evaluation = evaluate(
        config,
        case["answers"],
        role=case["role"],
        generated_at=datetime.fromisoformat(fixtures["generated_at"]),
    )
    assert _strip(evaluation.to_dict()) == case["expected"]


def test_empty_answers_report_insufficient_data(config):
    evaluation = evaluate(config, {}, generated_at=datetime.now(timezone.utc))
    assert evaluation.alert_id == "insufficient"
    assert evaluation.coverage == 0.0
    assert evaluation.is_complete is False
    assert evaluation.notes


def test_alert_bands_are_monotone(config):
    """Riskier answers must never produce a lower band than safer answers."""
    order = ["green", "blue", "yellow", "red"]
    observed = []
    for scale_value in range(6):
        answers = {key: {"scale": scale_value} for key in _scale_items(config)}
        evaluation = evaluate(config, answers)
        assert evaluation.alert_id != "insufficient", "a complete answer set is never insufficient"
        observed.append(evaluation.alert_id)
    indices = [order.index(level) for level in observed]
    assert indices == sorted(indices), observed


def _scale_items(config):
    return {item.key: item for section in config.sections for item in section.items if item.scale is not None}


def test_hard_flag_caps_protection(config):
    evaluation = evaluate(config, {"a1": ["guardian_engaged"], "a2": "violent", "a3_1": 0, "a3_2": 0})
    assert evaluation.hard_flags
    assert evaluation.protection_cap_factor == config.protection_cap.any_hard_flag
    assert evaluation.effective_protection <= evaluation.total_risk * config.protection_cap.any_hard_flag


def test_protection_never_exceeds_total_risk(config):
    answers = {item.key: 5 for item in _scale_items(config).values()}
    evaluation = evaluate(config, answers)
    assert evaluation.effective_protection <= evaluation.total_risk


def test_degenerate_calibration_maps_fall_back_to_linear(config):
    """``d2`` and ``f1`` carry constant maps in the shipped calibration data."""
    degenerate = [item.key for item in _scale_items(config).values() if config.calibration.is_degenerate(item.key, config.calibration.default_role)]
    assert degenerate, "expected at least one degenerate calibration map"
    answers = {key: 4 for key in degenerate}
    evaluation = evaluate(config, answers)
    notes = [note for item in evaluation.items if item.key in degenerate for note in item.notes]
    assert any("linear-fallback" in note for note in notes)


def test_answer_shapes_normalise_to_the_same_result(config):
    canonical = {"a3_1": {"scale": 4}, "a1": {"options": ["single_parent"]}}
    shorthand = {"a3_1": 4, "a1": "single_parent"}
    assert evaluate(config, canonical).eval_id == evaluate(config, shorthand).eval_id


def test_evaluation_id_is_stable_and_order_independent(config):
    fixed = datetime(2026, 1, 15, 9, 30, tzinfo=timezone.utc)
    first = evaluate(config, {"a3_1": 3, "a2": "neglectful"}, generated_at=fixed)
    second = evaluate(config, {"a2": "neglectful", "a3_1": 3}, generated_at=fixed)
    assert first.eval_id == second.eval_id
    assert first.eval_id.startswith("EV-20260115-")
    assert len(first.eval_id.split("-")[-1]) == 16


def test_invalid_input_is_rejected(config):
    with pytest.raises(ScoringError):
        evaluate(config, {"zz_unknown": 1})
    with pytest.raises(ScoringError):
        evaluate(config, {"a2": "nope"})
    with pytest.raises(ScoringError):
        evaluate(config, {"a3_1": 6})
    with pytest.raises(ScoringError):
        evaluate(config, {"a2": ["traditional", "permissive"]})
    with pytest.raises(ScoringError):
        evaluate(config, {}, role="ghost")


def test_rank_and_domain_summary(config):
    evaluation = evaluate(config, {"a2": "violent", "a3_1": 5})
    ranked = rank_contributions(evaluation, 3)
    assert len(ranked) == 3
    assert [item.net for item in ranked] == sorted((item.net for item in ranked), reverse=True)

    summary = domain_summary(evaluation)
    assert len(summary) == len(config.sections)
    assert round(sum(entry["risk"] for entry in summary), 2) == round_half_up(evaluation.total_risk)


def test_round_half_up():
    assert round_half_up(0.125) == 0.13
    assert round_half_up(-0.125) == -0.13
    assert round_half_up(0) == 0
    assert round_half_up(2.675, 2) == 2.68


def test_config_is_loaded_from_disk(tmp_path):
    """A tampered copy must be rejected rather than silently scored."""
    for name in ("questionnaire.json", "scoring.json", "calibration.json"):
        (tmp_path / name).write_bytes((REPO_ROOT / "config" / name).read_bytes())
    load_config(tmp_path)  # sanity: the pristine copy loads

    scoring = json.loads((tmp_path / "scoring.json").read_text(encoding="utf-8"))
    scoring["thresholds"]["blue_max"] = -5
    (tmp_path / "scoring.json").write_text(json.dumps(scoring), encoding="utf-8")
    with pytest.raises(ConfigError):
        load_config(tmp_path)
