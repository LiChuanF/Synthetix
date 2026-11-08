# Synthetix Docker 部署教程（内网离线）

本文档对应仓库根目录的 `Dockerfile`、`Dockerfile.omni`、`.dockerignore`、
`docker-compose.yml` 和 `deploy/` 目录。

目标环境：

- **外网构建机**：Windows 开发机，装有 Docker Desktop，能访问 Docker Hub / npm / PyPI / download.pytorch.org。
- **内网开发机**：Windows，有源码和 Node，**不能联网**，日常改代码在这里。
- **运行环境**：内网 Ubuntu 服务器，能运行 Docker 和 docker compose，**不需要联网**，也不需要安装 Node 或 Python。
- **浏览器访问**：`http://<服务器IP>:3000/`（纯 HTTP，内网）。
- **嵌入方式**：主项目 Vue3 页面用 iframe 嵌入，iframe 地址必须与主页面同 host（见 §2.7）。

---

## 0. 先理解：镜像为什么分成两层

镜像 = **已经编译好的代码 + 依赖**。你在 Win 上改源码，容器里的代码不会变，
因为容器跑的是镜像里的 `.next`，不是你的源码。所以改完代码必须重新编译。

难点在于：内网不能联网，`pnpm install` / `pip install` / `next build` 都不能在线装依赖。
解决办法是**把“依赖环境”和“代码”拆开**：

| 镜像 | 在哪里构建 | 里面有什么 | 什么时候需要重建 |
|---|---|---|---|
| `synthetix-omni:1.1.0` | 外网，`Dockerfile.omni` | Node + 全部 npm 依赖 + Python + Docling/tiktoken/GTE 模型 | `package.json` / `pnpm-lock.yaml`、Python 依赖、模型、Node/Python 大版本变化时 |
| `synthetix-app:1.1.x` | **内网，`Dockerfile`** | 只有新编译出来的 `.next` 和源码 | **每次改完业务代码** |

内网的薄构建（`Dockerfile`）只做三件事：

```
FROM synthetix-omni:1.1.0     ← 拿到 Node、全部 npm 依赖、Python、模型
COPY 源码
next build                     ← 唯一需要执行的编译
COPY 新编译的 .next / public / workers / prisma
```

所以内网构建**不需要联网，也不需要重新装依赖**，通常 1~3 分钟。

> 为什么不能把 Windows 上编译好的 `.next` 直接挂进 Linux 容器？
> 实测会 500：Turbopack 会为 Prisma 等外部包生成哈希别名
> （`@prisma/client-254bee1428372f77/runtime/client`），Windows 编译产物和
> 容器里的 Linux `node_modules` 对不上。**构建产物必须和构建它的 Linux 依赖环境在一起。**

---

## 1. 外网一次性准备

### 1.1 准备 `offline/` 资产

底座里的 Docling 模型、tiktoken 缓存和 GTE 向量模型来自
`D:\synthetix-offline`：

```powershell
New-Item -ItemType Directory -Force D:\Project\Synthetix\offline | Out-Null

Copy-Item -Recurse D:\synthetix-offline\docling-models        D:\Project\Synthetix\offline\
Copy-Item -Recurse D:\synthetix-offline\tiktoken-cache        D:\Project\Synthetix\offline\
Copy-Item -Recurse D:\synthetix-offline\gte-multilingual-base D:\Project\Synthetix\offline\
```

`offline/` 约 900MB，已加入 `.gitignore`，不要提交。
不要用 `mklink /J` 目录联接，Docker 构建上下文对 junction 处理不可靠。

### 1.2 构建单底座

```powershell
cd D:\Project\Synthetix
docker build -f Dockerfile.omni -t synthetix-omni:1.1.0 .
```

首次约 20~60 分钟（要装 CPU torch、Docling 依赖、完整 npm 依赖，
主要取决于下载速度）。成功后确认：

```powershell
docker images synthetix-omni
# synthetix-omni   1.1.0   ...   约 6.3GB
```

> 这个镜像就是内网薄构建的 `FROM` 底座。**不要用新版本号覆盖它**。
> 以后只有 Python 依赖/模型/npm 依赖变化时才需要重建它。

### 1.3 导出并带进内网

```powershell
docker save synthetix-omni:1.1.0 -o synthetix-omni-1.1.0.tar
```

