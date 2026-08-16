/**
 * 内置执行器（方案 F）— 让任意 OpenAI 兼容网关（DeepSeek / Ollama 等）也能"对话即执行"
 * 原理：function calling 循环——AI 决定调工具 → 服务端执行白名单工具（只调 NestLife 自身 API，安全）→ 结果回给 AI → 生成最终回复。
 * 买家无需安装 OpenClaw 即可用自然语言同步任务/记决策/查今日/搜知识。
 */
import fs from "fs";
import path from "path";
import { listTasks, upsertTask, patchTask, findTaskByTitle, getDb } from "./db.ts";
import { loadWorkspaceSnapshot } from "./db.ts";
import { todayLocal } from "./date-local.ts";
import { KB_DIR } from "./config.ts";

/** 白名单工具（OpenAI function calling 格式） */
export const BUILTIN_TOOLS = [
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "按标题关键词匹配并完成任务（用户说「XX完成了/搞定了」时调用）",
      parameters: { type: "object", properties: { title: { type: "string", description: "任务标题关键词" } }, required: ["title"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description: "新增一个任务到今日列表",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD，默认今天" },
          startTime: { type: "string", description: "HH:mm" },
          minutes: { type: "number" },
          priority: { type: "string", enum: ["high", "mid", "low"] },
          branchId: { type: "string", enum: ["career", "growth", "life"] },
          note: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  { type: "function", function: { name: "list_today_tasks", description: "列出今日任务", parameters: { type: "object", properties: {} } } },
  {
    type: "function",
    function: {
      name: "record_decision",
      description: "记录一条决策到决策室（用户明确拍板时调用）",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          decision: { type: "string", description: "选了什么方案" },
          context: { type: "string", description: "背景" },
          rationale: { type: "string", description: "理由" },
          branchId: { type: "string", enum: ["career", "growth", "life"] },
        },
        required: ["title"],
      },
    },
  },
  { type: "function", function: { name: "search_knowledge", description: "检索知识库，返回相关片段", parameters: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } } },
  { type: "function", function: { name: "get_workspace", description: "读取工作区数据（项目/目标/进度）", parameters: { type: "object", properties: {} } } },
];

const TEXT_EXT = new Set([".md", ".txt", ".markdown", ".json", ".yml", ".yaml", ".html", ".js", ".ts", ".py", ".sql"]);

/** 简化知识检索：关键词命中返回前 3 条片段 */
function searchKb(q: string): string {
  const ql = q.toLowerCase();
  const hits: { file: string; snippet: string }[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= 3) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) {
        try {
          const c = fs.readFileSync(full, "utf-8");
          const idx = c.toLowerCase().indexOf(ql);
          if (idx !== -1) {
            hits.push({ file: full.slice(KB_DIR.length + 1), snippet: c.slice(Math.max(0, idx - 60), idx + q.length + 120).replace(/\s+/g, " ").trim() });
          }
        } catch {
          /* 跳过 */
        }
      }
    }
  };
  try {
    walk(KB_DIR);
  } catch {
    /* 忽略 */
  }
  return hits.length ? hits.map((h) => `【${h.file}】${h.snippet}`).join("\n") : "（知识库无相关结果）";
}

/** 执行工具（白名单，只操作 NestLife 自身数据） */
export async function execTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "complete_task": {
        const title = String(args.title ?? "").trim();
        if (!title) return "❌ 缺少任务标题";
        const found = findTaskByTitle(title);
        if (found) {
          patchTask(found.id, { status: "done", completed_at: todayLocal() });
          return `✅ 已完成任务「${found.title}」`;
        }
        return `❌ 未找到标题包含「${title}」的任务`;
      }
      case "add_task": {
        const now = todayLocal();
        const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const title = String(args.title ?? "").trim();
        if (!title) return "❌ 缺少任务标题";
        upsertTask({
          id,
          branch_id: String(args.branchId ?? "career"),
          title,
          date: String(args.date ?? now),
          start_time: args.startTime ? String(args.startTime) : null,
          minutes: Number(args.minutes ?? 60),
          priority: (args.priority as "high" | "mid" | "low") ?? "mid",
          status: "todo",
          note: String(args.note ?? ""),
          source: "AI 助手",
          auto: 1,
          goal_id: null,
          created_at: now,
          completed_at: null,
        });
        return `✅ 已新增任务「${title}」（${String(args.date ?? now)}）`;
      }
      case "list_today_tasks": {
        const tasks = listTasks(todayLocal());
        if (tasks.length === 0) return "（今日暂无任务）";
        return tasks.map((t, i) => `${i + 1}. [${t.status === "done" ? "✓" : " "}] ${t.title}${t.priority === "high" ? "（高优先级）" : ""}`).join("\n");
      }
      case "record_decision": {
        const title = String(args.title ?? "").trim();
        if (!title) return "❌ 缺少决策标题";
        const db = getDb();
        const now = todayLocal();
        db.prepare(
          `INSERT INTO decisions (id, title, context, decision, rationale, alternatives, branch_id, status, date, source, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          String(args.context ?? ""),
          String(args.decision ?? ""),
          String(args.rationale ?? ""),
          "",
          String(args.branchId ?? "career"),
          "accepted",
          now,
          "AI 助手",
          new Date().toISOString()
        );
        return `✅ 已记录决策「${title}」到决策室`;
      }
      case "search_knowledge":
        return searchKb(String(args.q ?? ""));
      case "get_workspace": {
        const snap = loadWorkspaceSnapshot() ?? {};
        const projects = Array.isArray(snap.projects) ? (snap.projects as { name?: unknown; progress?: unknown }[]) : [];
        if (projects.length === 0) return "（工作区暂无项目）";
        return `项目（${projects.length} 个）：${projects.map((p) => `${String(p.name ?? "?")} ${Number(p.progress ?? 0)}%`).join("、")}`;
      }
      default:
        return `❌ 未知工具 ${name}`;
    }
  } catch (e) {
    return `❌ 执行失败：${e instanceof Error ? e.message : String(e)}`;
  }
}

/** 内置执行器的 system 提示词（工具导向，覆盖前端传给 OpenClaw 的 curl 指令） */
export const BUILTIN_SYSTEM =
  "你是 NestLife 的 AI 助手。你可以使用提供的工具来完成用户的请求：完成/新增任务、查看今日任务、记录决策、检索知识、查看工作区。需要执行时就调用对应工具，工具结果会自动返回给你；无需执行时直接回答。回答简洁、直接、中文；执行动作后用「→ 操作」逐行汇报，最后一行以「✅」开头总结结果。";

