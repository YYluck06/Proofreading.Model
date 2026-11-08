# Proofreading.Model

A configuration-driven screening engine for youth risk and protection factors, with a
Streamlit dashboard and an edge deployment target.

[![CI](https://github.com/YYluck06/Proofreading.Model/actions/workflows/ci.yml/badge.svg)](https://github.com/YYluck06/Proofreading.Model/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Decision support only.** This project summarises structured screening evidence. It is not a
> validated psychometric instrument, it does not diagnose anyone, and no decision about a young
> person should rest on its output alone. Read [docs/methodology.md](docs/methodology.md) and
> [docs/data-protection.md](docs/data-protection.md) before using it with real cases.

---

## Why this repository exists

The original project was a single 1,400-line Chinese Streamlit application plus a Cloudflare
Worker that re-implemented the scoring rules a second time, by hand. The two implementations had
already drifted apart, the Worker's front-end bundle was a broken merge of two versions, and
nothing was tested. This rewrite keeps the screening model intact — the same 20 items, the same
weights, the same calibration data — and rebuilds everything around it:

- **one source of truth** for the questionnaire, weights, thresholds and calibration,
- **two engines that are proven equivalent** by shared fixtures (Python and TypeScript),
- **tests and CI** instead of manual clicking,
- **English throughout**, with accessibility and data-protection requirements written down,
- **no unpickling of arbitrary model files** and no case data in git.

The scoring model, item weights and calibration maps come from the earlier work; the
implementation, documentation, tests and UI do not.

---

## Repository layout

```
config/                     Single source of truth (JSON, human-editable)
  questionnaire.json        7 sections, 20 scored items, options with weights
  scoring.json              thresholds, protection caps, coverage floor, alert copy
  calibration.json          empirical scale calibration per item and role
core/riskcore/              Python engine (no UI, no I/O beyond config files)
  config.py                 schema, validation, typed access
  engine.py                 normalisation, scoring, evaluation ids
  cli.py                    `python -m riskcore.cli`
apps/dashboard/             Streamlit dashboard (presentation only)
apps/worker/                Cloudflare Worker: JSON API + static UI
  src/engine.ts             TypeScript mirror of core/riskcore/engine.py
  src/generated/config.ts   generated from config/ (never edited by hand)
  public/                   accessible, dependency-free front-end
tests/fixtures/             cross-language parity cases
tests/python/               pytest suite
tests/node/                 node:test suite
tools/                      config generators (worker config, parity fixtures)
docs/                       architecture, methodology, API, data protection, deployment
```

---

## Quick start

### Scoring from Python

```bash
python -m pip install -r apps/dashboard/requirements.txt   # dashboard only; the engine is stdlib
PYTHONPATH=core python -m riskcore.cli --answers case.json --summary
```

`case.json` is an answer map, keyed by item key:

```json
{
  "a1": ["single_parent", "weak_supervision"],
  "a2": "neglectful",
  "a3_1": 4,
  "b2": { "options": ["occasional_extreme"], "scale": 5 }
}
```

Answers accept three shapes and they all normalise identically: a bare option id, a bare scale
integer, or an explicit `{"options": [...], "scale": n}` object.

### Dashboard

```bash
streamlit run apps/dashboard/app.py
```

### Worker (local edge runtime)

```bash
cd apps/worker
npm install
npm run dev
```

`POST /api/evaluate` with `{"answers": {...}, "role": "default"}` returns the full evaluation
record. See [docs/api.md](docs/api.md).

---

## How scoring works (short version)

Each item feeds three independent channels:

| channel | meaning | treatment |
| --- | --- | --- |
| risk | factors that raise concern | weighted, summed |
| neutral | context that neither raises nor lowers concern | summed, then counted at 0.3× |
| protection | factors that mitigate risk | weighted, summed, then **capped** |

```
net_risk = Σ risk − min(Σ protection, Σ risk × cap_factor) − (Σ neutral × 0.3)
```

`cap_factor` is 0.8 by default, 0.5 once core-domain risk reaches 4.0, and 0.3 whenever a hard
flag is present — a hallmark of concern can never be outweighed by protective factors. Bands:

| band | net risk |
| --- | --- |
| green | ≤ 0 |
| blue | ≤ 9 |
| yellow | ≤ 15 |
| red | > 15 |
| insufficient | fewer than 60% of items answered |

Evaluation ids are content hashes of the canonical answer payload (`EV-YYYYMMDD-<16 hex>`), so
re-scoring the same answers always yields the same id — in Python and in the Worker alike.

Full detail, including the calibration fallback rule and every weight: [docs/methodology.md](docs/methodology.md).

---

## Changing the questionnaire or the model

Edit the JSON in `config/`, then regenerate the derived artefacts:

```bash
python tools/sync_worker_config.py        # config/ -> apps/worker/src/generated/config.ts
python tools/generate_parity_fixtures.py  # config/ -> tests/fixtures/parity_cases.json
```

Both tools support `--check`, which is what CI runs: a config change that was not propagated
fails the build instead of silently desynchronising the two engines.

---

## Tests

```bash
python -m pytest                     # engine behaviour + parity fixtures + dashboard smoke test
cd apps/worker && npm run build      # required before the node tests
npm test                             # parity, HTTP contract and static UI checks
```

`tests/fixtures/parity_cases.json` contains complete expected outputs generated by the Python
engine. The Python suite asserts it still produces them; the Node suite asserts the TypeScript
engine produces them too. A change on one side that is not mirrored on the other cannot pass.

`tests/node/api.test.mjs` exercises the Worker's routes, validation and CORS rules through the
handler itself, and `tests/node/ui.test.mjs` statically checks the shipped page: no duplicated ids,
no dangling element references, no `innerHTML` with case data, CSP present.

---

## Deployment

- **Dashboard**: `docker build -t proofreading-model . && docker run -p 8501:8501 proofreading-model`
  (runs as an unprivileged user, health-checked, see [docs/deployment.md](docs/deployment.md)).
- **Worker**: `cd apps/worker && npm run deploy` after setting `ALLOWED_ORIGINS` in `wrangler.toml`.
  The API is stateless by design; nothing about a case is stored or logged.

---

## Data protection

The tool handles information about minors. The rules are short and non-negotiable: no case data
in git, no names or identifiers in free-text fields, no retention beyond the working session, and
an explicit human decision recorded for every banded result. Read
[docs/data-protection.md](docs/data-protection.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE). The screening model and calibration data originate from the earlier
Chinese-language implementation; this repository is a full rewrite of the surrounding software.
