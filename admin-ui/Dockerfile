# ── Build stage ───────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build Next.js in standalone mode
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Production stage ──────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init curl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# Copy standalone Next.js output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
