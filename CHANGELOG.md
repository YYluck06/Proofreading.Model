# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows the split between
`questionnaire_version` (what is asked and how options are weighted) and `engine_version` (how the
numbers are combined).

## [2.0.0] - 2026-01-15

Complete English rewrite of the original Chinese-language Streamlit application and its Cloudflare
Worker. The screening model, item weights and calibration data are carried over; the software
around them is new.

### Added

- `config/` as the single source of truth: `questionnaire.json`, `scoring.json`, `calibration.json`
  with validation on load (duplicate keys, unknown option ids, non-ascending thresholds and
  out-of-range calibration probabilities are rejected, not silently tolerated).
- `core/riskcore/` — a pure, dependency-free Python engine with a documented API and
  `python -m riskcore.cli`.
- `apps/worker/src/engine.ts` — a line-for-line TypeScript mirror of the Python engine.
- `tests/fixtures/parity_cases.json` plus generators: seven cases that pin the two engines to
  identical output, including per-item rows, notes and evaluation ids.
- `tests/python/` (pytest) and `tests/node/` (`node:test`) suites; both run in CI.
- GitHub Actions CI: Python 3.11–3.13, Node 20/22, dashboard import check, Docker build.
- Documentation: architecture, methodology, API, data protection, deployment.
- Accessible Worker UI (English): fieldset/legend structure, labelled controls, live-region result,
  keyboard-operable, colour never the only signal, `prefers-reduced-motion` and print styles.
- Hardened container image: unprivileged user, health check, no case data.
- `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE` (MIT), `.editorconfig`, `.gitignore`.

### Fixed

- **Broken Worker front-end.** `public/app.js` was an abandoned merge of two versions (duplicated
  `const top`, unterminated `buildContributions()`/`renderScaleInput()`/`seedQuestionnaire()`,
  double `init()`, references to a non-existent `state.factors`), and `public/index.html` contained
  the sidebar and tabs markup twice. Both are rewritten from scratch.
- **Engine divergence.** The Worker applied calibration probabilities directly where Python
  multiplied by the scale maximum, and used total risk where Python used core-domain risk. The two
  now compute the same formula, proven by fixtures.
- **`ZeroDivisionError` in the cockpit** when no protective evidence existed
  (`effective_protection / total_protection`). The ratio is now computed, guarded and returned by
  the engine as `protection_cap_factor`.
- **Mixed-type slider options** (`["Not assessed", 0, 1, 2, 3, 4, 5]`) replaced by an integer
  selectbox with an explicit "Not assessed" placeholder.
- **Protection-channel double negation.** Items flagged protective were inverted with `1 - v` on
  top of a constant calibration map, producing a flat wrong answer. Calibration now declares an
  explicit `map_to` channel, and degenerate (constant) curves fall back to linear scaling with the
  fallback recorded in the item notes.
- **Automatic pickle loading.** `ml_risk_model.pkl` was loaded at start-up; unpickling a committed
  binary is arbitrary code execution, and the model was never validated against outcomes. It has
  been removed, and the interaction features it used are documented instead.
- **XSS in the Worker UI**: case notes and option labels were injected through `innerHTML`. All
  case-derived rendering now uses `textContent`.
- **Repository hygiene**: removed 579 committed virtualenv files and 12 case-data CSVs, added a
  root `.gitignore`, removed the duplicate `.streamlit/streamlit_config.toml` that silently
  overrode the real theme file.
- **Deprecated `datetime.utcnow()`** replaced by timezone-aware UTC timestamps.
- **Inert role selector** (a student-type dropdown that never affected scoring) replaced by the
  calibration-role selector that the engine actually consumes.

### Changed

- Default answer format is an option **id**, not a display label; answers are accepted as
  `{"options": [...], "scale": n}`, a bare id, a list of ids or a bare integer scale.
- Alerts gained an explicit `insufficient` band below the coverage floor, so a mostly blank
  assessment can no longer read as low risk.
- Evaluation ids are content hashes of the canonical answer payload (inputs only), stable across
  languages.
- The dashboard is presentation-only and installs a single dependency (`streamlit`), down from
  twelve (including `scikit-learn`, `pgmpy`, `statsmodels`, `networkx`, `matplotlib`).

### Removed

- `risk_dashboard_v4/` (superseded by `apps/dashboard/` and `core/riskcore/`).
- `cloudflare-worker/` (superseded by `apps/worker/`).
- The committed calibration builders and CSV case data: regeneration belongs in an analysis
  environment that holds approved data, not in this repository.

## [1.0.0] - prior work

The original Chinese-language implementation: a 1,400-line Streamlit dashboard, a Cloudflare Worker
that re-implemented the scoring rules, and a GBDT model trained on locally held case data.
