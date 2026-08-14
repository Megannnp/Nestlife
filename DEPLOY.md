# NestLife 部署与排错指南

> 面向买家与部署工程师。先用 [README.md](./README.md) 的「快速开始」完成首次安装，遇到问题再回来查本节。

## 0. 系统要求

- **Node.js ≥ 22.5**（依赖内置 `node:sqlite`）——过低版本会导致启动即崩溃
- 或 **Docker**（镜像 node:24-alpine，免装 Node）
- 1 核 / 512MB 内存即可流畅运行（个人工具，资源占用极低）
- 建议 Linux / macOS；Windows 可用 Docker Desktop

检查 Node 版本：

```bash
node -v   # 必须 v22.5.0 或更高
```

## 1. 部署方式

### 方式 A：Docker（推荐）

```bash
cp .env.example .env
docker compose up -d
# 查看日志
docker compose logs -f
# 停止/重启
docker compose down && docker compose up -d
```

- 数据保存在 `./data`（compose 已挂载），删容器不丢数据。
- 升级：重新 `docker compose build && docker compose up -d`。

### 方式 B：Linux 一键安装（systemd）

```bash
bash install.sh /opt/nestlife
systemctl status nestlife        # 查看状态
journalctl -u nestlife -n 50     # 查看日志
```

### 方式 C：手动

```bash
npm install
npm run build
NESTLIFE_AUTH=1 NESTLIFE_ADMIN_PASSWORD=你的密码 \
NESTLIFE_DATA=/var/lib/nestlife/data \
npm run start -- -p 3100
```

## 2. 配置项速查

| 变量 | 默认 | 必填 | 说明 |
|---|---|---|---|
| `NESTLIFE_DATA` | `~/.nestlife/data` | 否 | 数据目录，首次启动自动创建 |
| `NESTLIFE_PORT` | `3100` | 否 | 监听端口 |
| `NESTLIFE_AUTH` | 关 | 否 | `1` 启用登录认证 |
| `NESTLIFE_ADMIN_PASSWORD` | - | 认证时必填 | 登录密码，**请用强密码** |
| `NESTLIFE_OPENCLAW_URL` | - | 否 | AI 网关地址（OpenAI 兼容端点） |
| `NESTLIFE_OPENCLAW_TOKEN` | - | 否 | AI 网关令牌 |
| `NESTLIFE_WECHAT_DIR` | - | 否 | 内容室本地文章目录 |
| `NESTLIFE_PROJECT_DIRS` | - | 否 | 项目活跃度扫描（`id=标签@路径;...`，留空跳过扫描） |
| `NESTLIFE_ICLOUD_DIR` | - | 否 | 异地备份目录（网盘同步目录，留空跳过） |

> 修改 `.env` 后必须**重启服务**才生效（Docker：`docker compose restart`；systemd：`systemctl restart nestlife`）。

## 3. 启用认证

```env
NESTLIFE_AUTH=1
NESTLIFE_ADMIN_PASSWORD=请改成强密码
```

效果：未登录访问 `/api/*` 返回 401；访问页面自动跳转 `/login`。登录态 30 天有效。

## 4. 接入 AI 助手（可选）——按你的需求选一档

### 第一步：选档（30 秒）

| 你的需求 | 选档 | 要装什么 | 联网 |
|---|---|---|---|
| 只要「问答」（聊天、给建议），可接受联网 | **A 在线问答** | 什么都不用装 | 要（对话上云） |
| 只要「问答」，要离线/数据不出机器 | **B 离线问答** | 只装 Ollama | 不要 |
| 要「对话即执行」（说句话自动同步任务/记决策），可接受联网 | **C 在线执行** | 装 OpenClaw | 要 |
| 要「对话即执行」，还要离线/数据不出机器 | **D 离线执行** | 装 OpenClaw + Ollama | 不要 |

### 档位 A：在线问答（最简单，2 分钟）

1. 去 `platform.deepseek.com` 注册 → 充值 10-50 元 → 创建 API Key
2. 打开 **设置 → AI 助手接入**，填入：
   - 网关地址：`https://api.deepseek.com/v1/chat/completions`
   - API Key：刚创建的 key
3. 点「保存并启用」→ 完成，无需重启。

### 档位 B：离线问答（隐私优先，3 分钟）

1. 安装 Ollama（ollama.com 下载），启动后拉一个中文模型：
   ```bash
   ollama pull qwen2.5:7b
   ```
2. **设置 → AI 助手接入**，填入：
   - 网关地址：`http://localhost:11434/v1/chat/completions`
   - API Key：**留空**
3. 保存。全程离线，对话数据不出机器。

### 档位 C：在线「对话即执行」（自动化，需 OpenClaw）

OpenClaw 是 AI 执行框架：你说「XX 完成了」，它真的去调 API 同步任务；你说「读一下 DASHBOARD」，它真的去读文件。

