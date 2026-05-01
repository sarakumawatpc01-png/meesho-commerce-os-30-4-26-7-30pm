# ================================================================
# MEESHO COMMERCE OS — OpenCode VPS Install Prompt
# Repo: https://github.com/sarakumawatpc01-png/mes-ecom-30april26
# Superadmin panel: https://meesho.agencyfic.com
# ================================================================
#
# INSTRUCTIONS: Paste this entire file as your prompt into OpenCode.
# OpenCode will execute all phases top to bottom on your VPS.
# Read every phase header before approving execution.
#

You are a senior DevOps engineer installing the Meesho Commerce OS on a live
production Ubuntu VPS. Follow each phase exactly. Stop and report if any check
fails — never skip a failing check.

────────────────────────────────────────────────────────────────────────────────
ABSOLUTE RULES (never violate these)
────────────────────────────────────────────────────────────────────────────────
• Do NOT touch, stop, or modify any existing Docker containers/volumes/networks.
• Use ONLY names prefixed with `meesho_` for containers, volumes, and networks.
• Reserved ports for this project: 13000, 13001, 15432 (127.0.0.1 only), 16379
  (127.0.0.1 only). If any of these are already in use, STOP and report — do
  not reassign ports.
• Never run `docker system prune`, `docker volume prune`, or any destructive
  Docker command.
• Never delete files outside the project directory.
────────────────────────────────────────────────────────────────────────────────


═══════════════════════════════════════════════════════════════
PHASE 1 — System requirements check
═══════════════════════════════════════════════════════════════

```bash
echo "── OS & tools ──"
uname -a
lsb_release -a 2>/dev/null || cat /etc/os-release

echo "── Docker ──"
docker --version || { echo "ERROR: Docker not installed"; exit 1; }
docker compose version || { echo "ERROR: docker compose v2 not found. Install it first."; exit 1; }

echo "── Git ──"
git --version || { echo "ERROR: git not installed"; exit 1; }

echo "── Disk space (need at least 5 GB free) ──"
df -h /

echo "── Port availability ──"
BUSY=""
for port in 13000 13001 15432 16379; do
  ss -tlnp 2>/dev/null | grep -q ":$port " && BUSY="$BUSY $port"
done
if [ -n "$BUSY" ]; then
  echo "ERROR: Ports already in use:$BUSY — resolve before continuing"
  exit 1
fi
echo "All required ports are free ✓"

echo "── Existing meesho_ containers (should be none on fresh install) ──"
docker ps -a --filter "name=meesho_" --format "{{.Names}} {{.Status}}" 2>/dev/null || true
```


═══════════════════════════════════════════════════════════════
PHASE 2 — Clone repository
═══════════════════════════════════════════════════════════════

```bash
# Choose install directory
INSTALL_DIR="/opt/meesho-commerce-os"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Repo already cloned — pulling latest changes"
  cd "$INSTALL_DIR" && git pull origin main
else
  echo "Cloning repository…"
  git clone https://github.com/sarakumawatpc01-png/mes-ecom-30april26.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
echo "Working directory: $(pwd)"
ls -la

# Verify critical files exist
for f in docker-compose.yml .env.example \
          engine/src/app.ts \
          engine/src/db/schema.sql \
          nginx/sites-available/meesho.agencyfic.com.conf; do
  [ -f "$f" ] || { echo "ERROR: Missing expected file: $f"; exit 1; }
done
echo "All critical files present ✓"
```


═══════════════════════════════════════════════════════════════
PHASE 3 — Create .env file
═══════════════════════════════════════════════════════════════

