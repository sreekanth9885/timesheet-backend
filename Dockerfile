# ============================================
# Node.js Production Image
# ============================================
FROM node:22-alpine

WORKDIR /app

# Install wget for Docker healthcheck
RUN apk add --no-cache wget tini

# Copy dependency manifests first
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create directories used by the application
RUN mkdir -p /app/uploads /app/logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Graceful shutdown handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the actual JavaScript application
CMD ["node", "server.js"]