用 U 盘 / 共享盘 / scp 把 `synthetix-omni-1.1.0.tar` 放到服务器 `/srv/synthetix/`。
导出文件约 **1.7GB**（Docker 保存时镜像层本身就是压缩的），不需要再 gzip。

只需要带这一个 tar，不需要再带别的底座或应用镜像。

---

## 2. 服务器一次性准备

### 2.1 导入镜像

```bash
cd /srv/synthetix
docker load -i synthetix-omni-1.1.0.tar

docker images | grep synthetix
# 应该能看到 synthetix-omni:1.1.0
```

### 2.2 建目录

```bash
sudo mkdir -p /srv/synthetix/app /srv/synthetix/data
sudo chown -R "$USER":"$USER" /srv/synthetix
```

- `/srv/synthetix/app`：源码 + compose 文件（每次更新同步到这里）
- `/srv/synthetix/data`：数据库、上传文档、RAG 索引（**不能删**）

### 2.3 把源码放到服务器

把仓库源码同步到 `/srv/synthetix/app`。**必须排除**：

```
node_modules
.next
offline
.git
synthetix-data
data
.tmp-lr
*.vsix
deploy/synthetix.env
```

说明：

- `node_modules` **不用带**，`synthetix-omni` 里已经有 Linux 版。
- `offline` **不用带**，模型已经在 `synthetix-omni` 里。
- 源码本身只有几十 MB，用共享盘 / WinSCP / scp 都很快；实在不行 U 盘也可以。
- `deploy/synthetix.env` 是服务器本地密钥文件，同步时**不要覆盖或删除**。
- `src/app/fonts/` 下的两个 woff2 必须一起同步过去，否则内网 `next build`
  会去 Google Fonts 拉字体并失败。字体文件约 76KB，见 §8.2。

同步工具示例（WinSCP 图形界面最省事；有 rsync 的话）：

```bash
rsync -av --delete \
  --exclude node_modules --exclude .next --exclude offline \
  --exclude .git --exclude synthetix-data --exclude data \
  --exclude .tmp-lr --exclude '*.vsix' \
  --exclude deploy/synthetix.env \
  /path/to/Synthetix/ user@server:/srv/synthetix/app/
```

### 2.4 生成密钥

```bash
cd /srv/synthetix/app
cp deploy/synthetix.env.example deploy/synthetix.env

# 生成两个不同的随机值
openssl rand -hex 32
openssl rand -hex 32
```

把两个值分别填进 `deploy/synthetix.env` 的 `JWT_SECRET` 和 `ENCRYPTION_KEY`。
**这两个值以后永远不要改**，否则所有人登录失效、已保存的模型 API Key 无法解密。

### 2.5 第一次薄构建

```bash
cd /srv/synthetix/app
docker build -t synthetix-app:1.1.1 .
```

注意：

- 应用镜像从 `1.1.1` 开始编号；`1.1.0` 留给底座 `synthetix-omni:1.1.0`。
- 构建过程不需要联网。正常情况下 1~3 分钟。
- 如果卡在 `next build` 并报 `Failed to fetch ... from Google Fonts`，
  说明 `src/app/fonts/` 没同步过去，见 §8.2。

### 2.6 启动

```bash
cd /srv/synthetix/app
SYNTHETIX_VERSION=1.1.1 docker compose up -d --no-build

docker compose ps
docker compose logs -f app
```

日志里应看到：

```
[migrate] applied 20261027130836_znyai
[migrate] database ready at /data/dev.db (15 applied)
▲ Next.js 16.2.4
- Local: http://0.0.0.0:3000
✓ Ready
```

浏览器打开 `http://<服务器IP>:3000/`，按页面提示创建第一个管理员账号。

> 启动时 `[catalog] downloading LiteLLM catalog` 会尝试联网。内网下载失败不影响
> 启动；想消掉这条日志，把外网跑出来的 `litellm-catalog.json` 放到
> `/srv/synthetix/data/` 即可。

### 2.7 嵌入主项目（iframe）

主项目 Vue3 页面里这样写：

```vue
<iframe :src="synthetixUrl" class="h-full w-full border-0" />
```

