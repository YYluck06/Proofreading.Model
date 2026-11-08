# Deployment

Three ways to run the project. All of them read the same `config/` directory, so a band computed
anywhere is a band computed everywhere.

## 1. Dashboard in Docker (recommended for internal use)

```bash
docker build -t proofreading-model .
docker run --rm -p 8501:8501 -e RISKCORE_CONFIG_DIR=/app/config proofreading-model
```

The image runs as uid 10001, is health-checked against `/_stcore/health`, and contains no case
data. To use a different questionnaire, mount a config directory:

```bash
docker run --rm -p 8501:8501 -v "$PWD/config:/app/config:ro" proofreading-model
```

Terminate TLS in front of it and keep the port off public interfaces. The dashboard has no
authentication of its own: it assumes it is reachable only by assessors.

## 2. Dashboard directly (development)

```bash
python -m pip install -r apps/dashboard/requirements.txt
streamlit run apps/dashboard/app.py
```

Set `RISKCORE_CONFIG_DIR` to point at an alternative config directory; otherwise the repository's
`config/` is used.

## 3. Cloudflare Worker

```bash
cd apps/worker
npm install
npm run check      # typecheck
npm run dev        # wrangler dev on http://127.0.0.1:8787
npm run deploy     # wrangler deploy
```

Before deploying:

1. Set `ALLOWED_ORIGINS` in `wrangler.toml` (comma-separated, exact origins, no wildcards).
2. Put the route behind Cloudflare Access, or deploy to a hostname that is only reachable from
   your network. The API has no authentication built in.
3. Confirm `apps/worker/src/generated/config.ts` is current: `python tools/sync_worker_config.py --check`.

The Worker serves the static UI from `public/` through the assets binding, so `/` is the
assessment form and `/api/*` is the JSON API.

## Configuration changes

```bash
$EDITOR config/questionnaire.json
python tools/sync_worker_config.py        # regenerate the Worker config
python tools/generate_parity_fixtures.py  # regenerate parity fixtures
python -m pytest                          # engine + parity
cd apps/worker && npm run build && node --test ../../tests/node/engine.test.mjs
```

CI runs exactly these commands plus the two `--check` modes, so a forgotten regeneration fails the
build rather than shipping two engines that disagree.

## Operational checks

| check | command |
| --- | --- |
| engine behaviour | `python -m pytest` |
| cross-language parity | `node --test tests/node/engine.test.mjs` |
| worker config in sync | `python tools/sync_worker_config.py --check` |
| fixtures in sync | `python tools/generate_parity_fixtures.py --check` |
| TypeScript typecheck | `cd apps/worker && npm run check` |
| container health | `docker inspect --format '{{.State.Health.Status}}' <container>` |

## Backups and retention

The application holds no database. Back up `config/` (it is the model) and your case management
system (it is the data). Exported evaluations are personal data — see
[data-protection.md](data-protection.md).

## Versioning

`engine_version` and `questionnaire_version` are released independently. Bump
`questionnaire_version` for changes that alter the questions or option ids, `engine_version` for
changes to the arithmetic. Both are embedded in every evaluation id, so an export can always be
traced to the exact rules that produced it.
