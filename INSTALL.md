# NestLife 安装说明书（手把手版）

> 跟着做就行，一步步来，大约 10 分钟跑起来。
> 每步都写了「✅ 成功的样子」和「❌ 如果不对」，卡住就对照着看。
> 完全不想碰命令行？① 请懂电脑的朋友帮你装；② 用 Docker Desktop（图形界面为主）。

---

## 0. 第一步：学会打开"终端"

安装需要在"终端"里敲几条命令。不同系统打开方式不一样：

| 系统 | 怎么打开终端 |
|---|---|
| **macOS** | 屏幕右上角放大镜 → 输入 `终端` → 回车；或「启动台 → 其他 → 终端」 |
| **Windows** | 按键盘 `Win` 键 → 输入 `cmd` → 回车（打开的是黑窗口，就是它） |
| **Linux** | 按 `Ctrl + Alt + T` 同时按下 |

打开后你会看到类似 `用户名@电脑名 ~ %` 的提示符——这就是能敲命令的地方了。
后面的命令**复制粘贴**进去，按**回车**执行即可（粘贴用 `Ctrl+V`，macOS 用 `Cmd+V`）。

> ✅ 出现命令提示符（`~ %` 或 `C:\>`）就是成功了。
> ❌ 打不开？Windows 试试开始菜单搜"PowerShell"；macOS 试试启动台里找。

---

## 1. 选一条路：Docker（省事）还是直接运行（灵活）

| 选择 | 适合谁 | 要装什么 |
|---|---|---|
| **A. Docker**（推荐） | 想省事、Windows 用户 | Docker Desktop（图形界面装） |
| **B. 直接运行** | macOS / Linux 用户、爱折腾 | Node.js ≥ 22.5 |

### 装 A：Docker Desktop

1. 打开官网 `docker.com/products/docker-desktop`，下载你系统的安装包
2. 双击安装，装完打开 Docker Desktop（首次可能提示登录/授权，允许即可）
3. 等右上角图标变绿（或鲸鱼图标不再转圈）——说明 Docker 好了

> ✅ Docker Desktop 图标正常显示、点开能看到 "running"。
> ❌ 装不上？看安装包提示；实在不行改选 **B. 直接运行**。

### 装 B：Node.js

1. 打开官网 `nodejs.org`，下载 **LTS** 版本（左侧绿色按钮）
2. 双击安装，一路"下一步"装完
3. 回到终端，敲下面命令确认：

```bash
node -v
```

> ✅ 显示 `v22.5.0` 或更高（如 `v24.x.x`）就对了。
> ❌ 显示 `v22.5.0` 以下，或提示"找不到命令"？重新打开官网下载 LTS 版，重装一遍。

---

## 2. 拿到 NestLife 并解压

你的安装包叫 `nestlife-v1.0.tar.gz`（或你收到的交付包），把它放到一个好找的位置（比如「下载」文件夹）。

在终端里，先进到安装包所在的文件夹（把下面命令里的 `下载` 换成你实际放的文件夹名）：

```bash
cd ~/下载
```

> ✅ 回车后没有报错就行（还是显示 `~` 开头）。
> ❌ 提示 `No such file`？文件夹名不对，改成 `cd Downloads`（英文）或你实际的名字。

解压：

```bash
tar xzf nestlife-v1.0.tar.gz
```

> ✅ 没报错，且执行 `ls` 能看到 `nestlife` 文件夹。
> ❌ 提示 `tar: Error\..`？确认文件名拼写无误；Windows 可以用鼠标右键 → 解压。

进入目录：

```bash
cd nestlife
```

> ✅ 提示符前面出现 `nestlife`。

---

## 3. 设置登录密码（重要）

复制配置文件模板：

```bash
cp .env.example .env
```

> ✅ 没报错。 `ls -a` 能看到 `.env`。

现在**打开 `.env` 文件改密码**（用记事本 / 文本编辑打开这个文件，找到下面两行，把 `换成你自己的强密码` 改掉，保存）：

```
NESTLIFE_AUTH=1
NESTLIFE_ADMIN_PASSWORD=换成你自己的强密码
```

