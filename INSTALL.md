# NestLife 安装说明书

> 面向首次安装的买家。按下面的步骤一步步来，10 分钟内跑起来。
> 遇到问题先看第 9 节「常见问题速查」，再查 [DEPLOY.md](./DEPLOY.md) 的详细排错。

---

## 1. 系统要求

| 项 | 要求 |
|---|---|
| 系统 | Linux / macOS（Windows 建议用 Docker） |
| 内存 | 512MB 以上（个人工具，很省） |
| 方式 A（Docker） | 已安装 Docker 和 Docker Compose（macOS/Windows 用 Docker Desktop） |
| 方式 B/C（直接运行） | **Node.js ≥ 22.5**（务必 ≥22.5，否则启动即崩） |

**不同系统的使用区别**（不影响功能，仅部署/习惯差异）：

| 事项 | macOS | Windows | Linux |
|---|---|---|---|
| 推荐安装 | 直接运行（方式 B/C）或 Docker | **Docker Desktop**（最省心） | install.sh 或 Docker |
| 数据默认位置 | `~/Library/.nestlife/data` | 同路径 `%USERPROFILE%\.nestlife\data`（直接运行）/ Docker 卷（见 docker-compose.yml） | `~/.nestlife/data` |
| 数据备份同步 | `NESTLIFE_ICLOUD_DIR` 指向 iCloud 目录 | `NESTLIFE_ICLOUD_DIR` 指向 OneDrive 目录 | `NESTLIFE_ICLOUD_DIR` 指向任意网盘目录 |
| 快捷键 | `⌘K` 命令面板 | `Ctrl+K` 命令面板 | `Ctrl+K` 命令面板 |
| 定时任务 | launchd（脚本自带示例） | 任务计划程序（可跳过：Docker + 内置每日备份已够用） | cron / systemd timer |

> 数据格式完全一致（SQLite 单文件 + 知识库目录），**换系统可直接复制数据目录迁移**。

检查 Node 版本：
```bash
node -v    # 必须 v22.5.0 或更高
```

---

## 2. 安装前准备

解压交付包，进入目录：
```bash
tar xzf nestlife-v1.0.tar.gz
cd nestlife
```

生成配置文件（**记得修改里面的密码**）：
```bash
cp .env.example .env
```

---

## 3. 方式一：Docker 安装（推荐，最省事）

```bash
docker compose up -d
```

- 首次会自动构建镜像并启动，等待出现 `nestlife` 容器
- 查看是否启动成功：
  ```bash
  docker compose ps          # STATUS 应为 Up
  docker compose logs -f     # 看日志，出现 "Ready" 即成功
  ```

**完成！** 浏览器打开 `http://localhost:3100` 进入第 6 节。

---

## 4. 方式二：Linux 一键安装

```bash
sudo bash install.sh /opt/nestlife
```

脚本会自动：检查 Node → 拷贝源码 → 安装依赖 → 构建 → 创建数据目录 → 生成 .env → 注册 systemd 服务并启动。

完成后：
```bash
systemctl status nestlife    # 应显示 active (running)
```

**完成！** 浏览器打开 `http://localhost:3100`。

> 手动管理：`sudo systemctl restart nestlife` 重启；`journalctl -u nestlife -f` 看日志。

---

## 5. 方式三：手动运行（macOS / 任何系统）

```bash
# 1. 安装依赖（Node ≥ 22.5）
npm ci

# 2. 构建
npm run build

# 3. 启动（前台运行，Ctrl+C 停止）
NESTLIFE_AUTH=1 \
NESTLIFE_ADMIN_PASSWORD=你的密码 \
npm run start -- -p 3100
```

常驻后台（推荐 pm2 或 nohup）：
```bash
nohup npm run start -- -p 3100 > nestlife.log 2>&1 &
```

**完成！** 浏览器打开 `http://localhost:3100`。

---

## 6. 首次启动（三种方式通用）

1. 浏览器打开 `http://localhost:3100`
2. 若你启用了认证（`NESTLIFE_AUTH=1`）：首次访问会跳到登录页，输入 `.env` 里设置的 `NESTLIFE_ADMIN_PASSWORD`
3. 系统**自动初始化**：数据目录、默认菜单、默认时刻表、3 个默认习惯已自动创建——**什么都不用配，直接开用**
4. 可选：进「设置」完善你的信息（人生态度、目标、项目）

**推荐马上做**：
- 进「设置 → AI 助手接入」，按你的需求选一档（详见 [DEPLOY.md](./DEPLOY.md) 第 4 节）：
  - 在线问答 → 填 DeepSeek key（2 分钟）
  - 离线问答 → 装 Ollama
  - 对话即执行 → 装 OpenClaw 后点「⚡ 一键接入」
- 进「设置 → 菜单设置」：隐藏不需要的模块、给菜单改名（可选）

---

## 7. 日常使用要点

| 操作 | 在哪 |
|---|---|
| 加任务 | 今天页输入框，自然语言「明天下午3点交材料」 |
| 勾选完成 | 点任务前的圆圈 |
| 自定义菜单 | 设置 → 菜单设置（或对 AI 助手说「隐藏内容室」） |
| 换 AI 网关/Key | 设置 → AI 助手接入 |
| 手动备份 | 设置 → 数据管理 → 立即备份 |
| 改管理密码 | 编辑 `.env` 的 `NESTLIFE_ADMIN_PASSWORD` 后重启 |

---

## 8. 备份与恢复

- **自动备份**：每天 23:30（需配置定时任务，见 DEPLOY.md 第 5 节）
- **手动备份**：设置 → 数据管理 → 立即备份（存在 `NESTLIFE_DATA/backups/`）
- **恢复**：设置 → 数据管理 → 点备份记录恢复
- **迁移到新机器**：拷贝整个 `NESTLIFE_DATA` 目录（默认 `~/.nestlife/data`），在新机器 `.env` 里指向它，重启即可

---

## 9. 常见问题速查

| 现象 | 处理 |
|---|---|
| 启动报错 / `node:sqlite` 找不到 | Node 版本不够，升级到 ≥ 22.5 |
| 端口被占用 `EADDRINUSE` | `.env` 改 `NESTLIFE_PORT=3101` 后重启 |
| 页面打不开 / 白屏 | `curl http://localhost:3100/` 看是否有响应；确认端口没写错（不是 3000） |
| 一直跳登录页 | 密码错误或 cookie 过期；忘了密码就改 `.env` 后重启 |
| AI 显示「未接入」 | 设置 → AI 助手接入 → 填网关或一键接 OpenClaw（见第 6 节） |
| 知识库/备份目录找不到 | 数据都在 `NESTLIFE_DATA`（默认 `~/.nestlife/data`） |

> 详细排错见 [DEPLOY.md](./DEPLOY.md)。

---

## 10. 升级

1. 备份数据：拷贝 `NESTLIFE_DATA` 目录
2. 用新版本覆盖源码（保留 `.env` 和 `NESTLIFE_DATA`）
3. 重新构建：
   ```bash
   npm ci && npm run build
   ```
4. 重启服务（Docker：`docker compose up -d --build`；systemd：`sudo systemctl restart nestlife`）
