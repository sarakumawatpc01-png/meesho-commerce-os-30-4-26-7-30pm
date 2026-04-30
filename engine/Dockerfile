# ── Build stage ───────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native build tools required for sharp, bcryptjs, etc.
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

COPY package*.json ./
# Install ALL deps (including devDeps for tsc)
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production stage ──────────────────────────────────────────
FROM node:20-alpine AS production

# Runtime libs for sharp + utilities
RUN apk add --no-cache dumb-init curl vips

WORKDIR /app

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Runtime directories
RUN mkdir -p /app/sites /app/logs /app/uploads

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD wget -qO- http://localhost:3001/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/app.js"]
