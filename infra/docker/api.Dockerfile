FROM node:26.8.2-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.3.4
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @deck-drive/game-engine build && pnpm --filter @deck-drive/api build

FROM node:26.8.2-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
RUN npm install --global pnpm@12.3.4
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
