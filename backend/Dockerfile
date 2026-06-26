# cards402-backend — hardened multi-stage build.
# Plain CommonJS Node (no transpile). better-sqlite3 native module.
# Built ON the box from /opt/apps/cards402/backend.

# ---- builder ----
FROM node:20-bookworm-slim AS builder
# python3 + build-essential: only used if better-sqlite3 has no prebuilt for
# this platform. Discarded with the builder stage either way.
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src

# ---- runner ----
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=builder --chown=node:node /app /app
# SQLite data dir. Railway mounts volumes at runtime, so CMD chowns it before dropping to node.
RUN mkdir -p /data && chown node:node /data
EXPOSE 4000
CMD ["sh", "-c", "mkdir -p /data && chown -R node:node /data && su node -s /bin/sh -c 'node src/index.js'"]
