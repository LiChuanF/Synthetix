# 内网薄构建：每次改完代码，在服务器上执行。
#
#   docker build -t synthetix-app:1.1.1 .
#   SYNTHETIX_VERSION=1.1.1 docker compose up -d --no-build
#
# 全程不需要联网：FROM synthetix-omni 同时提供 Node、全部 npm 依赖、
# Python、Docling/tiktoken/GTE 模型和运行时环境。
# 只有 next build 和最后的产物 COPY 会执行，通常 1~3 分钟。

ARG BASE=synthetix-omni:1.1.0

# ---------- 1. 在单底座里编译 ----------
FROM ${BASE} AS builder
WORKDIR /app
COPY . .

# token-core 在 import 时就要求这两个变量；只用于构建，运行时会由
# deploy/synthetix.env 覆盖。CHECKPOINT_DISABLE 关闭 Prisma 的联网检查。
ENV NEXT_TELEMETRY_DISABLED=1 \
    JWT_SECRET=build-only \
    ENCRYPTION_KEY=build-only \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

# 直接调用 CLI，避免 npx / pnpm 在断网时尝试解析 registry。
# 重新 generate 可以保证 Prisma Client 的引擎是 Linux 版，并包含最新 schema。
RUN node node_modules/prisma/build/index.js generate \
 && node scripts/generate-app-metadata.mjs \
 && node node_modules/next/dist/bin/next build

# ---------- 2. 把产物叠加到同一个底座上 ----------
FROM ${BASE}

# 只清构建产物；保留底座里的 /app/node_modules 和 /app/models。
# 底座 node_modules 就是构建时用的那一份，删掉再拷 standalone 的裁剪版
# 只会让每个版本多背 1GB 多。
RUN rm -rf /app/.next /app/public /app/server.js

# Next 16 的 standalone 会把整个项目根目录都复制进去（含 offline/ 和
# models/，约 1.2GB），但这两份底座里已经有：模型在 /app/models，
# Docling/tiktoken 在 /opt/synthetix。用 tar 叠加时排除它们；
# node_modules 则合并覆盖（standalone 里有 Turbopack 的哈希别名包）。
RUN --mount=type=bind,from=builder,source=/app/.next/standalone,target=/standalone \
    tar -C /standalone --exclude=./models --exclude=./offline -cf - . \
  | tar -C /app -xf -

COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Python worker 脚本、数据库迁移和入口脚本跟着源码走；
# Python 依赖和模型仍来自底座。
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/deploy/docker-entrypoint.mjs ./docker-entrypoint.mjs

# ENV、EXPOSE、CMD 全部继承自底座，这里不重复声明。
