import { todayLocal } from "../../../lib/date-local.ts";
import { NextResponse } from "next/server";
import {
  loadWorkspaceSnapshot, saveWorkspaceSnapshot, migrateTasksFromSnapshot, migrateReviewsFromSnapshot,
  listTasks, deleteTask, upsertTask, getDb, type TaskRow,
} from "../../../lib/db.ts";
import { seedWorkspace } from "../../../lib/default-data.ts";

/**
 * /api/workspace — 前端统一数据入口（替代 localStorage）
 *  GET  读取全部数据（workspace 快照 + tasks 表，合并返回）
 *  PUT  保存全部（workspace 快照；tasks 数组同步进 tasks 表）
 */

export async function GET() {
  let snapshot = loadWorkspaceSnapshot();
  if (!snapshot || Object.keys(snapshot).length === 0) {
    // 首次启动：服务端初始化种子数据并落库（保证 DB 有数据，每日脚本/备份可读）
    snapshot = seedWorkspace() as unknown as Record<string, unknown>;
    try {
      migrateTasksFromSnapshot(snapshot);
      migrateReviewsFromSnapshot(snapshot);
      syncTables(snapshot);
      const clean: Record<string, unknown> = { ...snapshot };
      delete clean.tasks;
      saveWorkspaceSnapshot(clean);
    } catch {
      /* 初始化失败不阻塞读取（前端仍有 seed fallback） */
    }
  }
  const tasks = listTasks();
  // 从独立表读取（若表有数据则以表为准，保证 AI 助手 直写生效）
  const goals = readTable("goals");
  const habits = readTable("habits");
  const projects = readTable("projects");
  const milestones = readTable("milestones");
  if (goals.length > 0) snapshot.goals = goals;
  if (habits.length > 0) snapshot.habits = habits;
  if (projects.length > 0) snapshot.projects = projects;
  if (milestones.length > 0) snapshot.milestones = milestones;
  return NextResponse.json({ snapshot, tasks });
}

/** 前端保存时同步到独立表（upsert + 删除已移除的，防止数据"复活"） */
function syncTables(snapshot: Record<string, unknown>) {
  try {
    const db = getDb();
    // goals
    if (Array.isArray(snapshot.goals)) {
      const seen = new Set<string>();
      for (const g of snapshot.goals as Record<string, unknown>[]) {
        seen.add(String(g.id));
        db.prepare(`INSERT INTO goals (id, branch_id, level, title, measure, due_date, progress, done, parent_id, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET branch_id=excluded.branch_id, level=excluded.level, title=excluded.title,
            measure=excluded.measure, due_date=excluded.due_date, progress=excluded.progress, done=excluded.done, parent_id=excluded.parent_id`)
          .run(String(g.id), String(g.branchId ?? "career"), String(g.level ?? "mid"), String(g.title), String(g.measure ?? ""), g.dueDate ? String(g.dueDate) : null, Number(g.progress ?? 0), g.done ? 1 : 0, g.parentId ? String(g.parentId) : null, String(g.createdAt ?? ""));
      }
      removeGone(db, "goals", seen);
    }
    // habits
    if (Array.isArray(snapshot.habits)) {
      const seen = new Set<string>();
      for (const h of snapshot.habits as Record<string, unknown>[]) {
        seen.add(String(h.id));
        db.prepare(`INSERT INTO habits (id, name, emoji, done_dates, created_at)
          VALUES (?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, emoji=excluded.emoji, done_dates=excluded.done_dates`)
          .run(String(h.id), String(h.name), String(h.emoji ?? "✅"), JSON.stringify(h.doneDates ?? []), String(h.createdAt ?? ""));
      }
      removeGone(db, "habits", seen);
    }
    // projects
    if (Array.isArray(snapshot.projects)) {
      const seen = new Set<string>();
      for (const p of snapshot.projects as Record<string, unknown>[]) {
        seen.add(String(p.id));
        db.prepare(`INSERT INTO projects (id, name, emoji, status, tagline, next_steps, blockers, active_items, progress, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, emoji=excluded.emoji, status=excluded.status, tagline=excluded.tagline,
            next_steps=excluded.next_steps, blockers=excluded.blockers, active_items=excluded.active_items, progress=excluded.progress`)
          .run(String(p.id), String(p.name), String(p.emoji ?? "📁"), String(p.status ?? "active"), String(p.tagline ?? ""), JSON.stringify(p.nextSteps ?? []), JSON.stringify(p.blockers ?? []), JSON.stringify(p.activeItems ?? []), Number(p.progress ?? 0), String(p.createdAt ?? ""));
      }
      removeGone(db, "projects", seen);
      // 项目删除后，其里程碑一并清理
      if (Array.isArray(snapshot.milestones)) {
        const projectIds = new Set((snapshot.projects as Record<string, unknown>[]).map((x) => String(x.id)));
        const mRows = db.prepare("SELECT id FROM milestones").all() as { id: string }[];
        for (const m of mRows) {
          const row = db.prepare("SELECT project_id FROM milestones WHERE id = ?").get(String(m.id)) as { project_id: string } | undefined;
          if (row && !projectIds.has(String(row.project_id))) {
            db.prepare("DELETE FROM milestones WHERE id = ?").run(String(m.id));
          }
        }
      }
    }
    // milestones
    if (Array.isArray(snapshot.milestones)) {
      const seen = new Set<string>();
      for (const m of snapshot.milestones as Record<string, unknown>[]) {
        seen.add(String(m.id));
        db.prepare(`INSERT INTO milestones (id, project_id, title, due_date, done)
          VALUES (?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, title=excluded.title, due_date=excluded.due_date, done=excluded.done`)
          .run(String(m.id), String(m.projectId), String(m.title), String(m.dueDate), m.done ? 1 : 0);
      }
      removeGone(db, "milestones", seen);
    }
  } catch {
    // 表不存在时静默（快照仍是主源）
  }
}

