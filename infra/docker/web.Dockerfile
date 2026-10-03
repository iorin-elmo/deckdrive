FROM --platform=$BUILDPLATFORM node:26.8.2-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.3.4
COPY . .
RUN pnpm install --frozen-lockfile
ENV VITE_API_URL= VITE_ADMIN_URL=/admin/ VITE_ADMIN_BASE=/admin/
RUN pnpm --filter @deck-drive/card-definitions build && \
    pnpm --filter @deck-drive/ui build && \
    pnpm --filter @deck-drive/web build && \
    pnpm --filter @deck-drive/admin build

FROM nginx:stable-alpine
COPY infra/docker/web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html/admin
EXPOSE 8080
