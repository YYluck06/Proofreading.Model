"""Deterministic scoring engine.

The engine turns a set of item answers into a risk evaluation. It is pure: no
I/O, no clock except an optional timestamp, no randomness. The same algorithm is
implemented in TypeScript (``apps/worker/src/engine.ts``) and the two are held
to each other by ``tests/fixtures/parity_cases.json``.

Scoring model (see ``docs/methodology.md`` for the rationale):

* Every item pushes evidence into three independent channels: ``risk``,
  ``neutral`` and ``protection``.
* Option-based items sum the channel values of the selected options; ``max_risk``
  caps the raw risk sum of an item so a single item cannot dominate.
* Scale items (0-5) are converted through the empirical calibration map for that
  item; when no map exists, or when a map is degenerate (constant), the linear
  ``value / 5`` falls back. For risk-mapped scales the calibrated intensity is
  turned back into 0-5 units; for protection-mapped scales the calibrated value
  is already protection strength.
* Channel sums are weighted per item and added up.
* Protection is capped relative to risk: 30% of total risk if any hard flag is
  present, 50% if core-domain risk is at or above the configured threshold,
  otherwise 80%. Safeguards cannot mask a serious signal.
* Neutral information is discounted by ``neutral_coefficient`` (0.3).
* ``net_risk_score = total_risk - effective_protection - effective_neutral``.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from .config import AlertSpec, Config, Item, Option

__all__ = [
    "ScoringError",
    "ItemScore",
    "Evaluation",
    "normalize_answers",
    "evaluate",
    "round_half_up",
]


class ScoringError(ValueError):
    """Raised when answers do not fit the questionnaire contract."""


def round_half_up(value: float, digits: int = 2) -> float:
    """Round half away from zero so Python and JavaScript agree bit for bit."""
    factor = 10 ** digits
    scaled = value * factor
    rounded = math.floor(abs(scaled) + 0.5) / factor
    return math.copysign(rounded, value) if rounded else 0.0


@dataclass(frozen=True)
class NormalizedAnswer:
    options: Tuple[str, ...] = ()
    scale: Optional[int] = None

    @property
    def is_empty(self) -> bool:
        return not self.options and self.scale is None

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}
        if self.options:
            payload["options"] = list(self.options)
        if self.scale is not None:
            payload["scale"] = self.scale
        return payload


@dataclass(frozen=True)
class ItemScore:
    key: str
    title: str
    section_id: str
    section_title: str
    selected_options: Tuple[str, ...] = ()
    selected_labels: Tuple[str, ...] = ()
    scale_value: Optional[int] = None
    raw_risk: float = 0.0
    raw_neutral: float = 0.0
    raw_protection: float = 0.0
    risk: float = 0.0
    neutral: float = 0.0
    protection: float = 0.0
    hard_flag: bool = False
    notes: Tuple[str, ...] = ()

    @property
    def net(self) -> float:
        return self.risk - self.protection

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "title": self.title,
            "section_id": self.section_id,
            "section_title": self.section_title,
            "selected_options": list(self.selected_options),
            "selected_labels": list(self.selected_labels),
            "scale_value": self.scale_value,
            "raw_risk": round_half_up(self.raw_risk),
            "raw_neutral": round_half_up(self.raw_neutral),
            "raw_protection": round_half_up(self.raw_protection),
            "risk": round_half_up(self.risk),
            "neutral": round_half_up(self.neutral),
            "protection": round_half_up(self.protection),
            "net": round_half_up(self.net),
            "hard_flag": self.hard_flag,
            "notes": list(self.notes),
        }


@dataclass(frozen=True)
class Evaluation:
    eval_id: str
    generated_at: str
    engine_version: str
    questionnaire_version: str
    role: str
    alert: AlertSpec
    total_risk: float
    total_neutral: float
    total_protection: float
    effective_neutral: float
    effective_protection: float
    protection_cap_factor: float
    core_risk: float
    net_risk_score: float
    hard_flags: Tuple[Dict[str, str], ...]
    items: Tuple[ItemScore, ...]
    answered_items: int
    scoreable_items: int
    answers: Mapping[str, Dict[str, Any]]
    disclaimer: str = ""
    notes: Tuple[str, ...] = field(default=())

    @property
    def alert_id(self) -> str:
        return self.alert.id

    @property
    def coverage(self) -> float:
        if not self.scoreable_items:
            return 0.0
        return round_half_up(self.answered_items / self.scoreable_items, 4)

    @property
    def is_complete(self) -> bool:
        return self.answered_items == self.scoreable_items

    def to_dict(self) -> Dict[str, Any]:
        return {
            "eval_id": self.eval_id,
            "generated_at": self.generated_at,
            "engine_version": self.engine_version,
            "questionnaire_version": self.questionnaire_version,
            "role": self.role,
            "alert": self.alert.to_dict(),
            "scores": {
                "total_risk": round_half_up(self.total_risk),
                "total_neutral": round_half_up(self.total_neutral),
                "total_protection": round_half_up(self.total_protection),
                "effective_neutral": round_half_up(self.effective_neutral),
                "effective_protection": round_half_up(self.effective_protection),
                "protection_cap_factor": round_half_up(self.protection_cap_factor),
                "core_risk": round_half_up(self.core_risk),
                "net_risk_score": round_half_up(self.net_risk_score),
            },
            "hard_flags": list(self.hard_flags),
            "items": [item.to_dict() for item in self.items],
            "coverage": {
                "answered_items": self.answered_items,
                "scoreable_items": self.scoreable_items,
                "ratio": self.coverage,
                "complete": self.is_complete,
            },
            "answers": {key: dict(value) for key, value in self.answers.items()},
            "notes": list(self.notes),
            "disclaimer": self.disclaimer,
        }


def _coerce_scale(value: Any, item: Item) -> int:
    if isinstance(value, bool):
        raise ScoringError(f"'{item.key}': scale value must be an integer 0-5")
    if isinstance(value, str):
        if not value.strip():
            return None  # type: ignore[return-value]
        try:
            value = int(value.strip())
        except ValueError as exc:
            raise ScoringError(f"'{item.key}': scale value '{value}' is not an integer") from exc
    if isinstance(value, float):
        if value != int(value):
            raise ScoringError(f"'{item.key}': scale value must be a whole number")
        value = int(value)
    if not isinstance(value, int):
        raise ScoringError(f"'{item.key}': scale value must be an integer 0-5")
    if not 0 <= value <= 5:
        raise ScoringError(f"'{item.key}': scale value {value} is outside 0-5")
    return value


def _normalize_item_answer(item: Item, raw: Any) -> NormalizedAnswer:
    options_raw: Any = ()
    scale_raw: Any = None
    if raw is None:
        return NormalizedAnswer()
    if isinstance(raw, Mapping):
        unknown = set(raw) - {"options", "scale", "option"}
        if unknown:
            raise ScoringError(f"'{item.key}': unknown answer fields {sorted(unknown)}")
        options_raw = raw.get("options", raw.get("option", ()))
        scale_raw = raw.get("scale")
    elif isinstance(raw, (list, tuple, set)):
        options_raw = raw
    elif isinstance(raw, bool):
        raise ScoringError(f"'{item.key}': boolean answers are not supported")
    elif isinstance(raw, int):
        options_raw, scale_raw = (), raw
    elif isinstance(raw, str):
        options_raw = (raw,)
    else:
        raise ScoringError(f"'{item.key}': unsupported answer type {type(raw).__name__}")

    if isinstance(options_raw, str):
        option_ids: Sequence[str] = (options_raw,)
    elif isinstance(options_raw, (list, tuple, set)):
        option_ids = tuple(options_raw)
    else:
        raise ScoringError(f"'{item.key}': 'options' must be a string or a list of strings")

    known = item.option_index
    cleaned: List[str] = []
    for option_id in option_ids:
        if not isinstance(option_id, str):
            raise ScoringError(f"'{item.key}': option ids must be strings")
        if option_id not in known:
            raise ScoringError(f"'{item.key}': unknown option '{option_id}'")
        if option_id not in cleaned:
            cleaned.append(option_id)
    if cleaned and not item.has_options:
        raise ScoringError(f"'{item.key}': this item does not accept options")
    if len(cleaned) > 1 and not item.is_multi:
        raise ScoringError(f"'{item.key}': exactly one option may be selected for a '{item.type}' item")

    scale_value = None
    if scale_raw is not None:
        if item.scale is None:
            raise ScoringError(f"'{item.key}': this item has no scale")
        scale_value = _coerce_scale(scale_raw, item)

    return NormalizedAnswer(options=tuple(sorted(cleaned)), scale=scale_value)


def normalize_answers(config: Config, answers: Optional[Mapping[str, Any]]) -> Dict[str, NormalizedAnswer]:
    """Validate raw answers and return the canonical form used for scoring and hashing."""
    if answers is None:
        answers = {}
    if not isinstance(answers, Mapping):
        raise ScoringError("answers must be an object keyed by item key")
    normalized: Dict[str, NormalizedAnswer] = {}
    for key, raw in answers.items():
        if not isinstance(key, str):
            raise ScoringError("answer keys must be strings")
        item = config.items.get(key)
        if item is None:
            group = config.groups.get(key)
            if group is not None:
                raise ScoringError(
                    f"'{key}' is a group; answer its sub-questions instead: {', '.join(group.item_keys)}"
                )
            raise ScoringError(f"unknown item key '{key}'")
        normalized[key] = _normalize_item_answer(item, raw)
    return normalized


def calibrated_intensity(config: Config, item: Item, raw_value: int, role: str) -> Tuple[float, str]:
    """Return (intensity 0-1, provenance) for a raw 0-5 scale value."""
    scale_max = config.scale_max or 5
    linear = max(0.0, min(1.0, raw_value / scale_max))
    if item.scale is None:
        return linear, "linear"
    values = config.calibration.role_map(item.key, role)
    if not values or config.calibration.is_degenerate(item.key, role):
        return linear, "linear-fallback"
    exact = values.get(str(raw_value))
    if exact is not None:
        return max(0.0, min(1.0, float(exact))), "calibration"
    numeric = {int(k): float(v) for k, v in values.items()}
    nearest = min(numeric, key=lambda candidate: (abs(candidate - raw_value), candidate))
    return max(0.0, min(1.0, numeric[nearest])), "calibration-nearest"


def _score_item(config: Config, item: Item, answer: NormalizedAnswer, role: str) -> ItemScore:
    notes: List[str] = []
    risk = neutral = protection = 0.0
    hard_flag = False
    labels: List[str] = []

    if answer.options:
        index = item.option_index
        for option_id in answer.options:
            option: Option = index[option_id]
            risk += option.risk
            neutral += option.neutral
            protection += option.protection
            labels.append(option.label)
            if option.hard_trigger:
                hard_flag = True
                notes.append(f"hard flag: '{option.label}'")
        if item.max_risk is not None and risk > item.max_risk:
            notes.append(f"raw risk capped at {item.max_risk:g} (was {risk:g})")
            risk = item.max_risk
    elif answer.scale is not None:
        if item.type != "scale":
            notes.append("scale ignored: no activating option selected")

    scale_applies = answer.scale is not None and (
        item.type == "scale" or any(item.option_index[opt].activates_scale for opt in answer.options)
    )
    if item.scale is not None and scale_applies and answer.scale is not None:
        intensity, provenance = calibrated_intensity(config, item, answer.scale, role)
        units = intensity * (config.scale_max or 5)
        if item.scale.map_to == "protection":
            protection += units
        else:
            risk += units
        notes.append(f"scale {answer.scale}/{config.scale_max}: {item.scale.map_to} {units:.2f} ({provenance})")
        if item.scale.hard_threshold is not None and answer.scale >= item.scale.hard_threshold:
            hard_flag = True
            notes.append(f"hard flag: scale {answer.scale} >= threshold {item.scale.hard_threshold}")

    return ItemScore(
        key=item.key,
        title=item.title,
        section_id=item.section_id,
        section_title=item.section_title,
        selected_options=answer.options,
        selected_labels=tuple(labels),
        scale_value=answer.scale,
        raw_risk=risk,
        raw_neutral=neutral,
        raw_protection=protection,
        risk=risk * item.weights.risk,
        neutral=neutral * item.weights.neutral,
        protection=protection * item.weights.protection,
        hard_flag=hard_flag,
        notes=tuple(notes),
    )


def _canonical_payload(config: Config, role: str, normalized: Mapping[str, NormalizedAnswer]) -> str:
    payload = {
        "answers": {key: value.to_dict() for key, value in sorted(normalized.items()) if not value.is_empty},
        "engine_version": config.engine_version,
        "questionnaire_version": config.questionnaire_version,
        "role": role,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def evaluate(
    config: Config,
    answers: Optional[Mapping[str, Any]],
    *,
    role: Optional[str] = None,
    generated_at: Optional[datetime] = None,
) -> Evaluation:
    """Score ``answers`` and return a full evaluation record."""
    role_id = role or config.calibration.default_role
    if role_id not in config.roles():
        raise ScoringError(f"unknown role '{role_id}'; available: {', '.join(config.roles())}")

    normalized = normalize_answers(config, answers)
    item_scores: List[ItemScore] = []
    hard_flags: List[Dict[str, str]] = []
    total_risk = total_neutral = total_protection = core_risk = 0.0
    answered = 0

    for section in config.sections:
        for item in section.items:
            answer = normalized.get(item.key, NormalizedAnswer())
            score = _score_item(config, item, answer, role_id)
            item_scores.append(score)
            if not answer.is_empty:
                answered += 1
            total_risk += score.risk
            total_neutral += score.neutral
            total_protection += score.protection
            if item.key in config.core_items:
                core_risk += score.risk
            if score.hard_flag:
                reasons = [note for note in score.notes if note.startswith("hard flag")]
                hard_flags.append({"key": item.key, "title": item.title, "reason": "; ".join(reasons) or "hard flag"})

    cap_factor = config.protection_cap.factor_for(bool(hard_flags), core_risk)
    effective_protection = min(total_protection, total_risk * cap_factor)
    effective_neutral = total_neutral * config.neutral_coefficient
    net_risk_score = total_risk - effective_protection - effective_neutral

    scoreable = len(item_scores)
    coverage = (answered / scoreable) if scoreable else 0.0
    alert = config.alert_for(net_risk_score, coverage)
    stamp = generated_at or datetime.now(timezone.utc)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    stamp = stamp.astimezone(timezone.utc)

    canonical = _canonical_payload(config, role_id, normalized)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    eval_id = f"EV-{stamp.strftime('%Y%m%d')}-{digest}"

    notes: List[str] = []
    if answered < scoreable:
        notes.append(
            f"{scoreable - answered} of {scoreable} items are unanswered; "
            "the result under-represents the case and must not be used for triage alone."
        )
    if coverage < config.coverage_floor:
        notes.append(
            f"coverage {coverage:.0%} is below the {config.coverage_floor:.0%} floor: "
            "the banded alert is replaced by 'insufficient data'."
        )
    if hard_flags:
        notes.append("hard flags present: protection credit is capped at "
                     f"{int(round(config.protection_cap.any_hard_flag * 100))}% of total risk")

    return Evaluation(
        eval_id=eval_id,
        generated_at=stamp.isoformat().replace("+00:00", "Z"),
        engine_version=config.engine_version,
        questionnaire_version=config.questionnaire_version,
        role=role_id,
        alert=alert,
        total_risk=total_risk,
        total_neutral=total_neutral,
        total_protection=total_protection,
        effective_neutral=effective_neutral,
        effective_protection=effective_protection,
        protection_cap_factor=cap_factor,
        core_risk=core_risk,
        net_risk_score=net_risk_score,
        hard_flags=tuple(hard_flags),
        items=tuple(item_scores),
        answered_items=answered,
        scoreable_items=len(item_scores),
        answers={key: value.to_dict() for key, value in sorted(normalized.items()) if not value.is_empty},
        disclaimer=config.disclaimer,
        notes=tuple(notes),
    )


def rank_contributions(evaluation: Evaluation, limit: int = 5) -> List[ItemScore]:
    """Items ordered by net contribution, highest first."""
    ordered = sorted(evaluation.items, key=lambda item: (-item.net, item.key))
    return ordered[:limit] if limit else ordered


def domain_summary(evaluation: Evaluation) -> List[Dict[str, Any]]:
    """Aggregate per-section risk and protection for charting."""
    buckets: Dict[str, Dict[str, Any]] = {}
    for item in evaluation.items:
        bucket = buckets.setdefault(
            item.section_id,
            {"section_id": item.section_id, "section_title": item.section_title, "risk": 0.0, "protection": 0.0, "neutral": 0.0},
        )
        bucket["risk"] += item.risk
        bucket["protection"] += item.protection
        bucket["neutral"] += item.neutral
    result = []
    for bucket in buckets.values():
        result.append(
            {
                "section_id": bucket["section_id"],
                "section_title": bucket["section_title"],
                "risk": round_half_up(bucket["risk"]),
                "protection": round_half_up(bucket["protection"]),
                "neutral": round_half_up(bucket["neutral"]),
                "net": round_half_up(bucket["risk"] - bucket["protection"]),
            }
        )
    return result
