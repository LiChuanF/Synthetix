# Synthetix Docker 部署教程（Ubuntu 内网）

本文档对应仓库根目录的 `Dockerfile`、`.dockerignore`、`docker-compose.yml` 和 `deploy/` 目录。

目标环境：

- **构建机**：Windows 开发机，装有 Docker Desktop，能访问 Docker Hub / npm / PyPI / download.pytorch.org。
- **运行环境**：内网 Ubuntu 服务器，能运行 Docker 和 docker compose，**不需要联网**，也不需要安装 Node 或 Python。
- **浏览器访问**：`http://<服务器IP>/`（纯 HTTP，内网）。

---

## 0. 整体结构

```
Windows 开发机                              内网 Ubuntu 服务器
┌─────────────────────────┐                ┌──────────────────────────────┐
│ 源码 + offline/ 资产     │  docker save   │ docker load / docker pull     │
│ docker build            │ ─────────────► │ docker compose up -d          │
│ → synthetix-app:1.1.0   │  (或 registry) │   ├─ app 容器 (Node+Python)   │
└─────────────────────────┘                │   └─ nginx 容器 (:80)         │
                                           │         └─ /srv/synthetix/data│
                                           └──────────────────────────────┘
```

`app` 容器内部包含：

```
/app
├─ server.js                  Next.js standalone 入口
├─ .next/                     构建产物
├─ node_modules/              Linux 版生产依赖（含 better-sqlite3）
├─ workers/python/            Docling / LightRAG / ONNX 脚本
├─ prisma/migrations/         数据库迁移
├─ models/gte-multilingual-base/   本地分块用的 ONNX 模型
├─ docker-entrypoint.mjs      启动前跑 migration，然后启动 server
└─ runtime 不是独立的，Node 是 /usr/local/bin/node，Python 是 /usr/local/bin/python

/opt/synthetix
├─ docling/                   Docling 布局 + TableFormer + RapidOCR 模型
└─ tiktoken/                  cl100k_base + o200k_base BPE 缓存

/data                         挂载自宿主机 /srv/synthetix/data
├─ dev.db                     SQLite 数据库
├─ documents/                 上传的原始文档
├─ rag/                       LightRAG 索引
├─ locks/
└─ tmp/
```

---

## 1. 前置条件

### 1.1 开发机

- Docker Desktop 已安装并**正在运行**（托盘图标为绿色）。
- 磁盘至少留出 15GB（镜像约 4GB + 构建缓存）。
- 能访问：
  - Docker Hub（拉取 `node:24-bookworm`、`python:3.14-slim`、`nginx:1.27-alpine`）
  - npm registry（`pnpm install`）
  - PyPI（`pip install`）
  - `download.pytorch.org`（CPU 版 torch）
- 如果 Docker Hub 不通，先在 Docker Desktop 设置里配置镜像加速器，或从其他机器 `docker save` 这三个基础镜像再导入。

### 1.2 服务器

- 已安装 Docker Engine 和 `docker compose` 插件（`docker compose version` 可用）。
- 80 端口空闲（如果已有 nginx 容器占用，见 §9.4）。
- 准备数据目录：

```bash
sudo mkdir -p /srv/synthetix/data /srv/synthetix/registry
sudo chmod 755 /srv/synthetix
```

---

## 2. 准备 `offline/` 资产（只做一次）

镜像里要带 Docling 模型、tiktoken 缓存和 GTE 向量模型，它们来自之前准备的离线包 `D:\synthetix-offline`。

**PowerShell（开发机）：**

```powershell
New-Item -ItemType Directory -Force D:\Project\Synthetix\offline | Out-Null

Copy-Item -Recurse D:\synthetix-offline\docling-models        D:\Project\Synthetix\offline\
Copy-Item -Recurse D:\synthetix-offline\tiktoken-cache        D:\Project\Synthetix\offline\
Copy-Item -Recurse D:\synthetix-offline\gte-multilingual-base D:\Project\Synthetix\offline\
```

检查（这三个目录必须都存在）：

```powershell
Get-ChildItem D:\Project\Synthetix\offline
Test-Path D:\Project\Synthetix\offline\docling-models
Test-Path D:\Project\Synthetix\offline\tiktoken-cache
Test-Path D:\Project\Synthetix\offline\gte-multilingual-base
```

`offline/` 已加入 `.gitignore`，不会提交到仓库。约 900MB。

> 注意：不要用目录联接（`mklink /J`）指向 `D:\synthetix-offline`，Docker 构建上下文对 junction 的处理不可靠，请用 `Copy-Item -Recurse` 实际复制。

---

## 3. 构建镜像

在项目根目录（`D:\Project\Synthetix`）执行：

```powershell
docker build -t synthetix-app:1.1.0 .
```

首次构建约 10–30 分钟，取决于网速。它会依次：

1. 拉取 `node:24-bookworm`，`pnpm install`，`prisma generate`，`next build`；
2. 拉取 `python:3.14-slim`，安装 CPU 版 torch 和 `workers/python/requirements.txt`；
3. 复制 Docling / tiktoken / GTE 资产；
4. 复制 standalone 产物、`public/`、`workers/`、`prisma/`。