```bash
cd /opt/meesho-commerce-os

if [ ! -f .env ]; then
  cp .env.example .env
fi

# Generate cryptographically strong secrets
PG_PASS=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 40)
REDIS_PASS=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)
ENGINE_SECRET=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 64)
ENC_KEY=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)

# Substitute into .env (placeholders only)
# Placeholders must match .env.example values
MISSING_PLACEHOLDER=0
for placeholder in REPLACE_WITH_SECURE_POSTGRES_PASSWORD REPLACE_WITH_SECURE_REDIS_PASSWORD \
  REPLACE_WITH_64_CHAR_JWT_SECRET REPLACE_WITH_32_CHAR_ENCRYPTION_KEY; do
  if ! grep -q "$placeholder" .env; then
    echo "ERROR: Placeholder $placeholder not found in .env"
    MISSING_PLACEHOLDER=1
  fi
done
if [ "$MISSING_PLACEHOLDER" -ne 0 ]; then
  exit 1
fi
sed -i "s|REPLACE_WITH_SECURE_POSTGRES_PASSWORD|${PG_PASS}|g" .env
sed -i "s|REPLACE_WITH_SECURE_REDIS_PASSWORD|${REDIS_PASS}|g" .env
sed -i "s|REPLACE_WITH_64_CHAR_JWT_SECRET|${ENGINE_SECRET}|g" .env
sed -i "s|REPLACE_WITH_32_CHAR_ENCRYPTION_KEY|${ENC_KEY}|g" .env

# Set domain values
sed -i "s|SUPERADMIN_DOMAIN=.*|SUPERADMIN_DOMAIN=meesho.agencyfic.com|" .env
sed -i "s|NEXT_PUBLIC_SUPERADMIN_DOMAIN=.*|NEXT_PUBLIC_SUPERADMIN_DOMAIN=meesho.agencyfic.com|" .env

# Update DATABASE_URL and REDIS_URL to use the generated passwords
# NOTE: docker-compose overrides these with service names (postgres, redis) in container networking
# .env values are used for direct local access only
sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://meesho:${PG_PASS}@localhost:15432/meesho_engine|" .env
sed -i "s|REDIS_URL=.*|REDIS_URL=redis://:${REDIS_PASS}@localhost:16379|" .env

echo ".env ready with auto-generated secrets ✓"

# Ensure docker compose uses the generated .env file
export ENV_FILE=.env

echo "── Verifying key values in .env ──"
grep -E "^(POSTGRES_PASSWORD|REDIS_PASSWORD|ENGINE_SECRET|ENCRYPTION_KEY|SUPERADMIN_DOMAIN|DATABASE_URL|WABA_TOKEN|WABA_PHONE_ID)" .env
```


═══════════════════════════════════════════════════════════════
PHASE 4 — SSL certificate for meesho.agencyfic.com
═══════════════════════════════════════════════════════════════

```bash
cd /opt/meesho-commerce-os
mkdir -p nginx/ssl/meesho.agencyfic.com

# Check if cert already exists (from certbot or manual copy)
if [ -f "nginx/ssl/meesho.agencyfic.com/fullchain.pem" ] && \
   [ -f "nginx/ssl/meesho.agencyfic.com/privkey.pem" ]; then
  echo "SSL certificate already present ✓"
else
  # Try certbot (stop any service using port 80 temporarily if needed)
  if command -v certbot >/dev/null 2>&1; then
    echo "Attempting certbot certificate…"
    # If nginx or apache is running on 80, use webroot or dns challenge instead
    # Using standalone (requires port 80 free)
    PORT80=$(ss -tlnp 2>/dev/null | grep ':80 ' | head -1)
    if [ -n "$PORT80" ]; then
      echo "Port 80 is in use by: $PORT80"
      echo "Using certbot with --webroot or manual DNS challenge may be needed."
      echo "Trying certbot standalone anyway (it will fail if port 80 is busy)…"
    fi
    certbot certonly --standalone \
      -d meesho.agencyfic.com \
      --non-interactive --agree-tos \
      -m admin@agencyfic.com \
      --preferred-challenges http || {
        echo "WARNING: certbot standalone failed."
        echo "Try manually: certbot certonly --webroot -w /var/www/html -d meesho.agencyfic.com"
        echo "Then re-run from Phase 4."
      }

    # Copy certs if certbot succeeded
    if [ -f "/etc/letsencrypt/live/meesho.agencyfic.com/fullchain.pem" ]; then
      cp /etc/letsencrypt/live/meesho.agencyfic.com/fullchain.pem nginx/ssl/meesho.agencyfic.com/
      cp /etc/letsencrypt/live/meesho.agencyfic.com/privkey.pem  nginx/ssl/meesho.agencyfic.com/
      echo "SSL certificate installed from certbot ✓"
    fi
  else
    echo "certbot not found. Install it: apt install certbot"
    echo "Or manually place certs at:"
    echo "  nginx/ssl/meesho.agencyfic.com/fullchain.pem"
    echo "  nginx/ssl/meesho.agencyfic.com/privkey.pem"
    echo "Then re-run from Phase 4."
  fi
fi

# Final check
[ -f "nginx/ssl/meesho.agencyfic.com/fullchain.pem" ] || {
  echo "ERROR: SSL cert not found. Place it manually and re-run."
  exit 1
}
echo "SSL cert ready ✓"
```


