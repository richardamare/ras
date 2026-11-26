FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY . .
ARG APP_COMMIT=dev
RUN bun install --frozen-lockfile --ignore-scripts \
  && VITE_ENVIRONMENT=production APP_COMMIT=$APP_COMMIT bun run --cwd apps/web build \
  && rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && bun install --frozen-lockfile --ignore-scripts --production

FROM litestream/litestream:0.5.18 AS litestream

FROM oven/bun:1.4.4
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
  && rm -rf /var/lib/apt/lists/* \
  && echo "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl" > /etc/ssh/ssh_known_hosts \
  && install -d -o bun -g bun /var/lib/ras
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=build /app /app
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/entrypoint.sh /usr/local/bin/ras-entrypoint
USER bun
ENV RAS_PORT=8080 \
  RAS_DATABASE=/var/lib/ras/ras.db \
  RAS_MEMORY_PATH=/var/lib/ras/memory
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/ras-entrypoint"]
