"""Make ``riskcore`` importable from the test session without installing the package."""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CORE = REPO_ROOT / "core"
if str(CORE) not in sys.path:
    sys.path.insert(0, str(CORE))