/** 删除表中不在快照集合里的记录（防止删除后数据"复活"） */
function removeGone(db: ReturnType<typeof getDb>, table: string, keepIds: Set<string>) {
  const rows = db.prepare(`SELECT id FROM ${table}`).all() as { id: string }[];
  for (const r of rows) {
    if (!keepIds.has(String(r.id))) {
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(String(r.id));
    }
  }
}

/** 从独立表读取并转回前端格式 */
function readTable(table: "goals" | "habits" | "projects" | "milestones"): unknown[] {
  try {
    const db = getDb();
    if (table === "goals") {
      return (db.prepare("SELECT * FROM goals").all() as Record<string, unknown>[]).map((r) => ({
        id: r.id, branchId: r.branch_id, level: r.level, title: r.title, measure: r.measure,
        dueDate: r.due_date, progress: r.progress, done: !!r.done, parentId: r.parent_id, createdAt: r.created_at,
      }));
    }
    if (table === "habits") {
      return (db.prepare("SELECT * FROM habits").all() as Record<string, unknown>[]).map((r) => ({
        id: r.id, name: r.name, emoji: r.emoji, doneDates: JSON.parse(String(r.done_dates || "[]")), createdAt: r.created_at,
      }));
    }
    if (table === "projects") {
      return (db.prepare("SELECT * FROM projects").all() as Record<string, unknown>[]).map((r) => ({
        id: r.id, name: r.name, emoji: r.emoji, status: r.status, tagline: r.tagline,
        nextSteps: JSON.parse(String(r.next_steps || "[]")), blockers: JSON.parse(String(r.blockers || "[]")),
        activeItems: JSON.parse(String(r.active_items || "[]")), progress: r.progress,
        score: r.score ? JSON.parse(String(r.score)) : null,
        createdAt: r.created_at,
      }));
    }
    if (table === "milestones") {
      return (db.prepare("SELECT * FROM milestones").all() as Record<string, unknown>[]).map((r) => ({
        id: r.id, projectId: r.project_id, title: r.title, dueDate: r.due_date, done: !!r.done,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const snapshot = body.snapshot ?? body;
    if (!snapshot || typeof snapshot !== "object") {
      return NextResponse.json({ error: "invalid workspace" }, { status: 400 });
    }

    // 首次迁移：snapshot.tasks → tasks 表（幂等）
    migrateTasksFromSnapshot(snapshot);
    migrateReviewsFromSnapshot(snapshot);

    // 清理 snapshot 里的 tasks 字段（以 tasks 表为准，避免双轨）
    const cleanSnapshot: Record<string, unknown> = { ...snapshot };
    delete cleanSnapshot.tasks;

    // 若 body.tasks 提供（前端保存时），全量同步
    if (Array.isArray(body.tasks)) {
      // 防误清：前端空列表（数据未加载/异常状态）且库中已有任务时，跳过全量替换，保护数据
      const currentTasks = listTasks();
      if (body.tasks.length === 0 && currentTasks.length > 0) {
        // 保留现有任务，不执行删除
      } else {
        const existing = new Set(currentTasks.map((t) => t.id));
        for (const t of body.tasks) {
          const row = t as Partial<TaskRow> & { branchId?: string; branch_id?: string; startTime?: string; completedAt?: string; source?: string; auto?: number; goalId?: string; goal_id?: string };
          if (!row.id) continue;
          upsertTask({
            id: String(row.id),
            branch_id: String(row.branchId ?? row.branch_id ?? "career"),
            title: String(row.title ?? "未命名"),
            date: String(row.date ?? todayLocal()),
            start_time: row.startTime ? String(row.startTime) : row.start_time ? String(row.start_time) : null,
            minutes: Number(row.minutes ?? 60),
            priority: (row.priority as TaskRow["priority"]) ?? "mid",
            status: (row.status as TaskRow["status"]) ?? "todo",
            note: String(row.note ?? ""),
            source: String(row.source ?? "manual"),
            auto: Number(row.auto ?? 0),
            goal_id: row.goalId ? String(row.goalId) : row.goal_id ? String(row.goal_id) : null,
            created_at: String(row.created_at ?? todayLocal()),
            completed_at: row.completedAt ? String(row.completedAt) : row.completed_at ? String(row.completed_at) : null,
          });
          existing.delete(String(row.id));
        }
        // 删除前端已移除的任务
        for (const gone of existing) deleteTask(gone);
      }
    }

    // 同步独立表（goals/habits/projects/milestones）
    syncTables(snapshot);

    saveWorkspaceSnapshot(cleanSnapshot);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