═══════════════════════════════════════════════════════════════
PHASE 5 — Create Docker network
═══════════════════════════════════════════════════════════════

```bash
# Create meesho_internal network only if it doesn't exist
docker network ls | grep -q "meesho_internal" \
  && echo "meesho_internal network already exists ✓" \
  || { docker network create meesho_internal && echo "Created meesho_internal network ✓"; }

docker network inspect meesho_internal --format "{{.Name}} ({{.Driver}})"
```


═══════════════════════════════════════════════════════════════
PHASE 6 — Build Docker images
═══════════════════════════════════════════════════════════════

```bash
cd /opt/meesho-commerce-os

echo "Building all images (this takes 5-10 minutes on first run)…"
docker compose build --no-cache 2>&1 | tee /tmp/meesho_build.log

# Check for build errors
if grep -qi "error\|failed\|exit code" /tmp/meesho_build.log; then
  echo ""
  echo "══ BUILD ERRORS DETECTED ══"
  grep -i "error\|failed\|exit code" /tmp/meesho_build.log | tail -20
  echo ""
  echo "Full log at /tmp/meesho_build.log"
  exit 1
fi

echo "All images built successfully ✓"
docker images | grep -E "meesho|REPOSITORY"
```


═══════════════════════════════════════════════════════════════
PHASE 7 — Start containers
═══════════════════════════════════════════════════════════════

```bash
cd /opt/meesho-commerce-os

docker compose up -d

echo "Waiting 15 seconds for services to initialise…"
sleep 15

echo "── Container status ──"
docker compose ps

# All containers must be running (not Exited or Restarting)
UNHEALTHY=$(docker compose ps --format json 2>/dev/null | python3 -c "
import json, sys
data = sys.stdin.read()
# Handle both array and line-by-line JSON
try:
    rows = json.loads(data)
except:
    rows = [json.loads(l) for l in data.strip().splitlines() if l.strip()]
bad = [r.get('Name','?') for r in rows if 'running' not in r.get('State','').lower()]
print('\n'.join(bad))
" 2>/dev/null || true)

if [ -n "$UNHEALTHY" ]; then
  echo "ERROR: These containers are not running:"
  echo "$UNHEALTHY"
  echo ""
  echo "Fetching logs for failing containers…"
  for c in $UNHEALTHY; do
    echo "── Logs: $c ──"
    docker logs "$c" --tail=40 2>&1
  done
  exit 1
fi

echo "All containers running ✓"
```


═══════════════════════════════════════════════════════════════
PHASE 8 — Database initialisation
═══════════════════════════════════════════════════════════════

```bash
cd /opt/meesho-commerce-os

echo "Waiting for PostgreSQL to be ready…"
for i in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U meesho -d meesho_engine \
    >/dev/null 2>&1 && echo "PostgreSQL ready ✓" && break
  echo "  Waiting ($i/30)…"
  sleep 2
done

# Schema runs automatically via docker-entrypoint-initdb.d on first start
# Run it explicitly here too (idempotent — uses IF NOT EXISTS everywhere)
echo "Running schema migration (idempotent)…"
docker compose exec -T postgres \
  psql -U meesho -d meesho_engine \
  -f /docker-entrypoint-initdb.d/01_schema.sql 2>&1 | tail -20

echo "── Verifying tables ──"
docker compose exec -T postgres \
  psql -U meesho -d meesho_engine \
  -c "SELECT tablename FROM pg_tables WHERE schemaname='engine' ORDER BY tablename;" \
  2>&1

echo "── Verifying superadmin seed ──"
docker compose exec -T postgres \
  psql -U meesho -d meesho_engine \
  -c "SELECT email, role, is_active, created_at FROM engine.admin_users;" \
  2>&1
```

Expected: one row — `admin@agencyfic.com | super_admin | t | <timestamp>`


═══════════════════════════════════════════════════════════════
PHASE 9 — Verify engine health
═══════════════════════════════════════════════════════════════

```bash
echo "Waiting for engine to be responsive…"
for i in $(seq 1 30); do
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:13001/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "Engine is healthy (HTTP 200) ✓"
    break
  fi
  echo "  HTTP $STATUS — waiting ($i/30)…"
  sleep 2
done

[ "$STATUS" = "200" ] || {
  echo "ERROR: Engine not responding after 60s"
  echo "── Engine logs ──"
  docker compose logs engine --tail=60
  exit 1
}

echo "── Test superadmin login ──"
LOGIN_RESP=$(curl -sf -X POST http://localhost:13001/admin/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agencyfic.com","password":"Admin@123"}' 2>/dev/null)

echo "$LOGIN_RESP" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESP"

echo "$LOGIN_RESP" | grep -q "accessToken\|step\|requiresTwoFactor" \
  && echo "Login test PASSED ✓" \
  || { echo "ERROR: Login test failed — check engine logs"; docker compose logs engine --tail=30; exit 1; }
```


