# Linux image for the Ubuntu intranet deployment.
#
# Build on a machine that can reach npm/PyPI/PyTorch (the Windows dev box);
# the resulting image runs with no network access at all. Windows-only build
# artifacts (node_modules, .venv, dist) are excluded by .dockerignore and are
# rebuilt here for Linux.
#
# Build context must contain:
#   offline/docling-models/
#   offline/tiktoken-cache/
#   offline/gte-multilingual-base/
# copied from D:\synthetix-offline.

# ---------- 1. Build the Next.js standalone bundle ----------
FROM node:24-bookworm AS builder
WORKDIR /app
# Build machine is behind a slow international link; npmmirror keeps pnpm from
# timing out (Docker Hub itself is handled by registry-mirrors in daemon.json).
# pnpm 11 ignores npm_config_registry, so the registry is passed explicitly.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@11.15.0 --registry=https://mirrors.cloud.tencent.com/npm/
# A global rc so every pnpm invocation (including the implicit install that
# `pnpm build` triggers via verify-deps-before-run) uses the mirror, and so the
# hoisted linker does not look like a deps mismatch.
RUN printf 'registry=https://mirrors.cloud.tencent.com/npm/\nnode-linker=hoisted\nverify-deps-before-run=false\nfetch-retries=5\nfetch-retry-mintimeout=10000\nfetch-retry-maxtimeout=120000\nfetch-timeout=300000\n' > /root/.npmrc
# Prisma's postinstall fetches engines from binaries.prisma.sh, which is
# unreachable here; npmmirror carries the same all_commits/ layout.
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Hoisted linker: the standalone output then contains a real node_modules tree
# instead of pnpm's .pnpm symlink store.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --config.node-linker=hoisted \
      --registry=https://mirrors.cloud.tencent.com/npm/
COPY . .
# token-core throws at import time when these are missing; build-time only.
ENV JWT_SECRET=build-only ENCRYPTION_KEY=build-only
# Called directly instead of `pnpm build`: pnpm re-runs its dependency status
# check before scripts, which spawns a full install and re-triggers postinstalls.
RUN npx prisma generate \
 && node scripts/generate-app-metadata.mjs \
 && node node_modules/next/dist/bin/next build

# ---------- 2. Runtime ----------
FROM python:3.14-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node
WORKDIR /app

# Python worker dependencies. The CPU torch build avoids pulling ~2GB of CUDA
# wheels into the image; requirements.txt then leaves that torch satisfied.
# Torch and torchvision are pinned to matching +cpu builds so neither the
# extra index nor torchvision's exact-version pin can drag in the CUDA build
# (hundreds of MB of wheels that are useless here).
COPY workers/python/requirements.txt ./workers/python/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --index-url https://download.pytorch.org/whl/cpu \
      --extra-index-url https://mirrors.cloud.tencent.com/pypi/simple \
      --timeout 120 --retries 10 \
      torch==2.14.1+cpu torchvision==0.29.1+cpu \
 && pip install --index-url https://mirrors.cloud.tencent.com/pypi/simple \
      --timeout 120 --retries 10 \
      -r workers/python/requirements.txt

# Offline Docling/RapidOCR artifacts, tiktoken cache and the GTE embedding
# model. Keep these ABOVE the app COPY so a code change does not invalidate
# this ~1.3GB layer.
COPY offline/docling-models /opt/synthetix/docling
COPY offline/tiktoken-cache  /opt/synthetix/tiktoken
COPY offline/gte-multilingual-base ./models/gte-multilingual-base

# Next.js standalone output (server.js + traced node_modules) and the assets it
# does not include (static chunks, public/, Python workers, prisma migrations).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/prisma ./prisma
COPY deploy/docker-entrypoint.mjs ./docker-entrypoint.mjs

ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    COOKIE_SECURE=false HF_HUB_OFFLINE=1 \
    DB_PATH=/data DATABASE_URL=file:/data/dev.db \
    DATA_DIR=/data DOCUMENT_ROOT=/data/documents \
    RAG_ROOT=/data/rag RAG_LOCK_ROOT=/data/locks/rag \
    DOCLING_ARTIFACTS_PATH=/opt/synthetix/docling \
    TIKTOKEN_CACHE_DIR=/opt/synthetix/tiktoken \
    LOCAL_EMBED_MODEL_PATH=/app/models/gte-multilingual-base \
    PYTHON_PATH=/usr/local/bin/python PYTHON_DAEMON_ENABLED=true

EXPOSE 3000
CMD ["node", "docker-entrypoint.mjs"]
