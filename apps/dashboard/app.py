"""Streamlit dashboard for the youth risk & protection screening engine.

The dashboard is a thin presentation layer: every number it shows comes from
``riskcore``, which is the same engine the Cloudflare Worker runs. Nothing is
scored here.

Run it from the repository root::

    streamlit run apps/dashboard/app.py
"""

from __future__ import annotations

import csv
import io
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import streamlit as st

REPO_ROOT = Path(__file__).resolve().parents[2]
CORE_DIR = REPO_ROOT / "core"
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))

from riskcore import (  # noqa: E402
    Config,
    Evaluation,
    ScoringError,
    evaluate,
    load_config,
    load_default_config,
    rank_contributions,
)

APP_VERSION = "2.0.0"
ALERT_ICONS = {"insufficient": "⚪", "green": "🟢", "blue": "🔵", "yellow": "🟡", "red": "🔴"}
ALERT_ADMONITION = {
    "insufficient": "info",
    "green": "success",
    "blue": "info",
    "yellow": "warning",
    "red": "error",
}


def bootstrap_config() -> Config:
    """Load the shared configuration, honouring ``RISKCORE_CONFIG_DIR``."""
    override = os.getenv("RISKCORE_CONFIG_DIR")
    if override:
        return load_config(Path(override))
    return load_default_config()


def answer_key(item_key: str) -> str:
    return f"ans::{item_key}"


def question_label(item) -> str:
    hint = ""
    if item.max_risk is not None:
        hint = f"  \n:gray[combined risk from this item is capped at {item.max_risk}]"
    return f"{item.title}{hint}"


def render_scale(item, config: Config) -> Optional[int]:
    """Integer selectbox: no mixed str/int option lists, no silent defaults."""
    return st.selectbox(
        item.scale.label,
        options=list(range(config.scale_min, config.scale_max + 1)),
        index=None,
        placeholder="Not assessed",
        key=f"{answer_key(item.key)}::scale",
    )


def render_item(item, config: Config) -> None:
    with st.container(border=True):
        if item.type == "scale":
            render_scale(item, config)
            return

        option_map = {option.id: option for option in item.options}
        labels = {option.id: option.label for option in item.options}

        if item.type in ("multi", "hybrid_multi"):
            chosen = st.multiselect(
                question_label(item),
                options=[option.id for option in item.options],
                format_func=lambda option_id: labels[option_id],
                default=[],
                key=f"{answer_key(item.key)}::options",
            )
        else:
            chosen_single = st.radio(
                question_label(item),
                options=[option.id for option in item.options],
                format_func=lambda option_id: labels[option_id],
                index=None,
                key=f"{answer_key(item.key)}::options",
            )
            chosen = [chosen_single] if chosen_single else []

        if item.scale is not None:
            activates = any(option_map[option_id].activates_scale for option_id in chosen)
            if activates:
                render_scale(item, config)
            else:
                st.session_state.pop(f"{answer_key(item.key)}::scale", None)
                st.caption("The follow-up scale appears once a qualifying option is selected.")


def collect_answers(config: Config) -> Dict[str, Any]:
    answers: Dict[str, Any] = {}
    for section in config.sections:
        for item in section.items:
            entry: Dict[str, Any] = {}
            raw_options = st.session_state.get(f"{answer_key(item.key)}::options")
            if isinstance(raw_options, str):
                entry["options"] = [raw_options]
            elif raw_options:
                entry["options"] = list(raw_options)
            raw_scale = st.session_state.get(f"{answer_key(item.key)}::scale")
            if raw_scale is not None:
                entry["scale"] = int(raw_scale)
            if entry:
                answers[item.key] = entry
    return answers


def clear_answers(config: Config) -> None:
    for section in config.sections:
        for item in section.items:
            for suffix in ("::options", "::scale"):
                st.session_state.pop(f"{answer_key(item.key)}{suffix}", None)


def render_header(config: Config) -> None:
    st.title("Youth Risk & Protection Screening")
    st.caption(
        f"Questionnaire {config.questionnaire_version} · engine {config.engine_version} · "
        f"dashboard {APP_VERSION}"
    )
    st.info(
        "Decision support only. This dashboard summarises structured screening evidence; "
        "it never replaces professional judgement, and no case is ever closed or escalated "
        "solely because of a score."
    )


def render_sidebar(config: Config) -> str:
    with st.sidebar:
        st.header("Case setup")
        roles = config.roles()
        role = st.selectbox("Calibration role", options=roles, index=roles.index(config.calibration.default_role))
        st.caption("Roles map to empirical calibration curves. Only roles present in config/calibration.json are offered.")
        st.text_input(
            "Case reference (optional)",
            key="case_reference",
            placeholder="e.g. CASE-2026-0142",
            help="Use an internal reference, never a name or other personal identifier.",
        )
        st.text_input("Assessor (optional)", key="assessor")
        st.divider()
        if st.button("Clear all answers", use_container_width=True):
            clear_answers(config)
            st.session_state.pop("evaluation", None)
            st.toast("Answers cleared.")
        st.divider()
        st.caption(
            "Answers stay in this browser session. Nothing is uploaded; export is explicit "
            "and manual. Data protection guidance: docs/data-protection.md"
        )
        log = st.session_state.get("audit_log", [])
        st.metric("Evaluations this session", len(log))
    return role


