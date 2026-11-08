"""riskcore - configuration-driven youth risk and protection screening engine.

Quick start::

    from riskcore import load_default_config, evaluate

    config = load_default_config()
    result = evaluate(config, {"a1": ["single_parent"], "a3_1": 3, "b1_2": 4})
    print(result.alert_id, result.net_risk_score)
"""

from .config import (
    ALLOWED_TYPES,
    DEFAULT_CONFIG_DIR,
    REPO_ROOT,
    AlertSpec,
    Calibration,
    Config,
    ConfigError,
    Group,
    Item,
    Option,
    ProtectionCap,
    Scale,
    Section,
    Thresholds,
    Weights,
    load_config,
    load_default_config,
)
from .engine import (
    Evaluation,
    ItemScore,
    NormalizedAnswer,
    ScoringError,
    calibrated_intensity,
    domain_summary,
    evaluate,
    normalize_answers,
    rank_contributions,
    round_half_up,
)

__version__ = "2.0.0"

__all__ = [
    "ALLOWED_TYPES",
    "AlertSpec",
    "Calibration",
    "Config",
    "ConfigError",
    "DEFAULT_CONFIG_DIR",
    "Evaluation",
    "Group",
    "Item",
    "ItemScore",
    "NormalizedAnswer",
    "Option",
    "ProtectionCap",
    "REPO_ROOT",
    "Scale",
    "ScoringError",
    "Section",
    "Thresholds",
    "Weights",
    "__version__",
    "calibrated_intensity",
    "domain_summary",
    "evaluate",
    "load_config",
    "load_default_config",
    "normalize_answers",
    "rank_contributions",
    "round_half_up",
]