```ts
// 必须用主页面自己的 host，不要写死 IP 或另换域名。
// 同一 host 下端口不同仍属同站，SameSite=Strict 的登录 Cookie 才能正常发送。
const synthetixUrl = `${location.protocol}//${location.hostname}:3000/`;
```

如果服务器上的 3000 端口换成了别的（见 §8.4），同步改这里的端口号。

> 反面例子：主页面用 `http://oa.corp.local/` 打开、iframe 写 `http://10.1.2.3:3000/`。
> 这属于**跨站**，登录 Cookie 是第三方 Cookie，`SameSite=Strict` 不会发送，
> 表现为登录成功后立刻跳回 `/login`。只要用 `location.hostname` 动态拼接就不会踩这个坑。

### 2.8 首次启动后配置模型

模型配置保存在**数据库**里，不是环境变量。登录后进入 **模型管理**，添加：

- Chat 模型（如 `deepseek-flash`，API 地址必须在内网可达）
- Embedding 模型（语义检索/RAG 必需，维度 ≥1536 才能用图谱模式）

---

## 3. 日常发版（每次改完代码）

假设当前线上是 `1.1.1`，你改完代码要发 `1.1.2`。

**1. 内网 Win：改代码、本地自测**

```bat
cd /d D:\Project\Synthetix
node node_modules\next\dist\bin\next dev
```

**2. 把源码同步到服务器**（排除 §2.3 列的那些目录，别覆盖 `deploy/synthetix.env`）

**3. 服务器：构建新版本**

```bash
cd /srv/synthetix/app
docker build -t synthetix-app:1.1.2 .
```

**4. 服务器：切换容器**

```bash
SYNTHETIX_VERSION=1.1.2 docker compose up -d --no-build
docker compose ps
docker compose logs --tail 30 app
```

**5. 浏览器强制刷新**（`Ctrl+F5`），确认页面和接口正常。

数据库迁移会在容器启动时由 `docker-entrypoint.mjs` 自动执行，不需要手工跑。

### 回滚

旧镜像还在本地，直接把版本号切回去：

```bash
SYNTHETIX_VERSION=1.1.1 docker compose up -d --no-build
```

> 数据库迁移只向前、不回滚。如果新版本加了迁移，回滚镜像后数据库仍是新结构
> （通常兼容，但请知悉）。

### 版本号怎么起

- 底座固定 `synthetix-omni:1.1.0`，不要覆盖。
- 每次应用构建换一个新 tag（`1.1.1`、`1.1.2`、`1.1.3`…），方便回滚。
- 想用日期也行：`20261029-1`，只要 compose 里的 `SYNTHETIX_VERSION` 和
  `docker build -t` 的 tag 一致。

---

## 4. 什么时候必须回外网重建

日常业务代码（页面、接口、样式、组件、Python worker 脚本、数据库迁移）
**全部在内网完成**，不需要回外网。

只有下面这些情况需要：

| 变化 | 要重建什么 | 命令 |
|---|---|---|
| `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` | 单底座 | `docker build -f Dockerfile.omni -t synthetix-omni:1.1.1 .` |
| `workers/python/requirements.txt`、Docling/tiktoken/GTE 模型 | 单底座 | 同上 |
| Node / Python 大版本 | 单底座 | 先改 `Dockerfile.omni` 的 `FROM`，再构建 |
| 只改业务代码 | **什么都不用重建** | 内网 `docker build -t synthetix-app:<新tag> .` |

重建底座后，把新镜像 `docker save` 带进内网，并修改内网 `Dockerfile` 顶部的：

```dockerfile
ARG BASE=synthetix-omni:1.1.0
```

或者构建时临时覆盖：

```bash
docker build \
  --build-arg BASE=synthetix-omni:1.1.1 \
  -t synthetix-app:1.1.2 .
```

---

## 5. 验证“真的不联网也能构建”

在外网机器上可以用 `--network=none` 模拟断网：

```powershell
docker build --network=none -t synthetix-app:test .
```

本仓库已经实测通过：`next build` 约 24 秒，`/login` 返回 200，
登录接口返回 401（Prisma/SQLite 正常），页面只引用本地
`/_next/static/media/*.woff2`，没有任何 `fonts.googleapis.com` 请求。

内网服务器本身就没有外网，正常 `docker build` 即可，不需要加这个参数。

