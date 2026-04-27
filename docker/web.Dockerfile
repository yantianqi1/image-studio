FROM node:20-bookworm-slim

ARG APP_NAME
ARG APP_PORT
ARG API_BASE_URL=http://api:7800

ENV API_BASE_URL=${API_BASE_URL} \
    APP_NAME=${APP_NAME} \
    APP_PORT=${APP_PORT} \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN corepack enable
RUN test -n "${APP_NAME}" && test -n "${APP_PORT}"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/public-web/package.json apps/public-web/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

COPY apps apps
COPY packages packages
RUN pnpm --filter "${APP_NAME}" build

ENV NODE_ENV=production

EXPOSE 7700 7701

CMD ["sh", "-c", "pnpm --filter \"${APP_NAME}\" start --hostname 0.0.0.0 --port \"${APP_PORT}\""]
