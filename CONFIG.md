# NestLife 配置说明书

> 谁看：**部署者 / 管理员**。使用者怎么操作看 [USAGE.md](./USAGE.md)。
> 一句话：**所有配置改完都要重启服务才生效**（设置页里改的除外——那个即时生效）。

---

## 0. 配置入口，先认门

NestLife 的配置有**两条路**，改同一个地方：

| 入口 | 适合谁 | 生效方式 |
|---|---|---|
| **环境变量**（`.env` 文件 / 启动命令） | 部署者统一预设，一劳永逸 | 改完**重启服务** |
| **设置页**（网页里的「设置」） | 运行时直接调，不用碰服务器 | **保存即生效** |

**优先级**：设置页配置 > 环境变量 > 默认值。
（比如：设置页配了 AI 网关，环境变量里配的就被忽略；设置页清了，才轮到环境变量。）

---

## 1. 环境变量全表（照抄 `.env` 即可）

`.env.example` 有带注释的完整模板，复制成 `.env` 按需改：

```bash
cp .env.example .env
```

| 变量 | 默认 | 必填 | 用途 |
|---|---|---|---|
| `NESTLIFE_DATA` | `~/.nestlife/data` | 否 | 数据放哪（SQLite + 知识库 + 备份全在这） |
| `NESTLIFE_PORT` | `3100` | 否 | 监听端口（**别用 3000**，很多项目默认占用） |
| `NESTLIFE_AUTH` | 关 | 否 | `1` = 启用登录认证 |
| `NESTLIFE_ADMIN_PASSWORD` | - | 启用认证时**必填** | 登录密码，**必须用强密码** |
| `NESTLIFE_OPENCLAW_URL` | - | 否 | AI 网关地址（OpenAI 兼容端点） |
| `NESTLIFE_OPENCLAW_TOKEN` | - | 否 | AI 网关的 Key（没有就不填） |
| `NESTLIFE_WECHAT_DIR` | - | 否 | 内容室自动扫描的本地文章目录 |
| `NESTLIFE_PROJECT_DIRS` | - | 否 | 项目活跃度扫描（`id=标签@路径;...`） |
| `NESTLIFE_ICLOUD_DIR` | - | 否 | 异地备份目录（指向网盘同步文件夹） |

> 大部分配置**不是必填**——不配也有默认值，系统零配置就能跑起来。

---

## 2. 常用配置怎么配

### 2.1 认证：给系统上个锁

```env
NESTLIFE_AUTH=1
NESTLIFE_ADMIN_PASSWORD=换成你自己的强密码
```

启用后：
- **本机**（`localhost`）访问免登录——你自己、本机 AI 都不受影响
- **手机 / 局域网**访问必须登录，密码就是这个 `NESTLIFE_ADMIN_PASSWORD`
- 登录一次 30 天有效

**改密码**：改 `.env` 里的 `NESTLIFE_ADMIN_PASSWORD` → 重启服务 → 旧登录全部失效，用新密码重登。

### 2.2 AI 助手：三档任选（也可以不配）

| 你的需求 | 配什么 | 在哪配 |
|---|---|---|
| 只要在线问答 | DeepSeek 的地址 + Key | **设置页**填，2 分钟 |
| 要离线问答 | Ollama：`http://localhost:11434/v1/chat/completions`，Key 留空 | **设置页**填 |
| 要"对话即执行"（说句话自动管理任务） | 任意支持工具调用的网关（DeepSeek/Ollama 都行） | **设置页**填，内置执行器自动启用 |
| 要完整执行（读任意文件/命令） | 装 OpenClaw 后点「⚡ 一键接入」 | 设置页一键 |

环境变量方式（部署者预设，可选）：

```env
NESTLIFE_OPENCLAW_URL=http://localhost:18789/v1/chat/completions
NESTLIFE_OPENCLAW_TOKEN=你的token
```

不配 AI 完全没关系——AI 页显示「未接入」，其他功能照常。

### 2.3 数据目录 / 端口

```env
NESTLIFE_DATA=/var/lib/nestlife/data   # 数据全在这，备份/迁移拷这个目录
NESTLIFE_PORT=3100                      # 换端口用这个
```

### 2.4 内容室自动扫文章

```env
NESTLIFE_WECHAT_DIR=/path/to/your/articles
```

留空 = 不自动扫描本地文章（内容室手动加选题也能用）。

### 2.5 项目活跃度扫描（定时任务用）

```env
NESTLIFE_PROJECT_DIRS="p-app=我的产品@/srv/myapp;p-blog=博客@~/blog"
```

格式：`id=标签@路径1,路径2;id=标签@路径`。配合定时脚本扫文件/git 变化，项目"停滞"会自动标红。

### 2.6 异地备份（双保险）

```env
NESTLIFE_ICLOUD_DIR=/path/to/cloud-sync/nestlife
```

指向 iCloud Drive / OneDrive / 任意网盘同步目录，备份产物自动多存一份。

---

## 3. 设置页能配什么（不用重启，保存即生效）

| 设置项 | 说明 |
|---|---|
| **AI 助手接入** | 网关地址 + Key 直接填，或「⚡ 一键接入 OpenClaw」 |
| **菜单设置** | 隐藏/改名/排序/换图标 |
| **时刻表** | 改每天的固定节奏 |
| **数据管理** | 备份 / 恢复备份 / 导出 JSON / 重置（重置不可逆，先备份） |

---

## 4. 常见配置问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 改了 `.env` 没反应 | 配置在启动时读取，**改完没重启** | 重启服务（不是刷新浏览器） |
| 忘了登录密码 | - | 改 `.env` 的 `NESTLIFE_ADMIN_PASSWORD` → 重启 → 新密码登录 |
| 页面 401 一直跳登录 | 密码错 / cookie 旧 | 重新登录；还不行就清浏览器 cookie |
| AI 显示「未接入」 | 网关没配 / 配了没重启 | 检查设置页或 `.env`，重启服务；`curl` 一下网关地址确认能连通 |
| 端口被占用 `EADDRINUSE` | 3100 被别的程序占了 | `.env` 改 `NESTLIFE_PORT=3101`，重启 |

---

> 部署步骤、日志位置、排错细节看 [DEPLOY.md](./DEPLOY.md)；完整安装流程看 [INSTALL.md](./INSTALL.md)。