def render_assessment(config: Config) -> None:
    st.subheader("Assessment")
    st.caption("Leave items unanswered if the information is not available. Coverage is reported with the result.")
    answered = sum(
        1
        for section in config.sections
        for item in section.items
        if st.session_state.get(f"{answer_key(item.key)}::options")
        or st.session_state.get(f"{answer_key(item.key)}::scale") is not None
    )
    total = sum(len(section.items) for section in config.sections)
    st.progress(answered / total if total else 0.0, text=f"{answered} of {total} items answered")

    group_by_item: Dict[str, str] = {}
    for group in config.groups.values():
        for item_key in group.item_keys:
            group_by_item[item_key] = group.title

    for section in config.sections:
        st.markdown(f"### {section.id}. {section.title}")
        if section.description:
            st.caption(section.description)
        current_group: Optional[str] = None
        for item in section.items:
            group_title = group_by_item.get(item.key)
            if group_title and group_title != current_group:
                st.markdown(f"**{group_title}**")
            current_group = group_title
            render_item(item, config)

    st.divider()
    if st.button("Evaluate case", type="primary", use_container_width=True):
        try:
            evaluation = evaluate(config, collect_answers(config), role=st.session_state.get("calibration_role"))
        except ScoringError as error:
            st.error(f"The case could not be scored: {error}")
        else:
            st.session_state["evaluation"] = evaluation
            st.session_state.setdefault("audit_log", []).append(
                {
                    "timestamp": evaluation.generated_at,
                    "eval_id": evaluation.eval_id,
                    "role": evaluation.role,
                    "alert": evaluation.alert.id,
                    "net_risk_score": round(evaluation.net_risk_score, 2),
                    "coverage": evaluation.coverage,
                    "case_reference": st.session_state.get("case_reference", ""),
                    "assessor": st.session_state.get("assessor", ""),
                }
            )
            st.success("Evaluation complete. Open the **Cockpit** tab for the result.")


def render_alert(evaluation: Evaluation) -> None:
    alert = evaluation.alert
    icon = ALERT_ICONS.get(alert.id, "⚪")
    getattr(st, ALERT_ADMONITION.get(alert.id, "info"))(f"**{icon} {alert.label}** — {alert.headline}")
    st.markdown("**Recommended next steps**")
    for action in alert.actions:
        st.markdown(f"- {action}")


def render_cockpit(evaluation: Evaluation, config: Config) -> None:
    st.subheader("Cockpit")
    render_alert(evaluation)

    columns = st.columns(4)
    columns[0].metric("Net risk", f"{evaluation.net_risk_score:.2f}")
    columns[1].metric("Total risk", f"{evaluation.total_risk:.2f}")
    columns[2].metric("Effective protection", f"{evaluation.effective_protection:.2f}")
    columns[3].metric("Coverage", f"{evaluation.coverage * 100:.0f}%")

    detail_columns = st.columns(3)
    detail_columns[0].metric("Protection cap", f"{evaluation.protection_cap_factor * 100:.0f}%")
    detail_columns[1].metric("Core-domain risk", f"{evaluation.core_risk:.2f}")
    detail_columns[2].metric("Neutral (counted)", f"{evaluation.effective_neutral:.2f}")

    if evaluation.hard_flags:
        st.markdown("**Hard flags**")
        st.table([{"item": flag["title"], "reason": flag["reason"]} for flag in evaluation.hard_flags])
    else:
        st.caption("No hard flags raised.")

    ranked = [item for item in rank_contributions(evaluation, 8) if item.net > 0]
    if ranked:
        st.markdown("**Top contributing items**")
        st.bar_chart({item.title: round(item.net, 2) for item in ranked}, horizontal=True)
    else:
        st.caption("No item shows a positive net contribution.")

    if evaluation.notes:
        st.markdown("**Data quality notes**")
        for note in evaluation.notes:
            st.markdown(f"- {note}")

    st.caption(evaluation.disclaimer)