> 这个密码就是以后**手机/其他设备访问时要登录的密码**，务必记住。
> 本机访问（localhost）不需要输密码。忘记密码就回来改这行再重启。

---

## 4. 启动 NestLife

### 方式一：Docker（推荐，图形界面 Docker Desktop 装好的选这个）

```bash
docker compose up -d
```

> ⏳ 第一次会自动下载构建，等 1-3 分钟（耐心等，别关终端）。
> ✅ 完成后执行 `docker compose ps`，STATUS 显示 `Up`。
> ❌ 报 `command not found: docker`？回到第 1 节重新装 Docker Desktop 并打开它。
> ❌ 报端口占用？见第 8 节「端口被占用」。

### 方式二：Linux 一键安装

```bash
sudo bash install.sh /opt/nestlife
```

> ⏳ 脚本自动做所有事（检查、拷贝、装依赖、构建、启动），等几分钟。
> ✅ 完成后 `systemctl status nestlife` 显示 `active (running)`。
> ❌ 中途报错？把报错复制给部署工程师，或看 [DEPLOY.md](./DEPLOY.md)。

### 方式三：手动运行（macOS / 任何系统）

```bash
# 1. 安装依赖（第一次要等一两分钟）
npm ci

# 2. 构建（再等一两分钟）
npm run build

# 3. 启动
npm run start -- -p 3100
```

> ✅ 看到 `Ready` 或 `Local: http://localhost:3100` 就成功了。
> ❌ `node:sqlite` 相关报错 = Node 版本不够，回第 1 节升级。
> ⚠️ 这个窗口别关（关了服务就停）。想关窗口也能一直跑？用下面命令：

```bash
nohup npm run start -- -p 3100 > nestlife.log 2>&1 &
```

---

## 5. 打开浏览器，开始使用

1. 打开浏览器（Chrome / Edge / Safari 都行）
2. 地址栏输入 `http://localhost:3100`，回车

> ✅ 看到"NestLife / 筑巢人生"就成功了！
> ❌ 打不开？回到第 4 节确认服务启动成功（三种方式的 ✅ 标志）；还不行看第 8 节。

首次打开会自动初始化（默认菜单 / 时刻表 / 习惯）——**什么都不用配，直接开用**。
日常用法：看 [USAGE.md](./USAGE.md)（大白话）。

---

## 6. 手机 / 其他设备访问（可选）

1. 让手机和这台电脑连**同一个 Wi-Fi**
2. 电脑上查 IP：终端执行 `ipconfig getifaddr en0`（Windows 用 `ipconfig`），记下类似 `192.168.x.x` 的地址
3. 手机浏览器打开 `http://那个IP:3100` → 输入第 3 节设的密码 → 进入

---

## 7. 备份与恢复（建议每周做一次）

- **手动备份**：打开系统 → 设置 → 数据管理 → 「立即备份」
- **自动备份**：每天 23:30（需要配置定时任务，见 [DEPLOY.md](./DEPLOY.md)）
- **恢复**：设置 → 数据管理 → 点备份记录
- **迁移到新电脑**：把整个数据目录拷走（位置看 [CONFIG.md](./CONFIG.md) 的 NESTLIFE_DATA），新机器指向它即可

---

## 8. 常见问题速查

| 现象 | 处理 |
|---|---|
| 启动报错 / node:sqlite 找不到 | Node 版本不够，回第 1 节升级到 ≥ 22.5 |
| 端口被占用 | 编辑 `.env` 把 `NESTLIFE_PORT=3100` 改成 `3101`，重启 |
| 浏览器打不开 / 白屏 | 确认第 4 节的 ✅ 标志都满足；地址是 3100（不是 3000） |
| 一直跳登录页 | 密码错了；忘了就改 `.env` 的密码后重启 |
| AI 显示「未接入」 | 正常，AI 是选配——设置 → AI 助手接入 按需配（见 DEPLOY.md） |

> 更多排错：[DEPLOY.md](./DEPLOY.md)

---

## 9. 升级到新版本

1. 先备份（设置 → 数据管理 → 立即备份）
2. 用新版覆盖旧文件（**保留 `.env` 和数据目录**）
3. 重新构建：`npm ci && npm run build`
4. 重启（Docker：`docker compose up -d --build`）
