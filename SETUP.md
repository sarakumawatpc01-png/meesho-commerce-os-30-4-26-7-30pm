# Meesho Commerce OS — Complete Setup Guide

## Overview
Multi-site kurti dropshipping platform. 10 branded stores, one engine.
Stack: Node.js 20 · TypeScript · PostgreSQL 16 · Redis 7 · Next.js 14 · Razorpay · WhatsApp API

---

## 1. Server Requirements
- VPS: Hetzner CX21 (2 vCPU, 4GB RAM) minimum — CX31 recommended
- OS: Ubuntu 22.04 LTS
- Domain: Each store needs an A record pointing to your server IP

---

## 2. First-Time Setup

```bash
# Install Docker & Docker Compose
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin -y

# Clone / upload project
git clone <your-repo> /opt/meesho-commerce-os
cd /opt/meesho-commerce-os

# Copy and fill environment variables
cp .env.example .env
nano .env   # Fill in ALL values before proceeding
```

---

## 3. Environment Variables (Critical)

Edit `.env` and fill:

| Variable | Where to get it |
|----------|----------------|
| `SUPER_ADMIN_EMAIL` | Your email |
| `SUPER_ADMIN_PASSWORD` | Strong password (min 12 chars) |
| `JWT_SECRET` | Generate: `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Generate: `openssl rand -hex 32` |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `WABA_PHONE_ID` | Meta Business → WhatsApp → Phone Number ID |
| `WABA_TOKEN` | Meta Business → System User permanent access token |
| `CLOUDFLARE_R2_*` | Cloudflare Dashboard → R2 |
| `RESEND_API_KEY` | https://resend.com |
| `SENTRY_DSN` | https://sentry.io (optional) |

---

## 4. Start the Platform

```bash
cd /opt/meesho-commerce-os

# Build and start all services
docker compose up -d --build

# Check all services are healthy
docker compose ps

# Watch logs
docker compose logs -f engine

# Database migrations run automatically on first start
# Super admin account is created automatically from .env values
```

---

## 5. Access Admin Panel

URL: `http://YOUR_SERVER_IP:3000`
Or after nginx setup: `https://admin.yourdomain.com`

Login with your `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`.

**Setup 2FA immediately:**
Admin → Settings → Security → Setup 2FA

---

## 6. Create Your First Site

1. Login to Admin → Sites → New Site
2. Fill: Name, Slug, Domain, Tagline, Primary Color
3. Go to Settings → Payments → Add Razorpay keys
4. Settings → WhatsApp → Add WhatsApp credentials
5. Products → Import from Meesho (paste Meesho product URL)

---

## 7. Deploy Frontend

1. Customize `site-template/index.html` for your brand (or leave defaults)
2. ZIP the site-template folder
3. Admin → Sites → [Your Site] → Deploy Frontend → Upload ZIP
4. The engine auto-injects your config, GTM, Meta Pixel, etc.

---

## 8. Configure Nginx (Production)

```bash
# Copy nginx config
cp nginx/nginx.conf /etc/nginx/nginx.conf

# For each site, copy template:
cp nginx/sites-available/site-template.conf /etc/nginx/sites-available/blackkurti.conf

# Edit the config — replace SITEDOMAIN and SITESLUG
nano /etc/nginx/sites-available/blackkurti.conf

# Enable the site
ln -s /etc/nginx/sites-available/blackkurti.conf /etc/nginx/sites-enabled/

# SSL with Let's Encrypt
apt install certbot python3-certbot-nginx -y
certbot --nginx -d blackkurti.com -d www.blackkurti.com

# Reload nginx
nginx -t && systemctl reload nginx
```

---

## 9. Add Meesho Accounts

1. Admin → Settings → Meesho Accounts → Add Account
2. Add 3-5 Meesho reseller accounts (different phone numbers)
3. Orders will be distributed round-robin across accounts
4. Each account gets ~50-100 orders/day (Meesho limit)

---

## 10. Automated Jobs Schedule

Jobs run automatically after deployment:

| Job | Schedule | Purpose |
|-----|----------|---------|
| Cart Recovery | Every 1h | WhatsApp to abandoned carts |
| COD Follow-up | Every 1h | Confirm stale COD orders |
| Order Sync | Every 2h | Update delivery statuses |
| Price Sync | Every 6h | Sync prices from Meesho |
| Trend Scout | Daily 10am | Find trending products |
| AI Optimizer | Daily 11pm | Optimize product content |
| SEO Audit | Daily 11pm | Fix meta tags, schema |
| Blog Writer | Tue 9am | Generate English + Hindi posts |
| Review Requests | Daily 9pm | Ask delivered customers for reviews |
| Reengagement | Daily 8pm | Win back 30-day inactive customers |
| Weekly Report | Monday 8am | Business intelligence summary |

---

## 11. WhatsApp Business API Setup

1. Create Meta Business account at business.facebook.com
2. Add WhatsApp Business product
3. Get a phone number (dedicated — not used personally)
4. Create a System User with admin permissions
5. Generate permanent access token
6. Add to Admin → Settings → WhatsApp
7. Test: Settings → WhatsApp → Send Test Message

---

## 12. Razorpay Setup

1. Create account at razorpay.com
2. Complete KYC (required for live payments)
3. Get Key ID and Key Secret from Settings → API Keys
4. Add Webhook Secret: Dashboard → Webhooks → Add Webhook
   - URL: `https://yourdomain.com/api/webhooks/razorpay`
   - Events: `payment.captured`, `payment.failed`, `refund.processed`
5. Add to Admin → Settings → [Your Site] → Payments

---

## 13. Google Shopping Feed

Auto-generated at: `https://yourstore.com/shopping-feed.xml`

1. Go to Google Merchant Center (merchants.google.com)
2. Add your store domain
3. Products → Feeds → Add Feed → Scheduled Fetch
4. URL: `https://yourstore.com/shopping-feed.xml`
5. Fetch frequency: Daily

---

## 14. Analytics Setup

For each site in Admin → Settings → SEO & Analytics:

- **Google Tag Manager**: Create container at tagmanager.google.com → Get GTM-XXXXXXX ID
- **Meta Pixel**: Business Manager → Events Manager → Pixels → Create
- **Hotjar**: Create site at hotjar.com → Get Site ID
- Server-side Meta CAPI: Business Manager → Events Manager → Settings → Generate token

---

## 15. Monitoring & Maintenance

```bash
# View engine logs
docker compose logs -f engine --tail=100

# Database backup
docker compose exec postgres pg_dump -U meesho meesho_commerce > backup_$(date +%Y%m%d).sql

# Restart a service
docker compose restart engine

# Update the platform
git pull
docker compose up -d --build engine admin-ui

# Check disk space
df -h
du -sh /var/lib/docker/volumes/
```

---

## 16. Security Checklist

- [ ] Changed default super admin password
- [ ] 2FA enabled on all admin accounts
- [ ] SSL certificates installed for all domains
- [ ] Nginx rate limiting active (check nginx.conf)
- [ ] Database only accessible from internal network
- [ ] Regular DB backups configured (cron)
- [ ] Sentry DSN added for error monitoring
- [ ] `.env` file not in git repository

---

## Support

For issues: Check logs with `docker compose logs engine -n 50`
AI Assistant: Admin → AI Assistant → "What errors are in my system?"
