# syntax=docker/dockerfile:1
#
# Self-host image for the Astra Agents platform (Initiative 2, P1).
#
# Design notes:
#   * Multi-stage: a `builder` (full deps, runs the esbuild+vite build) and a
#     separate `deps` stage (production-only node_modules) keep the final
#     runtime image lean without a build toolchain.
#   * The build (`script/build.ts`) bundles the allowlisted server deps into
#     dist/index.cjs and leaves every other dependency EXTERNAL, so the runtime
#     image still needs a node_modules tree — supplied by the `deps` stage.
#   * glibc base (bookworm-slim, NOT alpine/musl): the only native deps — ssh2
#     and the transitive @napi-rs/canvas — ship prebuilt linux-x64-gnu binaries
#     fetched automatically by `npm ci` on Linux, so no gcc/python is needed.
#   * server/vite.ts is only reached via a dev-branch dynamic import; in
#     production the server uses serveStatic(dist/public), so the dev-only
#     `vite` dependency is safely absent from the production node_modules.

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- Stage 1: build client + server bundle -------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
# Install ALL deps (build needs vite/esbuild/tailwind/tsx, which are devDeps).
COPY package.json package-lock.json ./
RUN npm ci
# Copy the rest of the source and produce dist/ (client → dist/public,
# server → dist/index.cjs).
COPY . .
RUN npm run build

# ---- Stage 2: production-only dependencies -------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Lean tree: no devDependencies. All runtime externals are real `dependencies`.
RUN npm ci --omit=dev

# ---- Stage 3: runtime ----------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5000
# Production dependencies + the built app only — no source, no devDeps.
# `--chown` sets ownership as the layers are written, avoiding a slow, image-
# bloating `RUN chown -R` over the whole node_modules tree.
COPY --chown=node:node --from=deps    /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist         ./dist
COPY --chown=node:node package.json ./

# Run as the unprivileged `node` user that the base image already provides.
USER node

EXPOSE 5000

# Liveness probe against the unauthenticated GET /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.cjs"]
