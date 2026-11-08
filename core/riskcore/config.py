"""Configuration loading and validation for the screening engine.

The engine is configuration-driven: the questionnaire, the item weights, the
empirical calibration maps and the alert thresholds all live in ``config/`` as
plain JSON. Nothing about the instrument is hard-coded here, so the same three
files drive the Python engine, the Streamlit dashboard and the Cloudflare
Worker (which bundles a generated copy of them).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_DIR = REPO_ROOT / "config"

ALLOWED_TYPES = {"mcq", "multi", "scale", "group", "hybrid", "hybrid_multi"}
OPTION_TYPES = {"mcq", "multi", "hybrid", "hybrid_multi"}
MAP_TARGETS = {"risk", "protection"}
ALERT_ORDER = ("insufficient", "green", "blue", "yellow", "red")


class ConfigError(ValueError):
    """Raised when the configuration files are missing, malformed or inconsistent."""


@dataclass(frozen=True)
class Weights:
    risk: float = 1.0
    neutral: float = 1.0
    protection: float = 1.0


@dataclass(frozen=True)
class Option:
    id: str
    label: str
    risk: float = 0.0
    neutral: float = 0.0
    protection: float = 0.0
    hard_trigger: bool = False
    activates_scale: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "risk": self.risk,
            "neutral": self.neutral,
            "protection": self.protection,
            "hard_trigger": self.hard_trigger,
            "activates_scale": self.activates_scale,
        }


@dataclass(frozen=True)
class Scale:
    label: str
    map_to: str = "risk"
    hard_threshold: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return {"label": self.label, "map_to": self.map_to, "hard_threshold": self.hard_threshold}


@dataclass(frozen=True)
class Item:
    """A scoreable leaf item (sub-questions of a ``group`` are items in their own right)."""

    key: str
    title: str
    type: str
    section_id: str
    section_title: str
    weights: Weights = field(default_factory=Weights)
    options: Tuple[Option, ...] = ()
    scale: Optional[Scale] = None
    max_risk: Optional[float] = None
    parent: Optional[str] = None

    @property
    def option_index(self) -> Dict[str, Option]:
        return {opt.id: opt for opt in self.options}

    @property
    def has_options(self) -> bool:
        return bool(self.options)

    @property
    def is_multi(self) -> bool:
        return self.type in {"multi", "hybrid_multi"}

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "key": self.key,
            "title": self.title,
            "type": self.type,
            "section_id": self.section_id,
            "section_title": self.section_title,
            "weights": {"risk": self.weights.risk, "neutral": self.weights.neutral, "protection": self.weights.protection},
        }
        if self.options:
            payload["options"] = [opt.to_dict() for opt in self.options]
        if self.scale is not None:
            payload["scale"] = self.scale.to_dict()
        if self.max_risk is not None:
            payload["max_risk"] = self.max_risk
        if self.parent is not None:
            payload["parent"] = self.parent
        return payload


@dataclass(frozen=True)
class Section:
    id: str
    title: str
    description: str
    items: Tuple[Item, ...]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "items": [item.to_dict() for item in self.items],
        }


@dataclass(frozen=True)
class Group:
    """Display-only container for items that are answered individually."""

    key: str
    title: str
    item_keys: Tuple[str, ...]

    def to_dict(self) -> Dict[str, Any]:
        return {"key": self.key, "title": self.title, "item_keys": list(self.item_keys)}


@dataclass(frozen=True)
class Thresholds:
    green_max: float
    blue_max: float
    yellow_max: float


@dataclass(frozen=True)
class ProtectionCap:
    any_hard_flag: float
    core_risk_at_or_above_threshold: float
    core_risk_threshold: float
    default: float

    def factor_for(self, has_hard_flag: bool, core_risk: float) -> float:
        if has_hard_flag:
            return self.any_hard_flag
        if core_risk >= self.core_risk_threshold:
            return self.core_risk_at_or_above_threshold
        return self.default


@dataclass(frozen=True)
class Calibration:
    """Empirical 0-1 risk-intensity maps per item key and raw scale value."""

    version: str
    default_role: str
    maps: Mapping[str, Mapping[str, Mapping[str, float]]]

    def roles(self) -> List[str]:
        found: List[str] = []
        for by_role in self.maps.values():
            for role in by_role:
                if role not in found:
                    found.append(role)
        return sorted(found)

    def role_map(self, key: str, role: str) -> Optional[Mapping[str, float]]:
        by_role = self.maps.get(key)
        if not by_role:
            return None
        return by_role.get(role) or by_role.get(self.default_role)

    def is_degenerate(self, key: str, role: str) -> bool:
        values = self.role_map(key, role)
        if not values:
            return True
        return len({round(float(v), 6) for v in values.values()}) <= 1


@dataclass(frozen=True)
class AlertSpec:
    id: str
    label: str
    headline: str
    actions: Tuple[str, ...]

    def to_dict(self) -> Dict[str, Any]:
        return {"id": self.id, "label": self.label, "headline": self.headline, "actions": list(self.actions)}


@dataclass(frozen=True)
class Config:
    questionnaire_version: str
    engine_version: str
    title: str
    description: str
    scale_min: int
    scale_max: int
    sections: Tuple[Section, ...]
    groups: Mapping[str, Group]
    items: Mapping[str, Item]
    thresholds: Thresholds
    neutral_coefficient: float
    protection_cap: ProtectionCap
    core_items: Tuple[str, ...]
    alerts: Mapping[str, AlertSpec]
    disclaimer: str
    calibration: Calibration
    config_dir: Path
    coverage_floor: float = 0.0

    def alert_for(self, net_risk_score: float, coverage: float = 1.0) -> AlertSpec:
        thresholds = self.thresholds
        if coverage < self.coverage_floor:
            return self.alerts["insufficient"]
        if net_risk_score <= thresholds.green_max:
            return self.alerts["green"]
        if net_risk_score <= thresholds.blue_max:
            return self.alerts["blue"]
        if net_risk_score <= thresholds.yellow_max:
            return self.alerts["yellow"]
        return self.alerts["red"]

    def roles(self) -> List[str]:
        return self.calibration.roles()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "questionnaire_version": self.questionnaire_version,
            "engine_version": self.engine_version,
            "title": self.title,
            "description": self.description,
            "scale": {"min": self.scale_min, "max": self.scale_max},
            "sections": [section.to_dict() for section in self.sections],
            "groups": {key: group.to_dict() for key, group in self.groups.items()},
            "thresholds": {
                "green_max": self.thresholds.green_max,
                "blue_max": self.thresholds.blue_max,
                "yellow_max": self.thresholds.yellow_max,
            },
            "neutral_coefficient": self.neutral_coefficient,
            "protection_cap": {
                "any_hard_flag": self.protection_cap.any_hard_flag,
                "core_risk_at_or_above_threshold": self.protection_cap.core_risk_at_or_above_threshold,
                "core_risk_threshold": self.protection_cap.core_risk_threshold,
                "default": self.protection_cap.default,
            },
            "core_items": list(self.core_items),
            "alerts": {key: spec.to_dict() for key, spec in self.alerts.items()},
            "disclaimer": self.disclaimer,
            "coverage_floor": self.coverage_floor,
            "calibration_roles": self.roles(),
            "calibration_version": self.calibration.version,
        }


def _read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise ConfigError(f"Missing configuration file: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise ConfigError(f"Invalid JSON in {path}: {exc}") from exc


def _weights(raw: Mapping[str, Any], where: str) -> Weights:
    payload = raw.get("weights") or {}
    if not isinstance(payload, Mapping):
        raise ConfigError(f"{where}: 'weights' must be an object")
    try:
        return Weights(
            risk=float(payload.get("risk", 1.0)),
            neutral=float(payload.get("neutral", 1.0)),
            protection=float(payload.get("protection", 1.0)),
        )
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{where}: weights must be numeric") from exc


def _scale(raw: Mapping[str, Any], where: str) -> Scale:
    map_to = str(raw.get("map_to", "risk"))
    if map_to not in MAP_TARGETS:
        raise ConfigError(f"{where}: scale.map_to must be one of {sorted(MAP_TARGETS)}")
    threshold = raw.get("hard_threshold")
    if threshold is not None:
        threshold = int(threshold)
        if not 0 <= threshold <= 5:
            raise ConfigError(f"{where}: scale.hard_threshold must be within 0..5")
    label = str(raw.get("label") or "").strip()
    if not label:
        raise ConfigError(f"{where}: scale.label is required")
    return Scale(label=label, map_to=map_to, hard_threshold=threshold)


def _options(raw: Sequence[Mapping[str, Any]], where: str) -> Tuple[Option, ...]:
    if not isinstance(raw, list) or not raw:
        raise ConfigError(f"{where}: options must be a non-empty list")
    seen: set[str] = set()
    options: List[Option] = []
    for idx, entry in enumerate(raw):
        opt_id = str(entry.get("id") or "").strip()
        if not opt_id:
            raise ConfigError(f"{where}: option #{idx} is missing 'id'")
        if opt_id in seen:
            raise ConfigError(f"{where}: duplicate option id '{opt_id}'")
        seen.add(opt_id)
        label = str(entry.get("label") or "").strip()
        if not label:
            raise ConfigError(f"{where}: option '{opt_id}' is missing 'label'")
        options.append(
            Option(
                id=opt_id,
                label=label,
                risk=float(entry.get("risk", 0)),
                neutral=float(entry.get("neutral", 0)),
                protection=float(entry.get("protection", 0)),
                hard_trigger=bool(entry.get("hard_trigger", False)),
                activates_scale=bool(entry.get("activates_scale", False)),
            )
        )
    return tuple(options)


def _build_item(raw: Mapping[str, Any], section: Mapping[str, Any], parent: Optional[str]) -> Item:
    key = str(raw.get("key") or "").strip()
    where = f"item '{key or '<unnamed>'}'"
    if not key:
        raise ConfigError(f"{where}: missing key")
    item_type = str(raw.get("type") or "").strip()
    if item_type not in ALLOWED_TYPES:
        raise ConfigError(f"{where}: type must be one of {sorted(ALLOWED_TYPES)}")
    if item_type == "group" and parent is None:
        raise ConfigError(f"{where}: groups are display containers and are expanded into sections")
    title = str(raw.get("title") or "").strip()
    if not title:
        raise ConfigError(f"{where}: missing title")

    options: Tuple[Option, ...] = ()
    if item_type in OPTION_TYPES:
        options = _options(raw.get("options") or [], where)
    scale = None
    if item_type == "scale":
        raw_scale = raw.get("scale")
        if not isinstance(raw_scale, Mapping):
            raise ConfigError(f"{where}: scale items require a 'scale' object")
        scale = _scale(raw_scale, where)
    elif raw.get("scale") is not None:
        if not isinstance(raw["scale"], Mapping):
            raise ConfigError(f"{where}: 'scale' must be an object")
        scale = _scale(raw["scale"], where)
        if not any(opt.activates_scale for opt in options):
            raise ConfigError(f"{where}: a conditional scale needs at least one option with activates_scale")

    max_risk = raw.get("max_risk")
    if max_risk is not None:
        max_risk = float(max_risk)
        if max_risk < 0:
            raise ConfigError(f"{where}: max_risk must be >= 0")

    return Item(
        key=key,
        title=title,
        type=item_type,
        section_id=str(section.get("id") or ""),
        section_title=str(section.get("title") or ""),
        weights=_weights(raw, where),
        options=options,
        scale=scale,
        max_risk=max_risk,
        parent=parent,
    )


def _build_section(raw: Mapping[str, Any]) -> Tuple[Section, Dict[str, Group]]:
    section_id = str(raw.get("id") or "").strip()
    section_title = str(raw.get("title") or "").strip()
    if not section_id or not section_title:
        raise ConfigError("every section needs an 'id' and a 'title'")
    items: List[Item] = []
    groups: Dict[str, Group] = {}
    for entry in raw.get("items") or []:
        item_type = str(entry.get("type") or "")
        if item_type != "group":
            items.append(_build_item(entry, raw, None))
            continue
        group_key = str(entry.get("key") or "").strip()
        if not group_key:
            raise ConfigError(f"section '{section_id}': group is missing 'key'")
        sub_keys: List[str] = []
        for sub in entry.get("subquestions") or []:
            if str(sub.get("type") or "") == "group":
                raise ConfigError(f"group '{group_key}': nested groups are not supported")
            item = _build_item(sub, raw, group_key)
            items.append(item)
            sub_keys.append(item.key)
        if not sub_keys:
            raise ConfigError(f"group '{group_key}': needs at least one sub-question")
        groups[group_key] = Group(key=group_key, title=str(entry.get("title") or group_key), item_keys=tuple(sub_keys))
    return Section(id=section_id, title=section_title, description=str(raw.get("description") or ""), items=tuple(items)), groups


def _build_calibration(raw: Mapping[str, Any], item_keys: Iterable[str]) -> Calibration:
    maps_raw = raw.get("maps") or {}
    if not isinstance(maps_raw, Mapping):
        raise ConfigError("calibration.json: 'maps' must be an object")
    maps: Dict[str, Dict[str, Dict[str, float]]] = {}
    known = set(item_keys)
    for key, by_role in maps_raw.items():
        if key not in known:
            raise ConfigError(f"calibration.json: map for unknown item key '{key}'")
        if not isinstance(by_role, Mapping):
            raise ConfigError(f"calibration.json: '{key}' must map roles to value maps")
        maps[key] = {}
        for role, values in by_role.items():
            if not isinstance(values, Mapping):
                raise ConfigError(f"calibration.json: '{key}.{role}' must be an object")
            cleaned: Dict[str, float] = {}
            for raw_value, probability in values.items():
                try:
                    idx = int(raw_value)
                    prob = float(probability)
                except (TypeError, ValueError) as exc:
                    raise ConfigError(f"calibration.json: '{key}.{role}' has a non-numeric entry") from exc
                if not 0 <= idx <= 5:
                    raise ConfigError(f"calibration.json: '{key}.{role}' key {raw_value} is outside 0..5")
                if not 0.0 <= prob <= 1.0:
                    raise ConfigError(f"calibration.json: '{key}.{role}' value for {raw_value} is outside 0..1")
                cleaned[str(idx)] = prob
            maps[key][role] = cleaned
    return Calibration(
        version=str(raw.get("version") or "0"),
        default_role=str(raw.get("default_role") or "default"),
        maps=maps,
    )


def _build_alerts(raw: Mapping[str, Any]) -> Dict[str, AlertSpec]:
    if not isinstance(raw, Mapping):
        raise ConfigError("scoring.json: 'alerts' must be an object keyed by alert level")
    alerts: Dict[str, AlertSpec] = {}
    for level in ALERT_ORDER:
        entry = raw.get(level)
        if not isinstance(entry, Mapping):
            raise ConfigError(f"scoring.json: alert level '{level}' is missing")
        actions = entry.get("actions") or []
        if not isinstance(actions, list):
            raise ConfigError(f"scoring.json: alert '{level}'.actions must be a list")
        alerts[level] = AlertSpec(
            id=level,
            label=str(entry.get("label") or level.title()),
            headline=str(entry.get("headline") or ""),
            actions=tuple(str(action) for action in actions),
        )
    return alerts


def load_config(config_dir: Optional[Path | str] = None) -> Config:
    """Load and validate ``questionnaire.json``, ``scoring.json`` and ``calibration.json``."""
    base = Path(config_dir) if config_dir is not None else DEFAULT_CONFIG_DIR
    questionnaire = _read_json(base / "questionnaire.json")
    scoring = _read_json(base / "scoring.json")
    calibration_raw = _read_json(base / "calibration.json")

    sections: List[Section] = []
    groups: Dict[str, Group] = {}
    items: Dict[str, Item] = {}
    for raw_section in questionnaire.get("sections") or []:
        section, section_groups = _build_section(raw_section)
        sections.append(section)
        groups.update(section_groups)
        for item in section.items:
            if item.key in items:
                raise ConfigError(f"duplicate item key '{item.key}'")
            items[item.key] = item
    if not items:
        raise ConfigError("questionnaire.json: no items found")

    thresholds_raw = scoring.get("thresholds") or {}
    try:
        thresholds = Thresholds(
            green_max=float(thresholds_raw["green_max"]),
            blue_max=float(thresholds_raw["blue_max"]),
            yellow_max=float(thresholds_raw["yellow_max"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ConfigError("scoring.json: thresholds require green_max, blue_max and yellow_max") from exc
    if not thresholds.green_max < thresholds.blue_max < thresholds.yellow_max:
        raise ConfigError("scoring.json: thresholds must be strictly ascending")

    cap_raw = scoring.get("protection_cap") or {}
    try:
        cap = ProtectionCap(
            any_hard_flag=float(cap_raw["any_hard_flag"]),
            core_risk_at_or_above_threshold=float(cap_raw["core_risk_at_or_above_threshold"]),
            core_risk_threshold=float(cap_raw["core_risk_threshold"]),
            default=float(cap_raw["default"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ConfigError("scoring.json: protection_cap is incomplete") from exc

    core_items = tuple(str(key) for key in scoring.get("core_items") or ())
    for key in core_items:
        if key not in items:
            raise ConfigError(f"scoring.json: core_items references unknown key '{key}'")

    calibration = _build_calibration(calibration_raw, items.keys())

    scale_raw = questionnaire.get("scale") or {}
    return Config(
        questionnaire_version=str(questionnaire.get("version") or "0"),
        engine_version=str(scoring.get("version") or "0"),
        title=str(questionnaire.get("title") or "Screening questionnaire"),
        description=str(questionnaire.get("description") or ""),
        scale_min=int(scale_raw.get("min", 0)),
        scale_max=int(scale_raw.get("max", 5)),
        sections=tuple(sections),
        groups=groups,
        items=items,
        thresholds=thresholds,
        neutral_coefficient=float(scoring.get("neutral_coefficient", 0.3)),
        protection_cap=cap,
        core_items=core_items,
        alerts=_build_alerts(scoring.get("alerts")),
        disclaimer=str(scoring.get("disclaimer") or ""),
        calibration=calibration,
        config_dir=base,
        coverage_floor=float(scoring.get("coverage_floor", 0.0)),
    )


@lru_cache(maxsize=4)
def load_default_config() -> Config:
    """Cached load of the configuration shipped in ``config/``."""
    return load_config(DEFAULT_CONFIG_DIR)