---

## 6. 数据与备份

所有持久数据都在宿主机 `/srv/synthetix/data`：

| 路径 | 内容 |
|---|---|
| `dev.db` | SQLite：用户、模型配置、文档记录、思路梳理、知识库 |
| `documents/` | 上传的原始文档 |
| `rag/` | LightRAG 图谱与向量索引 |
| `locks/` | RAG 互斥锁 |
| `tmp/` | 转换临时文件 |
| `litellm-catalog.json` | 模型目录缓存（可选） |

备份：

```bash
# 推荐先停容器再打包，保证 SQLite 一致
cd /srv/synthetix/app
docker compose stop app
tar -czf /srv/synthetix/backup-$(date +%F).tar.gz -C /srv synthetix/data
docker compose start app
```

**重建容器、重建镜像、切换版本都不会丢数据**，因为 `/data` 是宿主机目录挂载。
但不要删除 `/srv/synthetix/data`。

---

## 7. 配置项说明

`deploy/synthetix.env`（由 compose 注入，优先于镜像内默认值）：

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | JWT 签名密钥，**必须固定**，否则所有人登录失效 |
| `ENCRYPTION_KEY` | 模型 API Key 等敏感字段的加密密钥，**必须固定**，否则已存密钥无法解密 |

其余运行时变量由底座镜像的 `ENV` 提供（`docker-compose.yml` 不重复声明），
需要临时覆盖时在 `deploy/synthetix.env` 里追加即可：

| 变量 | 值 | 说明 |
|---|---|---|
| `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` | Next.js 监听地址 |
| `COOKIE_SECURE` | `false` | 纯 HTTP 必须关闭，否则浏览器拒收登录 Cookie |
| `DB_PATH` / `DATABASE_URL` | `/data` / `file:/data/dev.db` | SQLite 位置 |
| `DATA_DIR` / `DOCUMENT_ROOT` / `RAG_ROOT` / `RAG_LOCK_ROOT` | `/data/...` | 数据目录布局 |
| `DOCLING_ARTIFACTS_PATH` | `/opt/synthetix/docling` | Docling 模型 |
| `TIKTOKEN_CACHE_DIR` | `/opt/synthetix/tiktoken` | tiktoken 缓存 |
| `LOCAL_EMBED_MODEL_PATH` | `/app/models/gte-multilingual-base` | 分块用 ONNX 模型 |
| `HF_HUB_OFFLINE` | `1` | 杜绝 HuggingFace 联网尝试 |
| `PYTHON_PATH` / `PYTHON_DAEMON_ENABLED` | `/usr/local/bin/python` / `true` | Python worker |

---

## 8. 常见问题

### 8.1 `failed to solve: synthetix-omni:1.1.0: not found`

底座没导入，或者 tag 不一致：

```bash
docker images | grep synthetix
docker load -i /srv/synthetix/synthetix-omni-1.1.0.tar
```

### 8.2 `Failed to fetch ... from Google Fonts`

内网构建时 `next build` 仍去 Google 拉字体。检查：

```bash
ls -l src/app/fonts/
# 必须有:
#   inter-latin.woff2
#   plus-jakarta-sans-latin.woff2
```

`src/app/layout.tsx` 应该是 `next/font/local`，不能是 `next/font/google`。
这两个字体文件是从旧镜像的 `.next/static/media/` 里提取的，视觉与原来一致，
不要删除。

### 8.3 版本没变 / 容器还在跑旧代码

```bash
docker compose ps
docker inspect synthetix-app:1.1.2 --format '{{.Id}}'
```

确认 `SYNTHETIX_VERSION` 指向新 tag，并且用了 `--no-build`：

```bash
SYNTHETIX_VERSION=1.1.2 docker compose up -d --no-build
```

如果还是旧页面，浏览器 `Ctrl+F5` 强制刷新。

### 8.4 3000 端口被占用 / 从办公网访问不到 3000

**端口被占用**：改 `docker-compose.yml` 的映射，例如 `"8080:3000"`，
同时把 iframe 地址改成 `http://<host>:8080/`。

**3000 从办公网不可达**（防火墙只放行 80）时有两条路：

