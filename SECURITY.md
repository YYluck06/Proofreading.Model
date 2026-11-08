# Security policy

## Scope

This project scores answers about minors and is intended to run inside an organisational trust
boundary. The following count as security issues here:

- any path that lets case data, or a summary derived from it, reach a third party (logs, analytics,
  CDN, error reporting, referrer headers);
- cross-site scripting in the Worker UI or the dashboard, including injection through option labels
  or case-reference text;
- authentication or authorisation bypass in a deployment described in these docs;
- unprotected endpoints that return or persist answers;
- arbitrary code execution, including deserialisation of committed binaries;
- dependency or build-chain compromise introduced by this repository.

## Reporting

Report privately to the maintainers — open a
[security advisory](https://github.com/YYluck06/Proofreading.Model/security/advisories/new) or
email the address in the repository profile. Do not open a public issue, and do not attach real
case data to a report; reduce it to a synthetic reproduction.

Please include: what you did, what happened, what you expected, the affected version
(`engine_version` from `/health` or from an exported evaluation), and whether any real data was in
scope. If real case data was exposed, say so immediately in the first line — that changes the
handling from "bug" to "personal-data incident".

## Expectations

- Acknowledgement within five working days.
- A fix, or a documented mitigation, before public disclosure. Coordination on timing is welcome.
- Credit in `CHANGELOG.md` unless you prefer otherwise.

## Hardening already in place

| area | measure |
| --- | --- |
| answer handling | stateless API; no request bodies logged or stored |
| input validation | strict schema, unknown keys rejected, 64 KiB body cap, 200-key cap |
| transport / browser | strict CSP in `public/_headers`, `nosniff`, `DENY` framing, `no-referrer`, COOP, permissions policy |
| rendering | `textContent`-only DOM construction; no data-bearing `innerHTML` |
| CORS | explicit origin allowlist via `ALLOWED_ORIGINS`; empty means same-origin only |
| deserialisation | no pickle/joblib loading at all |
| container | unprivileged uid, no case data in the image, health check |
| repository | `.gitignore` blocks case data, exports, model binaries and secrets |

## Out of scope

- Missing authentication on a local development server (`wrangler dev`, `streamlit run`) — production
  deployments must sit behind an authenticating proxy, as documented in `docs/deployment.md`.
- Reports that require the attacker to already control the host or the Cloudflare account.
- Model accuracy or clinical validity. Those are methodology questions — raise them as issues, they
  are taken seriously but are not vulnerabilities.
