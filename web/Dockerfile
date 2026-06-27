# cspr402-web — Next.js 16, npm-workspaces monorepo (root manages `web` + `sdk`).
# Built from /opt/apps/cspr402 with --workspace=web so the ROOT lockfile resolves.

# ---- builder ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
# root + workspace manifests first (layer cache). tsconfig.base.json is
# referenced by web/tsconfig.json's `extends: "../tsconfig.base.json"`.
COPY package*.json tsconfig.base.json ./
COPY web/package.json ./web/
COPY sdk/package.json ./sdk/
RUN npm ci --workspace=web --include-workspace-root
# build-time helpers + web source
COPY scripts ./scripts
COPY web ./web
RUN npm --workspace=web run build && npm prune --omit=dev

# ---- runner ----
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production PORT=3000
WORKDIR /app/web
# whole /app — keeps workspace hoisting + symlinks intact
COPY --from=builder --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