常见失败：

| 报错 | 原因 / 处理 |
|---|---|
| `failed to compute cache key: "/offline/..." not found` | §2 没做 |
| 拉取基础镜像超时 | Docker Hub 不通，配置加速器或导入镜像 |
| `pip install torch` 连接 `download.pytorch.org` 失败 | 删除 Dockerfile 里那条 CPU torch 命令，直接用 PyPI（镜像会大 2GB 左右） |
| `better-sqlite3` 编译失败 | 构建阶段已使用完整版 node 镜像（含 g++/make/python3），若仍失败检查网络是否能下载 prebuild |

构建成功后确认：

```powershell
docker images synthetix-app
# REPOSITORY       TAG     IMAGE ID       CREATED        SIZE
# synthetix-app    1.1.0   xxxxxxxxxxxx   2 minutes ago  ~4GB
```

### 改代码后重新构建

直接再执行一次 `docker build -t synthetix-app:1.1.1 .`。系统层、Python 依赖层、模型层会命中缓存，只重跑 `next build` 和最后的代码 COPY，通常 1–3 分钟。

---

## 4. 把镜像送到服务器

### 方式 A：`docker save` / `docker load`（简单，但每次全量约 4GB）

开发机：

```powershell
docker save synthetix-app:1.1.0 -o synthetix-app-1.1.0.tar
# 4GB 左右，建议先压缩
# 没有 gzip 的话直接传 tar；有 7-Zip 可以压缩成 .tar.gz 再传
```

服务器：

```bash
docker load -i synthetix-app-1.1.0.tar
docker images synthetix-app
```

### 方式 B：内网 registry（推荐，更新只传变化的层）

一次性准备（开发机拉取 registry 镜像并带过去）：

```powershell
docker pull registry:2
docker save registry:2 -o registry2.tar
```

服务器：

```bash
docker load -i registry2.tar
cd /path/to/project   # 有 docker-compose.yml 的目录
docker compose --profile registry up -d registry
curl http://127.0.0.1:5000/v2/_catalog   # 应返回 JSON
```

开发机 Docker Desktop → Settings → Docker Engine，加入（把 IP 换成服务器地址）：

```json
{
  "insecure-registries": ["192.168.1.20:5000"]
}
```

保存并重启 Docker Desktop。然后每次更新：

```powershell
docker build -t 192.168.1.20:5000/synthetix-app:1.1.1 .
docker push 192.168.1.20:5000/synthetix-app:1.1.1
```

> push 只会传输变化层（通常 100–300MB）。首次 push 仍是全量。

---

## 5. 服务器首次部署

把仓库里的这些文件放到服务器上同一目录，例如 `/srv/synthetix/`：

```
docker-compose.yml
deploy/nginx.conf
deploy/synthetix.env.example
```

然后：

```bash
cd /srv/synthetix

# 1) 生成密钥
cp deploy/synthetix.env.example deploy/synthetix.env
# 用随机值替换两个占位符，例如：
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 分别生成两个不同的值填进去

# 2) 启动
SYNTHETIX_VERSION=1.1.0 docker compose up -d --no-build

# 3) 观察状态
docker compose ps
docker compose logs -f app
```

`app` 的 healthcheck 通过后 nginx 才会启动（`depends_on.condition: service_healthy`）。启动日志里应看到：

```
[migrate] applied 20261020131042_...
[migrate] database ready at /data/dev.db (N applied)
▲ Next.js 16.2.4
- Local: http://0.0.0.0:3000
```

浏览器打开 `http://<服务器IP>/`，按页面提示创建第一个管理员账号。

### 首次启动后配置模型

模型配置保存在**数据库**里，不是环境变量。登录后进入 **模型管理**，添加：

- Chat 模型（如 `deepseek-flash`，API 地址必须在内网可达）
- Embedding 模型（语义检索/RAG 必需，维度 ≥1536 才能用图谱模式）

---

## 6. 日常更新

### 6.1 使用 registry（推荐）

开发机：

```powershell
docker build -t 192.168.1.20:5000/synthetix-app:1.1.1 .
docker push 192.168.1.20:5000/synthetix-app:1.1.1
```

服务器：

```bash
cd /srv/synthetix
SYNTHETIX_IMAGE=192.168.1.20:5000/synthetix-app \
SYNTHETIX_VERSION=1.1.1 \
  docker compose pull app

SYNTHETIX_IMAGE=192.168.1.20:5000/synthetix-app \
SYNTHETIX_VERSION=1.1.1 \
  docker compose up -d --no-build
```

数据库迁移在容器启动时自动执行（`docker-entrypoint.mjs`），无需手工操作。

### 6.2 使用 tar

```powershell
docker save synthetix-app:1.1.1 -o synthetix-app-1.1.1.tar
```

```bash
docker load -i synthetix-app-1.1.1.tar
cd /srv/synthetix
SYNTHETIX_VERSION=1.1.1 docker compose up -d --no-build
```

