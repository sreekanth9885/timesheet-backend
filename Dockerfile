# ============================================
# Stage 1: Build
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies (needed for native modules like bcrypt)
RUN apk add --no-cache python3 make g++

# Copy dependency manifests first (Docker layer caching)
COPY package.json package-lock.json* ./

# Deterministic install — respects package-lock.json exactly
RUN npm ci

# Copy source and build
COPY . .

# Build TypeScript → dist/
RUN npm run build

# Prune dev dependencies for the final image
RUN npm prune --production


# ============================================
# Stage 2: Runtime
# ============================================
FROM node:22-alpine AS runner

WORKDIR /app

# Install only runtime deps needed (wget for healthcheck, tini for signal handling)
RUN apk add --no-cache wget tini

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy built artifacts & production node_modules from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

# Copy uploads directory stub (will be volume-mounted at runtime)
RUN mkdir -p /app/uploads /app/logs && \
    chown -R nodejs:nodejs /app/uploads /app/logs

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# tini handles SIGTERM correctly so Docker restarts are graceful
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "dist/server.js"]