═══════════════════════════════════════════════════════════════
PHASE 10 — Nginx configuration & reload
═══════════════════════════════════════════════════════════════

```bash
cd /opt/meesho-commerce-os

echo "── Testing nginx config ──"
# NOTE: nginx/sites-available/site-template.conf is comments-only and safe to include.
# To activate a new store, copy its block into a new DOMAIN.conf file (see that file for instructions).
docker compose exec -T nginx nginx -t 2>&1

echo "── Reloading nginx ──"
docker compose exec -T nginx nginx -s reload

echo "── Test HTTPS response ──"
sleep 2
HTTP_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" https://meesho.agencyfic.com/ 2>/dev/null || echo "000")
echo "https://meesho.agencyfic.com/ → HTTP $HTTP_STATUS"

[ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "302" ] || [ "$HTTP_STATUS" = "301" ] \
  && echo "Nginx routing to admin UI ✓" \
  || echo "WARNING: Unexpected HTTP status. Check DNS propagation or SSL cert."
```


═══════════════════════════════════════════════════════════════
PHASE 11 — Final health summary
═══════════════════════════════════════════════════════════════

```bash
cd /opt/meesho-commerce-os

echo ""
echo "════════════════════════════════════════"
echo "  MEESHO COMMERCE OS — Install Summary"
echo "════════════════════════════════════════"
echo ""
echo "── Container status ──"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "── Engine health ──"
curl -sf http://localhost:13001/health | python3 -m json.tool 2>/dev/null || echo "Not responding"
echo ""
echo "── Admin UI ──"
curl -sf -o /dev/null -w "HTTP %{http_code}" http://localhost:13000/ 2>/dev/null || echo "Not responding"
echo ""
echo "── DB tables (engine schema) ──"
docker compose exec -T postgres \
  psql -U meesho -d meesho_engine \
  -c "SELECT COUNT(*) AS table_count FROM pg_tables WHERE schemaname='engine';" 2>/dev/null
echo ""
echo "════════════════════════════════════════"
echo "  INSTALL COMPLETE"
echo "════════════════════════════════════════"
echo ""
echo "  Superadmin panel : https://meesho.agencyfic.com"
echo "  Login email      : admin@agencyfic.com"
echo "  Login password   : Admin@123"
echo ""
echo "  IMPORTANT — Do these immediately after logging in:"
echo "  1. Settings → Superadmin → change your email & password"
echo "  2. Settings → Security → enable Email OTP if desired"
echo "  3. Sites → add your stores → set each store's admin credentials"
echo "  4. For each store, copy nginx/sites-available/site-template.conf"
echo "     to nginx/sites-available/STORENAME.conf, replace SITEDOMAIN &"
echo "     SITESLUG, get SSL cert, then reload nginx."
echo ""
echo "  Store admin URL pattern: https://storename.com/admin"
echo ""
```


═══════════════════════════════════════════════════════════════
TROUBLESHOOTING REFERENCE
═══════════════════════════════════════════════════════════════

If any phase fails, run the relevant command below:

Engine logs (use service names with docker compose):
  docker compose logs engine --tail=80

TypeScript compile error inside engine:
  docker compose exec engine sh -c "cd /app && node dist/app.js 2>&1 | tail -40"

PostgreSQL logs:
  docker compose logs postgres --tail=40

Nginx config test:
  docker compose exec nginx nginx -t

Nginx reload:
  docker compose exec nginx nginx -s reload

Redis check:
  docker compose exec redis redis-cli ping

Restart a single service without touching others:
  docker compose restart engine

Note: service names = engine, postgres, redis, admin-ui, nginx
      container names = meesho_engine, meesho_postgres, meesho_redis, meesho_admin_ui, meesho_nginx
      Use service names with `docker compose` commands, container names with `docker` commands.

Full reset (containers only — data volumes are preserved):
  docker compose down && docker compose up -d

Check .env values are correct:
  grep -E "^(DATABASE_URL|REDIS_URL|ENGINE_SECRET|SUPERADMIN_DOMAIN)" /opt/meesho-commerce-os/.env