### 6.3 回滚

镜像还在本地就直接切回旧 tag：

```bash
SYNTHETIX_VERSION=1.1.0 docker compose up -d --no-build
```

> 数据库迁移只向前、不回滚。如果新版本加了迁移，回滚镜像后数据库仍是新结构（通常兼容，但请知悉）。

---

## 7. 数据与备份

所有持久数据都在宿主机 `/srv/synthetix/data`：

| 路径 | 内容 |
|---|---|
| `dev.db` | SQLite：用户、模型配置、文档记录、思路梳理、知识库 |
| `documents/` | 上传的原始文档 |
| `rag/` | LightRAG 图谱与向量索引 |
| `locks/` | RAG 互斥锁 |
| `tmp/` | 转换临时文件 |

备份：

```bash
# 推荐先停容器再打包，保证 SQLite 一致
docker compose stop app
tar -czf /srv/synthetix/backup-$(date +%F).tar.gz -C /srv synthetix/data
docker compose start app
```

**重建容器、更新镜像都不会丢数据**，因为 `/data` 是宿主机目录挂载。但不要删除 `/srv/synthetix/data`。

---

## 8. 配置项说明

`deploy/synthetix.env`（由 compose 注入，优先于镜像内默认值）：

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | JWT 签名密钥，**必须固定**，否则所有人登录失效 |
| `ENCRYPTION_KEY` | 模型 API Key 等敏感字段的加密密钥，**必须固定**，否则已存密钥无法解密 |

`docker-compose.yml` 中已固定：

| 变量 | 值 | 说明 |
|---|---|---|
| `COOKIE_SECURE` | `false` | 纯 HTTP 必须关闭，否则浏览器拒收登录 Cookie |
| `DB_PATH` / `DATABASE_URL` | `/data` / `file:/data/dev.db` | SQLite 位置 |
| `DOCLING_ARTIFACTS_PATH` | `/opt/synthetix/docling` | Docling 模型 |
| `TIKTOKEN_CACHE_DIR` | `/opt/synthetix/tiktoken` | tiktoken 缓存 |
| `LOCAL_EMBED_MODEL_PATH` | `/app/models/gte-multilingual-base` | 分块用 ONNX 模型 |
| `HF_HUB_OFFLINE` | `1` | 杜绝 HuggingFace 联网尝试 |

---

## 9. 常见问题

### 9.1 `env file ... not found`

没有创建 `deploy/synthetix.env`：

```bash
cp deploy/synthetix.env.example deploy/synthetix.env
```

### 9.2 登录成功后仍然跳回登录页

检查 `COOKIE_SECURE` 是否为 `false`。如果是通过 HTTPS 访问，则应设为 `true`（或不设置）。

### 9.3 上传文档返回 413 / 504

- 413：nginx 的 `client_max_body_size` 太小，检查 `deploy/nginx.conf` 是否为 `200m`。
- 504：大文档转换超时，检查 `proxy_read_timeout` 是否为 `3600s`。

### 9.4 80 端口被现有 nginx 容器占用

二选一：

1. 修改 `docker-compose.yml` 中 nginx 的端口映射，例如 `"8080:80"`，访问 `http://IP:8080/`。
2. 不用本 compose 的 nginx，把 `deploy/nginx.conf` 的 `location /` 合并进你现有的 nginx 配置，并确保两个容器在同一个 Docker network，`proxy_pass http://app:3000`。

### 9.5 `app` 一直 unhealthy

```bash
docker compose logs app
```

常见原因：

- `deploy/synthetix.env` 缺失或 `JWT_SECRET` 为空；
- 数据目录没有写权限（容器默认 root，一般不会）；
- 3000 端口被容器内其他进程占用（本镜像只跑一个 server，通常不会）。

### 9.6 提示缺少 Python 模块

说明镜像构建时 `pip install` 没完全成功。重新 build，观察构建日志中 `pip install -r workers/python/requirements.txt` 是否报错。

### 9.7 想确认镜像里到底有什么

```bash
docker run --rm synthetix-app:1.1.0 sh -c "ls /app && ls /opt/synthetix && /usr/local/bin/python --version"
```

### 9.8 更新后版本没变

`docker compose up -d` 默认可能复用旧容器。用 `--no-build` 并确认 `SYNTHETIX_VERSION` 指向新 tag：

```bash
docker compose ps
docker inspect synthetix-app:1.1.1 --format '{{.Id}}'
```

---

## 10. 文件清单

| 文件 | 说明 |
|---|---|
| `Dockerfile` | 两阶段构建：Node 构建 + Python 运行 |
| `.dockerignore` | 排除 Windows 产物、密钥、无关目录 |
| `docker-compose.yml` | app + nginx + 可选 registry |
| `deploy/nginx.conf` | 反向代理配置（上传大小、超时） |
| `deploy/docker-entrypoint.mjs` | 启动前应用数据库迁移 |
| `deploy/synthetix.env.example` | 密钥模板 |
| `offline/` | 模型与缓存（本地准备，不提交） |
