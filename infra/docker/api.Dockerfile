FROM --platform=$BUILDPLATFORM node:26.8.2-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.3.4
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @deck-drive/game-engine build && pnpm --filter @deck-drive/api build

FROM node:26.8.2-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@12.3.4
COPY . .
RUN pnpm install --frozen-lockfile
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/packages/logger/dist /app/packages/logger/dist
COPY --from=build /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build /app/packages/card-definitions/dist /app/packages/card-definitions/dist
COPY --from=build /app/packages/game-engine/dist /app/packages/game-engine/dist
COPY --from=build /app/packages/pack-engine/dist /app/packages/pack-engine/dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