1. 安装并启动 OpenClaw（`npm install -g openclaw`，详见官方文档）
2. **设置 → AI 助手接入** → 看到「OpenClaw 本机接入：**已检测到**」→ 点「**⚡ 一键接入**」
3. 完成。默认模型走云端（可在 OpenClaw 配置里换成任意模型）。

### 档位 D：离线「对话即执行」（全隐私，最完整）

1. 按档位 C 安装 OpenClaw
2. 安装 Ollama 并拉模型：`ollama pull qwen2.5:7b`
3. 在 OpenClaw 配置里把模型指向 `http://localhost:11434`（即用 Ollama 做本地大脑）
4. 回 NestLife 设置页点「⚡ 一键接入 OpenClaw」
5. 全程离线，AI 执行 + 数据都不出机器。

### 未接入时的表现

AI 页显示「未接入」，**任务 / 复盘 / 知识 / 决策 / 菜单等功能完全不受影响**。随时可回来配置。

### 环境变量方式（部署者预设，可选）

```env
NESTLIFE_OPENCLAW_URL=http://localhost:18789/v1/chat/completions
NESTLIFE_OPENCLAW_TOKEN=你的token
```

注意：设置页保存的配置**优先于**环境变量；环境变量仅在页面未配置时生效。

## 5. 数据：备份 / 恢复 / 迁移

- **手动备份**：设置页 → 备份；或 `NESTLIFE_DATA=/path/to/data node scripts/backup.mjs`（产物在 `NESTLIFE_DATA/backups/`）
- **定时备份 + 异地备份**（示例 cron）：
  ```cron
  30 23 * * * NESTLIFE_DATA=/path/to/data node /opt/nestlife/scripts/backup.mjs && NESTLIFE_DATA=/path/to/data NESTLIFE_ICLOUD_DIR=/path/to/cloud node /opt/nestlife/scripts/backup-sync.mjs
  ```
- **每日自动汇总任务 + 项目活跃度**（可选，示例 cron）：
  ```cron
  0 7 * * * NESTLIFE_DATA=/path/to/data node /opt/nestlife/scripts/daily-summary.mjs
  5 7 * * * NESTLIFE_DATA=/path/to/data NESTLIFE_PROJECT_DIRS="p-app=我的产品@/srv/app" node /opt/nestlife/scripts/project-activity.mjs
  ```
- **恢复**：设置页选择备份恢复；或停止服务后用备份文件覆盖 `NESTLIFE_DATA/nestlife.db` 再启动
- **迁移**：整个 `NESTLIFE_DATA` 目录拷到新机器，改 `.env` 的 `NESTLIFE_DATA` 指向即可（**同版本内**；跨大版本前先备份）

## 6. 常见问题排查

### Q1 启动报错：`Node.js version` / 找不到 `node:sqlite`
原因：Node < 22.5。
解决：升级 Node（`nvm install 24`），或用 Docker 部署。

### Q2 端口被占用：`EADDRINUSE`
解决：改 `.env` 的 `NESTLIFE_PORT`（如 3101），重启。或用 `lsof -i :3100` / `netstat -tlnp | grep 3100` 找到占用进程。

### Q3 浏览器打不开 / 白屏
- 确认服务在跑：`curl http://localhost:3100/` 应返回 HTML。
- 确认访问的是**配的端口**（默认 3100），不是 3000。
- 刷新（Ctrl/Cmd+Shift+R）排除缓存。

### Q4 页面 401 / 跳转登录
认证已启用但未登录，或密码错误。清除浏览器 cookie 后重新登录；若忘记密码，改 `.env` 的 `NESTLIFE_ADMIN_PASSWORD` 后重启。

### Q5 AI 助手显示「未接入」
- 检查 `.env` 是否配置 `NESTLIFE_OPENCLAW_URL` 且**已重启**。
- 检查网关地址/端口是否可达：`curl http://localhost:18789/v1/chat/completions`（能连则返回非连接错误）。
- 网关需要 OpenAI 兼容 `/v1/chat/completions` 端点。

### Q6 知识库/备份目录在别处
默认数据目录是 `~/.nestlife/data`。若想用指定目录，配置 `NESTLIFE_DATA` 并重启（首次会自动创建目录结构）。

### Q7 Docker 部署数据不持久
确认用 `docker compose up`（卷已配置）。若手动 `docker run`，务必加 `-v /本地路径:/data`。

### Q8 修改配置后没生效
所有配置在**启动时**读取。改 `.env` 后必须重启服务（不是刷新浏览器）。

## 7. 日志位置

| 部署方式 | 日志 |
|---|---|
| Docker | `docker compose logs -f` |
| systemd | `journalctl -u nestlife -n 100 -f` |
| 手动 | 终端输出；或 `nohup ... > nestlife.log 2>&1 &` |
