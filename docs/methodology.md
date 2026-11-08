# Methodology

This document describes exactly how a set of answers becomes a banded result. Every number it
mentions lives in `config/`, not in the code; where the code and this document disagree, the
tests are wrong and should fail.

## 1. What is being measured

Twenty scored items across seven sections:

| section | title | items |
| --- | --- | --- |
| A | Family & guardianship | a1, a2, a3_1, a3_2 |
| B | Individual cognition & behaviour | b1_1, b1_2, b2, b3 |
| C | Social environment | c1, c2 |
| D | School engagement | d1, d2 |
| E | Online environment | e1a, e1b, e2, e3 |
| F | Emotional state | f1, f2 |
| G | Self-management | g1, g2 |

Items are of five types: `mcq` (exactly one option), `multi` (any number of options, with an
optional cap), `scale` (an integer 0–5 only), `hybrid` (one option, optionally followed by a
scale once a *qualifying* option is chosen) and `hybrid_multi` (any number of options, optionally
followed by a scale).

Each option carries its own contributions to the three channels:

```json
{ "id": "violent", "label": "Violent parenting", "risk": 5, "neutral": 0, "protection": 0,
  "hard_trigger": true }
```

Each item carries weights that are applied to those contributions:

```json
"weights": { "risk": 1.0, "neutral": 1.0, "protection": 1.0 }
```

Weights exist because the original model treated some domains as more informative than others
(for example guardianship `a1` and online risk `e2` are weighted 1.1, while family functioning
`a3_1` and self-management `g2` are weighted 0.7). They are unchanged from the original model and
are documented here rather than hidden in code.

## 2. Scale answers and calibration

A scale answer is an integer 0–5. Raw units are not used directly: `calibration.json` maps each
(raw value, item) pair to an *intensity* in the range 0–1, estimated from previously assessed
cases. Intensity is then multiplied by 5 to give units, and those units are added to the item's
risk channel (or protection channel for items whose `scale.map_to` is `"protection"`).

```
units = intensity(raw) × 5
```

Three details matter:

1. **Degenerate maps are ignored.** If an item's calibration curve is constant (the shipped data
   has two: `d2` and `f1`), the curve carries no information. It is treated as missing and the
   engine falls back to linear intensity `raw / 5`, recording `linear-fallback` in the item notes.
   The original implementation instead inverted the protection channel by formula, which turned a
   flat curve into a flat *opposite* answer.
2. **Missing keys fall back the same way.** Calibration is optional cover, not a requirement.
3. **Intensity is clamped to [0, 1]** and rounds half-up at two decimals only on output.

Both engines implement the identical fallback, which is why `tests/fixtures/parity_cases.json`
can compare complete evaluation records rather than a subset of fields.

## 3. Combining the channels

```
total_risk        = Σ (item risk contributions × item risk weight)
total_neutral     = Σ (item neutral contributions × item neutral weight)
total_protection  = Σ (item protection contributions × item protection weight)
core_risk         = Σ over the core items of the weighted risk
```

The core items are `a1, a2, a3_1, a3_2, b1_1, b1_2, c1, c2, d1, d2, e1a, e1b, e2` — the domains
that describe immediate circumstances rather than disposition.

Protection is **capped**, so that protective factors can never mathematically erase a serious
concern:

| condition | cap factor |
| --- | --- |
| any hard flag present | 0.30 |
| core-domain risk ≥ 4.0 | 0.50 |
| otherwise | 0.80 |

```
effective_protection = min(total_protection, total_risk × cap_factor)
effective_neutral    = total_neutral × 0.3
net_risk             = total_risk − effective_protection − effective_neutral
```

Neutral evidence (context that neither raises nor lowers concern) is deliberately discounted
rather than ignored: it informs the narrative without moving the band as much as risk or
protection.

## 4. Hard flags

A hard flag is raised when:

- an option carries `hard_trigger: true` (for example unreachable or absent guardians, violent
  parenting, chronic truancy), or
- a scale value reaches the item's `hard_threshold` (for example peer values `b2` ≥ 5).

Hard flags are listed individually in the output with the reason that raised them. They exist so
that a single decisive concern cannot be averaged away, and they lower the protection cap to 30%.

## 5. Bands and coverage

| band | condition |
| --- | --- |
| insufficient | fewer than 60% of items answered |
| green | net ≤ 0.0 |
| blue | 0.0 < net ≤ 9.0 |
| yellow | 9.0 < net ≤ 15.0 |
| red | net > 15.0 |

The *insufficient* band is checked first and deliberately has no numeric meaning: an assessment
that is mostly blank is not a low-risk assessment. Each band ships with a headline and a list of
recommended next steps in `scoring.json`; the red band requires escalation within the same working
day and an explicit human review.

## 6. Evaluation ids

```
canonical = {"answers": {key: {"options": [...], "scale": n}},
             "engine_version": ..., "questionnaire_version": ..., "role": ...}
eval_id   = "EV-" + UTC date (YYYYMMDD) + "-" + sha256(canonical json)[:16]
```

The payload contains **inputs only** — never computed floats — so the id is stable across
languages, machines and versions of the arithmetic, and two assessors who enter the same answers
obtain the same id. It is an audit handle, not a signature.

## 7. What the model deliberately does not do

- No machine-learned classifier is applied at scoring time. The earlier implementation shipped a
  `joblib` pickle that was loaded automatically; unpickling is code execution, and the model's
  contribution was never validated against outcomes, so it has been removed. The interaction
  features it used are documented in `docs/architecture.md` for anyone who wants to rebuild it
  behind an explicit opt-in.
- No item is scored from free text. Free-text fields exist only for a case reference and assessor
  name, and they never enter the score.
- No automatic decisions. The output is a band plus a checklist; a human records the decision.
