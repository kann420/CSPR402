# CSPR402 web - Next.js app built from the monorepo root.

FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package*.json tsconfig.base.json ./
COPY web/package.json ./web/
COPY sdk/package.json ./sdk/
RUN npm ci --workspace=web --include-workspace-root

COPY skill.md ./skill.md
COPY scripts ./scripts
COPY web ./web
COPY sdk ./sdk
RUN npm --workspace=web run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production PORT=3000
WORKDIR /app/web
COPY --from=builder --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
