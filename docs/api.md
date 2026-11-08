# HTTP API

The Worker exposes three read paths and one write path. It is stateless: no request is logged,
stored or echoed back later, and no cookie or identifier is issued.

Base URL in development: `http://127.0.0.1:8787` (`wrangler dev`).
Authenticated access is not built in — put the Worker behind Cloudflare Access or an equivalent
gateway before exposing it, because the questionnaire describes minors.

## Common headers

| header | value |
| --- | --- |
| `content-type` | `application/json; charset=utf-8` |
| `x-content-type-options` | `nosniff` |
| `x-frame-options` | `DENY` |
| `referrer-policy` | `no-referrer` |
| `cross-origin-opener-policy` | `same-origin` |
| `permissions-policy` | geolocation=(), microphone=(), camera=() |
| `access-control-allow-origin` | only for origins listed in `ALLOWED_ORIGINS` |

`OPTIONS` requests return `204` with the CORS preflight headers. If `ALLOWED_ORIGINS` is empty, no
cross-origin request is permitted (same-origin only). Wildcards are rejected by configuration
review, not by code: do not add `*` when the payload describes a child.

Errors are JSON:

```json
{ "error": { "code": "invalid_answers", "message": "'a3_1': scale 9 is outside 0-5" } }
```

| status | code | when |
| --- | --- | --- |
| 400 | `invalid_json` | body is not JSON or not an object |
| 404 | `not_found` | unknown `/api/*` path |
| 405 | `method_not_allowed` | wrong verb for a known path |
| 413 | `payload_too_large` | body above 64 KiB |
| 415 | `unsupported_media_type` | `POST` without a JSON content type |
| 422 | `invalid_answers` | answers failed validation (message names the item) |
| 500 | `internal_error` | unexpected failure |

## GET /health

```json
{
  "status": "ok",
  "service": "proofreading-risk-worker",
  "version": "2.0.0",
  "environment": "production",
  "questionnaire_version": "2.0.0",
  "engine_version": "2.0.0",
  "utc": "2026-01-15T09:30:00.000Z"
}
```

## GET /api/questionnaire

Returns everything the UI needs to render the form and explain the model: versions, title,
description, `scale` limits, `sections`, `groups`, `thresholds`, `coverage_floor`,
`neutral_coefficient`, `protection_cap`, `alerts`, `roles`, `default_role`, `disclaimer`.
Cached for 300 seconds. **No answers, no case data.**

## POST /api/evaluate

Request:

```json
{
  "answers": {
    "a1": ["single_parent", "weak_supervision"],
    "a2": "neglectful",
    "a3_1": 4,
    "b2": { "options": ["occasional_extreme"], "scale": 5 }
  },
  "role": "default"
}
```

- `answers` — required object; keys are item keys; values accept a bare option id, a list of
  option ids, a bare integer scale, or `{"options": [...], "scale": n}`. At most 200 keys.
- `role` — optional; must exist in `calibration.json`. Defaults to `default_role`.

Response — the complete evaluation record:

```json
{
  "eval_id": "EV-20260115-3f5f0b4d2a19c8e1",
  "generated_at": "2026-01-15T09:30:00.000Z",
  "engine_version": "2.0.0",
  "questionnaire_version": "2.0.0",
  "role": "default",
  "alert": { "id": "yellow", "label": "...", "headline": "...", "actions": ["..."] },
  "scores": {
    "total_risk": 21.6,
    "total_neutral": 2.0,
    "total_protection": 4.0,
    "effective_neutral": 0.6,
    "effective_protection": 4.0,
    "protection_cap_factor": 0.8,
    "core_risk": 18.4,
    "net_risk_score": 17.0
  },
  "hard_flags": [{ "key": "a2", "title": "Parenting style", "reason": "hard flag: 'Violent parenting'" }],
  "items": [
    {
      "key": "a3_1",
      "title": "Family functioning",
      "section_id": "A",
      "section_title": "Family & guardianship",
      "selected_options": [],
      "selected_labels": [],
      "scale_value": 4,
      "raw_risk": 3.2,
      "raw_neutral": 0.0,
      "raw_protection": 0.0,
      "risk": 2.24,
      "neutral": 0.0,
      "protection": 0.0,
      "net": 2.24,
      "hard_flag": false,
      "notes": ["scale 4/5: risk 3.20 (calibration)"]
    }
  ],
  "coverage": { "answered_items": 4, "scoreable_items": 20, "ratio": 0.2, "complete": false },
  "answers": { "a1": ["single_parent"], "a2": "neglectful" },
  "notes": ["coverage 20% is below the 60% floor: the case is reported as insufficient data"],
  "disclaimer": "..."
}
```

Numbers are rounded half-up to two decimals at the boundary only; the internal computation keeps
full precision so that Python and TypeScript agree bit for bit.

`coverage.ratio < coverage_floor` yields `alert.id == "insufficient"` regardless of the totals.

## curl examples

```bash
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/api/questionnaire | head -c 400
curl -s -X POST http://127.0.0.1:8787/api/evaluate \
  -H 'content-type: application/json' \
  -d '{"answers":{"a2":"violent","a3_1":5,"e2":{"options":["violent_content"],"scale":5}}}'
```

## Client integration notes

- The response is self-contained: store `eval_id` with your case file, not the whole payload, if
  you must keep a pointer.
- Never send names, dates of birth, addresses or ID numbers. The API accepts free-text nowhere;
  the dashboard's case-reference field never leaves the browser session.
- If you need the band only, read `alert.id`; do not re-derive a band from `scores` on the client.
