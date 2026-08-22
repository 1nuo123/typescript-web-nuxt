# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base

ARG NPM_REGISTRY=https://registry.npmjs.org

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_NPM_REGISTRY=${NPM_REGISTRY} \
    npm_config_registry=${NPM_REGISTRY} \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.11.1 --activate


FROM base AS deps

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile


FROM base AS builder

ARG NODE_BUILD_MAX_OLD_SPACE_SIZE=""

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

RUN if [ -n "$NODE_BUILD_MAX_OLD_SPACE_SIZE" ]; then \
      export NODE_OPTIONS="--max-old-space-size=$NODE_BUILD_MAX_OLD_SPACE_SIZE"; \
    fi; \
    pnpm build


FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000

WORKDIR /app

RUN addgroup -S app && adduser -S -G app app

COPY --chown=app:app --from=builder /app/.output ./.output

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