def render_method(config: Config) -> None:
    st.subheader("Method")
    st.markdown(
        "Every item contributes to three independent channels. Option weights are defined in "
        "`config/questionnaire.json`, the band thresholds and cap ratios in `config/scoring.json`, "
        "and the empirical scale calibration in `config/calibration.json`."
    )
    thresholds = config.thresholds
    st.table(
        [
            {"band": "green", "net risk up to": thresholds.green_max},
            {"band": "blue", "net risk up to": thresholds.blue_max},
            {"band": "yellow", "net risk up to": thresholds.yellow_max},
            {"band": "red", "net risk above": thresholds.yellow_max},
        ]
    )
    st.markdown(
        f"- Neutral evidence counts at **{config.neutral_coefficient:g}×** its weighted total.\n"
        f"- Protection credits are capped at **{config.protection_cap.default * 100:.0f}%** of total risk by default, "
        f"**{config.protection_cap.core_risk_at_or_above_threshold * 100:.0f}%** when core-domain risk reaches "
        f"{config.protection_cap.core_risk_threshold:g}, and **{config.protection_cap.any_hard_flag * 100:.0f}%** "
        "whenever a hard flag is present.\n"
        f"- Fewer than **{config.coverage_floor * 100:.0f}%** of items answered returns *insufficient data* instead of a band."
    )

    rows: List[Dict[str, Any]] = []
    for section in config.sections:
        for item in section.items:
            rows.append(
                {
                    "key": item.key,
                    "section": section.id,
                    "item": item.title,
                    "type": item.type,
                    "risk weight": item.weights.risk,
                    "scale channel": item.scale.map_to if item.scale else "—",
                    "scale hard threshold": item.scale.hard_threshold if item.scale else "—",
                }
            )
    st.dataframe(rows, use_container_width=True, hide_index=True)

    provenance: List[Dict[str, Any]] = []
    for item_key in sorted(config.calibration.maps):
        provenance.append(
            {
                "scale item": item_key,
                "calibrated": "no (linear fallback)" if config.calibration.is_degenerate(item_key, config.calibration.default_role) else "yes",
                "role": config.calibration.default_role,
            }
        )
    st.caption("Calibration provenance. Constant maps are treated as missing data and fall back to linear scaling.")
    st.dataframe(provenance, use_container_width=True, hide_index=True)


def evaluation_to_json(evaluation: Evaluation) -> str:
    return json.dumps(evaluation.to_dict(), indent=2, ensure_ascii=False)


def evaluation_to_csv(evaluation: Evaluation) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["key", "item", "selected", "scale", "risk", "neutral", "protection", "net", "hard_flag"])
    for item in evaluation.items:
        writer.writerow(
            [
                item.key,
                item.title,
                "; ".join(item.selected_labels),
                "" if item.scale_value is None else item.scale_value,
                f"{item.risk:.2f}",
                f"{item.neutral:.2f}",
                f"{item.protection:.2f}",
                f"{item.net:.2f}",
                "yes" if item.hard_flag else "",
            ]
        )
    return buffer.getvalue()


def render_export(config: Config) -> None:
    st.subheader("Audit & export")
    evaluation: Optional[Evaluation] = st.session_state.get("evaluation")
    if evaluation is None:
        st.caption("Score a case first; the export and the audit trail are built from the last evaluation.")
    else:
        st.markdown(f"**Evaluation id** `{evaluation.eval_id}`  \n**Generated** {evaluation.generated_at}")
        filename = evaluation.eval_id.replace("/", "-")
        left, right = st.columns(2)
        left.download_button(
            "Download JSON",
            data=evaluation_to_json(evaluation),
            file_name=f"{filename}.json",
            mime="application/json",
            use_container_width=True,
        )
        right.download_button(
            "Download CSV",
            data=evaluation_to_csv(evaluation),
            file_name=f"{filename}.csv",
            mime="text/csv",
            use_container_width=True,
        )
        with st.expander("Preview JSON"):
            st.code(evaluation_to_json(evaluation), language="json")

    st.divider()
    st.markdown("**Session audit trail**")
    log = st.session_state.get("audit_log", [])
    if not log:
        st.caption("No evaluations in this session yet.")
        return
    st.table(log)
    st.download_button(
        "Download audit trail (JSON)",
        data=json.dumps(log, indent=2, ensure_ascii=False),
        file_name=f"audit-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json",
        mime="application/json",
    )
    if st.button("Clear audit trail"):
        st.session_state["audit_log"] = []
        st.toast("Audit trail cleared.")


def main() -> None:
    st.set_page_config(
        page_title="Youth Risk & Protection Screening",
        page_icon="◈",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    config = bootstrap_config()
    render_header(config)
    role = render_sidebar(config)
    st.session_state["calibration_role"] = role

    assessment_tab, cockpit_tab, method_tab, export_tab = st.tabs(
        ["Assessment", "Cockpit", "Method", "Audit & export"]
    )
    with assessment_tab:
        render_assessment(config)
    with cockpit_tab:
        evaluation = st.session_state.get("evaluation")
        if evaluation is None:
            st.caption("No evaluation yet. Complete the assessment and press **Evaluate case**.")
        else:
            render_cockpit(evaluation, config)
    with method_tab:
        render_method(config)
    with export_tab:
        render_export(config)


if __name__ == "__main__":
    main()
