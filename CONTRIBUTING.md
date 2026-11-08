# Contributing

Thanks for taking this seriously. This project handles information about minors, so the bar for
correctness is higher than "the demo worked".

## Ground rules

1. **No case data.** Never commit real answers, exports, screenshots of real assessments or
   calibration data derived from identifiable cases. Fixtures are synthetic.
2. **No new runtime dependencies without a reason.** The engine is standard-library Python; the
   front-end is dependency-free ES modules. Both should stay that way unless something is genuinely
   impossible.
3. **One source of truth.** Model changes belong in `config/`. If a rule cannot be expressed there,
   discuss the schema change first.
4. **Parity is not optional.** Any change to scoring must be applied to both engines, with the
   fixtures regenerated.

## Workflow

```bash
git clone https://github.com/YYluck06/Proofreading.Model && cd Proofreading.Model
python -m pip install pytest
python -m pytest                       # engine + parity fixtures

cd apps/worker
npm install
npm run check                          # typecheck
npm run build
node --test ../../tests/node/engine.test.mjs
```

Before opening a pull request, run:

```bash
python tools/sync_worker_config.py --check
python tools/generate_parity_fixtures.py --check
```

If those fail, you changed the model without propagating it. Run the generators without `--check`,
inspect the diff, and commit the regenerated files together with the config change.

## Changing the model

| change | files to touch |
| --- | --- |
| new or edited item / option / weight | `config/questionnaire.json`, then both generators |
| threshold, cap, coverage floor, alert copy | `config/scoring.json`, then both generators |
| calibration curves or roles | `config/calibration.json`, then both generators |
| arithmetic | `core/riskcore/engine.py` **and** `apps/worker/src/engine.ts`, then both generators |
| HTTP surface | `apps/worker/src/index.ts`, `docs/api.md` |

A scoring change also needs a line in `docs/methodology.md` and, if it changes behaviour for real
cases, a note in `CHANGELOG.md` explaining the effect on existing bands.

## Style

- Python: standard library typing, no bare `except`, functions that do one thing. Prefer returning
  values over mutating. `python -m compileall` and `pytest` must pass.
- TypeScript: `strict`, no `any` in exported signatures, no `innerHTML` with data. `npm run check`
  must pass.
- User-facing strings: English, plain, free of jargon a social worker would have to look up. State
  uncertainty when it exists.
- Accessibility is a requirement, not a polish item: label every control, keep focus visible, never
  convey a band by colour alone.

## Reviews

A pull request touching scoring, data handling or the questionnaire needs review by someone who
understands the assessment domain, not only by someone who understands the code. Say explicitly in
the description which of the two you are.

## Reporting problems

- Bugs and proposals: open an issue with the smallest reproducible input (answers as JSON, expected
  band, actual band).
- Security or data-protection problems: **do not** open an issue — see [SECURITY.md](../SECURITY.md).
