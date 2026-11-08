# Architecture

## Shape of the system

```
                    config/questionnaire.json
                    config/scoring.json          ← the only source of truth
                    config/calibration.json
                              │
             ┌────────────────┴─────────────────┐
             │                                  │
   tools/sync_worker_config.py        (read directly at start-up)
             │                                  │
             ▼                                  ▼
 apps/worker/src/generated/config.ts     core/riskcore/config.py
             │                                  │
             ▼                                  ▼
   apps/worker/src/engine.ts            core/riskcore/engine.py
        (TypeScript)                          (Python)
             │                                  │
      src/index.ts (HTTP)              apps/dashboard/app.py (Streamlit)
             │                          core/riskcore/cli.py (CLI)
             ▼
      public/ (static UI)
```

Two independent implementations of one model, one configuration, and a fixture file that pins
their agreement. The TypeScript engine exists because the screening form has to run at the edge
with no server round-trip that holds case data; the Python engine exists because the analyst-facing
dashboard and the command line need the same answers in a scriptable form.

## Layers

**Configuration (`config/`).** Plain JSON, validated on load. `riskcore.config.load_config()`
rejects unknown item types, duplicate keys, duplicate option ids, missing scales, out-of-range
calibration probabilities, non-ascending thresholds and core items that do not exist. A tampered
or half-edited config fails loudly instead of scoring nonsense — see
`tests/python/test_engine.py::test_config_is_loaded_from_disk`.

**Engine (`core/riskcore/`).** Pure functions over `(config, answers)`. No I/O, no globals, no
clock except an injectable `generated_at`. `normalize_answers()` is the single entry point for
shapes: bare option id, bare integer scale, list of option ids, or `{"options": [...], "scale": n}`.
Everything downstream sees `NormalizedAnswer(options, scale)`.

**Generated worker config.** `tools/sync_worker_config.py` serialises the Python config into
`apps/worker/src/generated/config.ts`. It is generated, committed (so the Worker builds without
Python) and checked in CI with `--check`; editing it by hand is a build failure waiting to happen.

**Worker.** `src/index.ts` owns HTTP concerns: method routing, body size cap (64 KiB), answer-key
cap (200), JSON parse errors, CORS allowlist, security headers. `src/engine.ts` owns scoring and
mirrors the Python file function-for-function so that diffs are reviewable side by side.

**Front-end.** `public/` is dependency-free ES modules: no framework, no bundler, no CDN. All
case-derived text is written with `textContent`; the only innerHTML assignments are static
boilerplate. `public/_headers` pins a strict CSP served by the assets binding.

**Dashboard.** `apps/dashboard/app.py` renders and collects; it calls `evaluate()` and prints the
result. There is no scoring logic in it, which is why the original `ZeroDivisionError` (dividing
effective protection by a total that is often zero) cannot recur: the ratio is computed in the
engine, guarded, and returned as `protection_cap_factor`.

## Why the parity fixtures are the load-bearing test

A duplicate implementation drifts unless something forces it not to. The chosen mechanism is a
generated fixture file:

1. `tools/generate_parity_fixtures.py` runs the **Python** engine over seven representative cases
   and stores the complete output (evaluation id, alert, scores, per-item rows, notes, coverage).
2. `tests/python/test_engine.py` asserts Python still reproduces the file.
3. `tests/node/engine.test.mjs` asserts the **TypeScript** engine reproduces the same file.

Cases are chosen to hit every branch: no answers, all-benign, all-risky (hard flags + 30% cap),
middling (50%/80% cap boundary), coverage below the floor, every answer shape, and a single hard
flag with otherwise low totals. Changing the model therefore requires regenerating the fixtures —
a deliberate speed bump that keeps the two engines honest.

## Deliberately removed

| removed | why |
| --- | --- |
| `ml_risk_model.pkl` and its loader | unpickling a committed binary is arbitrary code execution; the model was not validated against outcomes |
| `.venv/` and `data/` in git | 579 virtualenv files and 12 case-data CSVs in version control |
| duplicate `.streamlit/streamlit_config.toml` | a second, ignored config file that silently diverged |
| hand-written ADJUSTMENT_MAP inside the Worker | duplicated data that had already drifted (the Worker skipped the ×5 unit conversion and used total risk where the Python engine used core-domain risk) |
| `1 - v` inversion for protection items | double negation; replaced by an explicit `map_to` channel plus a linear fallback for degenerate curves |
| auto-loading model / auto-inverting maps at import | implicit behaviour that made results depend on which files happened to be present |

## Extension points

- **New item**: add it to `config/questionnaire.json` (and to `core_items` if it belongs there),
  run the two generators, run the tests. No code change is required in either engine.
- **New calibration role**: add the role key under every map in `config/calibration.json`; the role
  then appears in the dashboard selector and the API's `roles` list automatically.
- **Rebuilding the optional model**: the earlier classifier used the 16 scale items plus three
  interaction terms (`a3_2 × f2`, `b1_2 × c1`, `e1a × d1`). If it is reintroduced it must be
  loaded behind an explicit environment flag, trained from data that never enters the repository,
  and reported alongside — never instead of — the rule-based scores.
