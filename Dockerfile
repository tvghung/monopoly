# syntax=docker/dockerfile:1

# ---- Build stage: install all workspace deps and build the client ----
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# Copy manifests first for better layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
RUN pnpm install --frozen-lockfile

# Copy the rest of the sources and build the client bundle.
COPY . .
RUN pnpm --filter @monopoly/client build

# ---- Runtime stage: migrate, then run the server that serves the built client ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# Bring over installed deps, the built client, server + shared sources.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/client/package.json ./apps/client/package.json
COPY --from=build /app/apps/client/dist ./apps/client/dist

EXPOSE 8080
CMD ["pnpm", "start"]
