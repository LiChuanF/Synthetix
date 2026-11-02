# 内网薄构建：每次改完代码，在服务器上执行。
#
#   docker build -t synthetix-app:1.1.1 .
#   SYNTHETIX_VERSION=1.1.1 docker compose up -d --no-build
#
# 全程不需要联网：
#   - FROM synthetix-base 提供 Node + 全部 npm 依赖（含构建期依赖）
#   - FROM synthetix-app 提供 Python、Docling/tiktoken/GTE 模型和运行时环境
# 只有 next build 和最后的产物 COPY 会执行，通常 1~3 分钟。

ARG BASE=synthetix-base:1.1.0
ARG RUNTIME=synthetix-app:1.1.0

# ---------- 1. 在 Linux 构建底座里编译 ----------
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

# ---------- 2. 把产物叠加到运行时底座上 ----------
FROM ${RUNTIME}

# 先清掉旧版本的构建产物，避免旧文件残留（尤其是被删除的依赖）。
RUN rm -rf /app/.next /app/node_modules /app/public /app/server.js

# standalone 自带 server.js、.next 和裁剪后的生产 node_modules。
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Python worker 脚本和数据库迁移跟着源码走；Python 依赖和模型仍来自运行时底座。
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/prisma ./prisma

# ENV、EXPOSE、CMD 全部继承自运行时底座，这里不重复声明。
