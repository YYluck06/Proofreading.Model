# Hosting the project on a single server

What this directory contains, and what it deliberately does not: a demo instance of the
dashboard, its documentation, or nothing at all until you decide. No case data is stored
server-side, so there is no database to back up and no state to restore.

## What can run here

| workload | how | notes |
| --- | --- | --- |
| Dashboard demo | `deploy/docker-compose.yml` → `127.0.0.1:8501` | Streamlit, single container, read-only root filesystem |
| Documentation | static files served by Caddy from `/srv/proofreading-docs` | `pandoc` or any generator; CSP-friendly |
| Worker / API | Cloudflare (`cd apps/worker && npm run deploy`) | the edge deployment is the intended one; running it on a VPS means replacing the assets binding with a Node server |
| Forum | optional, third-party software | keep it on its own subdomain; it needs an authenticated SMTP relay |

The dashboard is a **demo of the method**, not a place to assess real cases. Anyone who can
reach the URL can enter answers and read results. If you need real assessments, run it inside
your organisation behind an authenticating proxy, as described in
[../docs/deployment.md](../docs/deployment.md).

## First deployment

```bash
# on the server, as a normal user with docker installed
git clone https://github.com/YYluck06/Proofreading.Model.git
cd Proofreading.Model

cp deploy/Caddyfile /etc/caddy/Caddyfile   # then edit the two hostnames
$EDITOR /etc/caddy/Caddyfile

docker compose -f deploy/docker-compose.yml up -d --build
curl -fsS http://127.0.0.1:8501/_stcore/health && echo ok

systemctl reload caddy
```

Caddy handles certificates and HTTPS for both hostnames. The dashboard itself only listens on
loopback, so nothing is exposed even if the proxy is misconfigured.

## Updating

```bash
git pull --ff-only
docker compose -f deploy/docker-compose.yml up -d --build
```

Model changes travel through `config/`, so a pull that touches it also changes the scores. Read
`CHANGELOG.md` before updating a demo people rely on, and keep the previous image tag if you need
to roll back.

## Operating notes

- **No secrets on the host.** The dashboard needs none. If you add a Worker deployment, keep its
  Cloudflare token in `~/.wrangler` or CI secrets, never in the repository.
- **Do not put case data on a public demo host.** No exports, no CSVs, no screenshots of real
  assessments in a mounted volume or a shared directory.
- **Logs:** Caddy's access log holds IP addresses. Rotate and shorten retention, or disable it if
  your jurisdiction requires it.
- **Backups:** the application holds no state. Back up `config/` (it is the model) and your own
  documentation source; everything else is reproducible from git.
- **Health:** `/_stcore/health` returning `200` means the process is up; it says nothing about
  whether the configuration is valid. `docker compose logs dashboard` shows a validation error at
  start-up if `config/` is malformed.
