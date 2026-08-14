# NestLife 架构说明

> 写给接手者（Nova / 未来维护者）。目标：30 分钟内理解系统全貌。

## 一句话

NestLife —— 个人成长 + 创业管理系统。**动态任务 + AI 执行 + 自动感知 + 知识库**。

## 技术栈

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4
- 数据：SQLite（`node:sqlite` 内置模块，**零依赖**），文件 `data/nestlife.db`
- 运行：dev server 由 launchd 常驻在 3100（`com.nestlife.devserver`，`~/Library/LaunchAgents/`）；AI 助手 按 3100 访问。**3000 可能被其他本地服务占用**，NestLife 固定用 3100

## 目录结构

```
src/
  app/
    page.tsx            # 主框架：视图切换 + 全局状态（含 AI 聊天状态）
    globals.css         # 设计系统（中性色系，知识中心式极简）
    components/         # 7 个视图组件 + Sidebar + CommandPalette
    api/                # 后端接口（见下）
  lib/
    db.ts               # SQLite 层（workspace 快照 + 独立表）
    storage.ts          # 前端数据访问（经 /api/workspace）
    types.ts            # 全部数据模型
    default-data.ts     # 种子数据
    heatmap.ts          # 热力图逻辑
    parse-task.ts       # 自然语言解析（"明天下午3点交材料"）
    use-reminder-notifications.ts  # 浏览器通知
scripts/
  daily-summary.mjs     # 每日 7:00 任务汇总（cron 调用）
  project-activity.mjs  # 项目活跃度扫描（cron 调用）
  backup.mjs            # 数据备份（cron 调用）
  migrate-*.mjs         # 一次性迁移脚本
tests/
  unit.test.mjs         # 单元测试（10 项）
  api.test.mjs          # API 集成测试（8 项，需 dev server）
data/
  nestlife.db           # 主数据库
  knowledge/            # 知识库文件（用户自建）
  backups/              # 数据库备份
```

## API 一览

| 接口 | 方法 | 用途 |
|---|---|---|
| `/api/workspace` | GET/PUT | 全量读写（快照 + tasks 表），前端主入口 |
| `/api/tasks` | GET/POST/PATCH/DELETE | 任务操作；AI 同步（按标题匹配） |
| `/api/agent` | POST | 转发到 AI 网关，`model: openclaw` |
| `/api/knowledge` | GET/POST | 知识库列表 / 上传文件 / 建文件夹 |
| `/api/knowledge/file` | GET/POST/PUT/DELETE | 预览/新建文档/保存/删除（防路径穿越） |
| `/api/knowledge/search` | GET | 全文检索（主题词扩展加权） |
| `/api/projects/activity` | GET | 项目活跃度（cron 扫描写入） |
| `/api/backups` | GET/POST | 备份列表 / 立即备份 / 恢复 |

## 数据模型（核心）

- **tasks 表**：任务（独立表，AI 高频读写）。字段含 `auto`（是否自动生成）、`source`（对话/台账/日程/计划/自动汇总）
- **workspace 快照**：低频数据 JSON（attitude/branches/goals/plans/schedule/reminders/reviews/habits/dailyNotes/projects/milestones/decisions）
- **独立表**：goals/habits/projects/milestones（拆表深化，GET 以表为准 / PUT 双向同步）
- **project_activity 表**：活跃度（project_id/last_active_at/last_git_at）

## 动态系统工作流

```
每日 7:00 cron ──┬─ project-activity.mjs → 活跃度入库 → 事业页显示
                 └─ daily-summary.mjs → 结转未完成 + 里程碑提醒 + 例行任务
                                    ↓
用户对话 → /api/agent → AI 助手→/api/tasks 同步任务 / /api/workspace 更新项目
                                    ↓
今日页 60s 轮询 → 自动刷新
```

## 关键约定

- **单轨**：任务只存 tasks 表，不做双轨。手动/自动都是任务，靠 `auto` 区分
- **极简风格**：用户明确要求知识中心式极简——白卡 + 细边框，不要花哨图表/大数字动画
- **AI 助手 可读写一切**：所有数据都能经 API 被 AI 助手 操作（这是架构核心决策）
- 数据备份：每日 23:30 cron，保留 14 份；恢复前自动备份当前

## 测试

```bash
npm run test:unit   # 单元测试（无需服务器）
npm run test:api    # API 集成测试（需 dev server 在 3100）
npm test            # 全部
```

## 已知限制

- node:sqlite 有 ExperimentalWarning（Node 24 内置，可用但标记实验性）
- 移动端只读适配（顶部导航，无侧栏）
- RAG 是关键词+主题扩展加权，非向量语义检索（有意为之，零外部依赖）
