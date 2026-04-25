# Agent Foundry — Bun + Hono API + static dashboard
# Single container; no build step needed (Bun runs TS directly).

FROM oven/bun:1.3.4-alpine AS base
WORKDIR /app

# install deps first (better layer caching)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# app code
COPY apps ./apps
COPY scripts ./scripts
COPY tools ./tools
COPY SKILL.md ./
COPY tsconfig.json ./

# data dir is mounted from a Fly volume in production; keep a placeholder so
# bun --env-file=.env can run locally before any registrations
RUN mkdir -p /app/data && echo "[]" > /app/data/agents.json && echo "{}" > /app/data/forges.json

EXPOSE 3000
ENV PORT=3000

# bun reads env from process.env (Fly secrets); no .env file in production
CMD ["bun", "run", "apps/api/index.ts"]
