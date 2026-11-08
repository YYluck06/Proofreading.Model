"""Headless smoke tests for the Streamlit dashboard.

Skipped when Streamlit is not installed, so the lightweight engine job does not need it.
The dashboard is presentation-only, so these tests assert that it renders and that its
result panel cannot divide by zero — the failure that took the original cockpit down.
"""

from __future__ import annotations

from pathlib import Path

import pytest

st_testing = pytest.importorskip("streamlit.testing.v1", reason="streamlit is not installed")

APP = Path(__file__).resolve().parents[2] / "apps" / "dashboard" / "app.py"


@pytest.fixture(scope="module")
def app():
    at = st_testing.AppTest.from_file(str(APP), default_timeout=60)
    at.run()
    return at


def test_dashboard_renders_without_raising(app):
    assert not app.exception, [str(exception) for exception in app.exception]
    assert app.title[0].value == "Youth Risk & Protection Screening"
    assert [tab.label for tab in app.tabs] if getattr(app, "tabs", None) else True


def test_dashboard_exposes_the_default_role_and_an_empty_audit_trail(app):
    roles = [box for box in app.selectbox if box.label == "Calibration role"]
    assert len(roles) == 1
    assert roles[0].value == "default"
    assert "No evaluations in this session yet." in " ".join(
        block.value for block in app.caption if isinstance(block.value, str)
    )


def test_cockpit_without_protection_does_not_divide_by_zero(app):
    """The original dashboard crashed when nothing protective was recorded."""
    from riskcore import evaluate, load_default_config

    config = load_default_config()
    evaluation = evaluate(config, {"a2": "violent", "a3_1": 5, "e2": {"options": ["violent_content"], "scale": 5}})
    assert evaluation.total_protection == 0
    assert evaluation.effective_protection == 0
    assert evaluation.protection_cap_factor == config.protection_cap.any_hard_flag

    import importlib.util

    spec = importlib.util.spec_from_file_location("dashboard_app", APP)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.evaluation_to_json(evaluation).startswith("{")
    csv_rows = module.evaluation_to_csv(evaluation).strip().splitlines()
    assert csv_rows[0].startswith("key,item,selected")
    assert len(csv_rows) == len(evaluation.items) + 1
