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

