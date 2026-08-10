# syntax=docker/dockerfile:1.7

# Node 22 remains the accepted runtime major. This Debian/glibc image is pinned
# to the official multi-architecture OCI index published for 22.22.3.
FROM node:22.22.3-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752 AS builder

WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# The default-deny .dockerignore and these explicit copies are both required.
# In particular, .git, .env*, .frame-zero, .openai, public/photos, and local
# og.png never enter this build stage.
COPY next.config.ts tsconfig.json postcss.config.mjs ./
COPY app ./app
COPY db ./db
COPY types ./types
COPY scripts/build-next-node.mjs scripts/prepare-next-standalone.mjs ./scripts/
COPY config/production-public-files.json ./config/production-public-files.json
COPY public ./public

RUN npm run build

FROM node:22.22.3-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752 AS runtime

LABEL org.opencontainers.image.title="Frame Zero Portfolio Studio" \
      org.opencontainers.image.base.name="docker.io/library/node:22.22.3-bookworm-slim" \
      org.opencontainers.image.base.digest="sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752" \
      io.frame-zero.runtime="standard-next-standalone"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app
COPY --from=builder --chown=1000:1000 /workspace/.next/standalone ./

# The official Node Debian image defines uid/gid 1000 as its non-root node
# account. Numeric IDs keep the runtime contract explicit and inspectable.
USER 1000:1000
EXPOSE 3000
STOPSIGNAL SIGTERM
ENTRYPOINT []

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/ready',{cache:'no-store'}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
