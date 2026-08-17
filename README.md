<p align="center">
  <img src="public/icon.svg" alt="NestLife" height="72">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/授权-个人免费%20·%20商用授权-green">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22.5-blue">
  <img src="https://img.shields.io/badge/Stack-Next.js%2016%20·%20SQLite%20·%20Tailwind-blueviolet">
  <img src="https://github.com/Megannnp/Nestlife/actions/workflows/ci.yml/badge.svg" alt="CI">
</p>

# NestLife™

> 把人生当作一家公司来经营：人生态度定方向，目标拆路径，任务管执行，复盘反哺，知识库支撑决策，AI 对话即执行。

- 📋 **今日看板**：任务清单 + 自然语言添加（「明天下午3点交材料」自动识别）+ 提醒 + 时刻表
- 🔄 **复盘闭环**：日 / 周 / 月复盘 + 自动统计 + 下一步一键转任务
- 🏗️ **事业管理**：项目 + 里程碑 + 活跃度自动感知
- 🌱 **成长习惯**：习惯打卡 + 执行热力图
- 🤖 **AI 助手**（可选）：对话即执行——说「XX 完成了」自动同步任务、记决策、改菜单
- 📚 **知识中心**：自建知识库 + 全文检索（同义词扩展）
- 📌 **决策室 / 📦 内容室 / ⚙️ 个性化设置**

**数据 100% 留在你自己的机器上**（SQLite 零外部依赖），个人 / 非商用免费使用。

> [English README](./README.en.md) · [安装说明](./INSTALL.md) · [使用说明](./USAGE.md)

---

## 为什么做 NestLife

市面上多数"人生管理"工具要么数据在云端、要么功能割裂。NestLife 想解决的：

- **数据私密**：全部数据在本机 SQLite，断网可用，迁移就是拷一个目录
- **闭环不割裂**：目标 → 任务 → 执行 → 复盘 → 决策，一条链路
- **AI 真干活**：可选的 AI 执行层，用自然语言操作整个系统（任务/决策/菜单），支持云端或本地模型
- **极简**：白卡 + 细边框 + 直接信息，不搞花哨仪表盘

## 快速开始

需要 **Node.js ≥ 22.5**（依赖内置 `node:sqlite`）或 Docker。

```bash
# 方式一：Docker（最省事）
cp .env.example .env
docker compose up -d
# 打开 http://localhost:3100

# 方式二：直接运行
npm ci && npm run build
NESTLIFE_AUTH=1 NESTLIFE_ADMIN_PASSWORD=你的密码 npm run start -- -p 3100
```

首次打开自动初始化（默认菜单 / 时刻表 / 习惯），零配置即可使用。完整安装步骤见 [INSTALL.md](./INSTALL.md)。

**手机 / 其他设备访问**：同一网络下浏览器打开 `http://<服务器IP>:3100`，输入 `NESTLIFE_ADMIN_PASSWORD` 设置的密码登录（本机 `localhost` 免登录）。日常用法见 [USAGE.md](./USAGE.md)。

## AI 助手（可选，按需选档）

| 需求 | 配置 |
|---|---|
| 在线问答 | 设置页填 DeepSeek 等任意 OpenAI 兼容端点 |
| 离线问答 | 装 Ollama，指向 `http://localhost:11434/v1/chat/completions` |
| 对话即执行 | 装 OpenClaw 后设置页「⚡ 一键接入」 |

未配置 AI 时，任务 / 复盘 / 知识 / 决策等功能完全不受影响。详见 [DEPLOY.md](./DEPLOY.md)。

## 文档

- [INSTALL.md](./INSTALL.md) — 安装说明书
- [CONFIG.md](./CONFIG.md) — 配置说明书（环境变量 / 认证 / AI / 数据）
- [USAGE.md](./USAGE.md) — 使用说明书
- [DEPLOY.md](./DEPLOY.md) — 部署与排错
- [CHANGELOG.md](./CHANGELOG.md) — 版本记录
- [DELIVERY.md](./DELIVERY.md) — 商业授权交付清单（个人免费用户无需看）
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 开发者架构

## 授权

**双轨授权**：个人 / 学生 / 教育 / 非营利组织**免费**使用、修改、再分发（保留版权声明）；组织或任何**商业用途需购买商业授权**。详见 [LICENSE](./LICENSE)。

© 2026 重庆巢外科技有限责任公司 · NestLife™

## 贡献

欢迎提 Issue、PR、建议。开发环境：

```bash
npm run dev -- -p 3100   # 开发
npm test                 # 单元 + API 测试
npm run test:auth        # 认证测试
npm run test:init        # 首次启动测试
```

## License

NestLife is dual-licensed: free for personal / non-commercial use, commercial use requires a paid license. See [LICENSE](./LICENSE).