1. 申请放行 3000（推荐，保持架构最简单）。
2. 让主项目的 nginx 容器反代本应用：给那个 nginx 加一个独立端口，例如

   ```nginx
   server {
       listen 8080;
       client_max_body_size 200m;
       proxy_read_timeout 3600s;
       proxy_send_timeout 3600s;

       location / {
           proxy_pass http://synthetix-app:3000;   # 两个容器需在同一 docker network
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_buffering off;                    # LLM 流式输出必需
       }
   }
   ```

   同时给主项目 nginx 容器发布 `8080:8080`。**不要用 `/synthetix/` 子路径**：
   应用里有 94 处 `/api/v1/...` 根绝对路径和 `/_next/` 静态资源，子路径需要
   `basePath` 并改代码。

### 8.5 上传文档返回 413 / 504

应用前面没有 nginx，这两个限制由 Next.js 自己负责：

- 413：确认 `next.config.ts` 里 `experimental.proxyClientMaxBodySize` 仍为 `"200mb"`。
- 504：如果前面还套了主项目 nginx（见 §8.4 的备选方案），检查那个 `location`
  的 `proxy_read_timeout` 是否至少 `3600s`。

### 8.6 `app` 一直 unhealthy

```bash
docker compose logs app
```

常见原因：

- `deploy/synthetix.env` 缺失或 `JWT_SECRET` 为空；
- 数据目录没有写权限（容器默认 root，一般不会）；
- 端口被占用。

### 8.7 登录成功后仍然跳回登录页

检查 `COOKIE_SECURE` 是否为 `false`。如果通过 HTTPS 访问，则应设为 `true`
（或不设置）。另外确认 iframe 地址和主页面同 host（§2.7）。

### 8.8 提示缺少 Python 模块

说明底座构建时 `pip install` 没完全成功。这属于底座问题，需要回外网重建：

```powershell
docker build -f Dockerfile.omni -t synthetix-omni:1.1.1 .
```

带进内网后：

```bash
docker build --build-arg BASE=synthetix-omni:1.1.1 -t synthetix-app:1.1.2 .
```

### 8.9 想确认镜像里到底有什么

```bash
docker run --rm synthetix-omni:1.1.0 sh -c "ls /app && ls /opt/synthetix && /usr/local/bin/python --version && node --version"
docker run --rm synthetix-omni:1.1.0 sh -c "ls /app/node_modules | head"
```

### 8.10 磁盘空间

- `synthetix-omni:1.1.0` 约 6.3GB（单底座）；`docker save` 出来的 tar 约 1.7GB。
- 每个内网版本镜像在 `docker images` 里显示约 6.4GB，但**新增的只有约 100MB**；
  底座层是共享的，`docker system df` 看到的实际占用不会按版本数线性增长。
- 旧版本镜像不要急着删，回滚要用。确认稳定后再 `docker rmi synthetix-app:<旧tag>`。

---

## 9. 文件清单

| 文件 | 说明 |
|---|---|
| `Dockerfile` | **内网薄构建**：FROM 单底座 → `next build` → 复制产物 |
| `Dockerfile.omni` | **外网单底座**：Node + 全部 npm 依赖 + Python + 模型 |
| `docker-compose.yml` | 只跑 `app` 一个容器；不含 nginx / registry |
| `.dockerignore` | 排除 Windows 产物、密钥、无关目录 |
| `src/app/fonts/` | Inter / Plus Jakarta Sans 本地字体，**内网构建必需，不能删** |
| `deploy/docker-entrypoint.mjs` | 启动前应用数据库迁移 |
| `deploy/synthetix.env.example` | 密钥模板 |
| `offline/` | 只在外网构建 `Dockerfile.omni` 时需要，不提交、不带进内网 |

---

## 10. 和旧流程的区别

| | 旧流程 | 现在 |
|---|---|---|
| 每次改代码 | 外网重打完整镜像，U 盘搬约 2.2~6GB | **内网 `docker build`，1~3 分钟** |
| 镜像传输 | 每个版本都传 | 只传一次 `synthetix-omni`（tar 约 1.7GB） |
| 底座数量 | 两个（运行时 + 构建） | **一个** |
| nginx | 曾内置 | 已删除，浏览器直连 3000 |
| registry | 可选 | 已删除，不需要 |
| 内网依赖 | 每次重新 install | 底座里已有，完全离线 |
