# Meesho Commerce OS

Multi-site kurti dropshipping platform: **10 branded stores, one engine**.

Stack: Node.js 20 · TypeScript · PostgreSQL 16 · Redis 7 · Next.js

## Repo layout

- `engine/` — backend API + jobs + DB migrations
- `admin-ui/` — Next.js admin dashboard
- `nginx/` — reverse proxy config templates
- `site-template/` — static site template deployed per store

## Quick start (local via Docker)

1. Copy and fill env vars:

```bash
cp .env.example .env
```

2. Start services:

```bash
export ENV_FILE=.env
docker compose up -d --build
```

3. Open admin UI:

- http://localhost:13000

## Full setup

See `SETUP.md`.

## Production checklist

- **Secrets & env**: ensure `.env` is present on the server and never committed.
  - Set `ENGINE_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY` (generate strong random values).
  - Set third-party credentials (`RAZORPAY_*`, `WABA_*`, `RESEND_API_KEY`, `SMTP_*`, etc.).
- **Webhooks**:
  - Razorpay webhook must be configured to `https://<your-domain>/webhooks/razorpay`.
  - Razorpay webhook signatures are verified against the per-site webhook secret; invalid signatures are rejected.
- **Backups**:
  - Schedule automated Postgres backups (e.g. nightly `pg_dump`) and store them off-host.
  - Verify restore procedures periodically.
- **Logging & monitoring**:
  - Set `SENTRY_DSN` (optional but recommended) for engine error reporting.
  - Use `docker compose logs -f engine` for runtime diagnostics.
  - Monitor disk usage for Docker volumes and `SITES_DIR` deployments.
- **Networking & TLS**:
  - Put Nginx in front and enable HTTPS (Let’s Encrypt/Certbot).
  - Confirm rate limiting is enabled in `nginx/nginx.conf`.
