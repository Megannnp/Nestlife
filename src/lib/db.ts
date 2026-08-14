import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "fs";
import { todayLocal } from "./date-local.ts";
import { DATA_DIR, DB_FILE } from "./config.ts";

/**
 * NestLife 数据库层 — SQLite（node:sqlite，零依赖）
 * 数据文件：由 NESTLIFE_DATA 指定（默认 ~/.nestlife/data/nestlife.db）
 *
 * 表结构：
 *  - workspace  单行 JSON 快照（attitude/branches/goals/plans/schedule/reminders/
 *               reviews/habits/dailyNotes/projects/milestones 等低频数据）
 *  - tasks      独立表（AI 助手 高频读写：状态同步/新增/完成）
 *               → 今日页单数据源，不再双轨
 */

let db: DatabaseSync | null = null;

/** 关闭并重置数据库连接（备份恢复后调用，强制下次读取新数据） */
export function resetDbConnection() {
  try {
    db?.close();
  } catch {
    /* 忽略 */
  }
  db = null;
}

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      snapshot TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL DEFAULT 'career',
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT,
      minutes INTEGER NOT NULL DEFAULT 60,
      priority TEXT NOT NULL DEFAULT 'mid',
      status TEXT NOT NULL DEFAULT 'todo',
      note TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      auto INTEGER NOT NULL DEFAULT 0,
      goal_id TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
    CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL DEFAULT 'career',
      level TEXT NOT NULL DEFAULT 'mid',
      title TEXT NOT NULL,
      measure TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      done INTEGER NOT NULL DEFAULT 0,
      parent_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '✅',
      done_dates TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '📁',
      status TEXT NOT NULL DEFAULT 'active',
      tagline TEXT NOT NULL DEFAULT '',
      next_steps TEXT NOT NULL DEFAULT '[]',
      blockers TEXT NOT NULL DEFAULT '[]',
      active_items TEXT NOT NULL DEFAULT '[]',
      progress INTEGER NOT NULL DEFAULT 0,
      score TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      period TEXT NOT NULL,
      good TEXT NOT NULL DEFAULT '',
      problems TEXT NOT NULL DEFAULT '',
      next TEXT NOT NULL DEFAULT '',
      mood INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_type_period ON reviews(type, period);

    CREATE TABLE IF NOT EXISTS book_notes (
      id TEXT PRIMARY KEY,
      book TEXT NOT NULL,
      text TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      occurrence INTEGER NOT NULL DEFAULT 1,
      para_index INTEGER,
      start_offset INTEGER,
      end_offset INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_book_notes_book ON book_notes(book);
  `);

  // 迁移：老库 book_notes 表没有 occurrence 列 → 补列（幂等）
  {
    const cols = db.prepare("PRAGMA table_info(book_notes)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "occurrence")) {
      db.exec("ALTER TABLE book_notes ADD COLUMN occurrence INTEGER NOT NULL DEFAULT 1");
    }
    if (!cols.some((c) => c.name === "para_index")) {
      db.exec("ALTER TABLE book_notes ADD COLUMN para_index INTEGER");
      db.exec("ALTER TABLE book_notes ADD COLUMN start_offset INTEGER");
      db.exec("ALTER TABLE book_notes ADD COLUMN end_offset INTEGER");
    }
  }

  // 迁移：老库 tasks 表没有 goal_id 列 → 补列（幂等）
  {
    const cols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "goal_id")) {
      db.exec("ALTER TABLE tasks ADD COLUMN goal_id TEXT");
    }
  }
  // 迁移：老库 projects 表没有 score 列 → 补列（幂等）
  {
    const cols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "score")) {
      db.exec("ALTER TABLE projects ADD COLUMN score TEXT");
    }
  }
  return db;
}

/** ─── workspace 快照 ─── */

export function loadWorkspaceSnapshot(): Record<string, unknown> | null {
  const row = getDb().prepare("SELECT snapshot FROM workspace WHERE id = 1").get() as { snapshot: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.snapshot);
  } catch {
    return null;
  }
}

export function saveWorkspaceSnapshot(snapshot: Record<string, unknown>) {
  const json = JSON.stringify(snapshot);
  getDb()
    .prepare(
      `INSERT INTO workspace (id, snapshot, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`
    )
    .run(json, new Date().toISOString());
}

/** ─── tasks 表 ─── */

export type TaskRow = {
  id: string;
  branch_id: string;
  title: string;
  date: string;
  start_time: string | null;
  minutes: number;
  priority: "high" | "mid" | "low";
  status: "todo" | "doing" | "done" | "deferred";
  note: string;
  source: string;
  auto: number;
  created_at: string;
  completed_at: string | null;
  goal_id: string | null;
};

const TASK_COLS = "id, branch_id, title, date, start_time, minutes, priority, status, note, source, auto, goal_id, created_at, completed_at";

function rowToTask(row: Record<string, unknown>): TaskRow {
  return {
    id: String(row.id),
    branch_id: String(row.branch_id),
    title: String(row.title),
    date: String(row.date),
    start_time: row.start_time ? String(row.start_time) : null,
    minutes: Number(row.minutes),
    priority: row.priority as TaskRow["priority"],
    status: row.status as TaskRow["status"],
    note: String(row.note ?? ""),
    source: String(row.source ?? "manual"),
    auto: Number(row.auto ?? 0),
    goal_id: row.goal_id ? String(row.goal_id) : null,
    created_at: String(row.created_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
  };
}

export function listTasks(date?: string): TaskRow[] {
  const stmt = date
    ? getDb().prepare(`SELECT ${TASK_COLS} FROM tasks WHERE date = ? ORDER BY status = 'done', priority`)
    : getDb().prepare(`SELECT ${TASK_COLS} FROM tasks ORDER BY date DESC, status = 'done', priority`);
  const rows = date ? stmt.all(date) : stmt.all();
  return (rows as Record<string, unknown>[]).map(rowToTask);
}

export function upsertTask(task: Omit<TaskRow, "created_at"> & { created_at?: string }): void {
  getDb()
    .prepare(
      `INSERT INTO tasks (${TASK_COLS})
       VALUES (@id, @branch_id, @title, @date, @start_time, @minutes, @priority, @status, @note, @source, @auto, @goal_id, @created_at, @completed_at)
       ON CONFLICT(id) DO UPDATE SET
         branch_id = excluded.branch_id, title = excluded.title, date = excluded.date,
         start_time = excluded.start_time, minutes = excluded.minutes, priority = excluded.priority,
         status = excluded.status, note = excluded.note, source = excluded.source,
         auto = excluded.auto, goal_id = excluded.goal_id, completed_at = excluded.completed_at`
    )
    .run({ ...task, created_at: task.created_at ?? todayLocal() });
}

/** 允许被 PATCH 更新的任务列（白名单，防止调用方传入任意 SQL 列名） */
const TASK_PATCH_COLS = new Set([
  "branch_id", "title", "date", "start_time", "minutes", "priority", "status",
  "note", "source", "auto", "goal_id", "completed_at",
]);

export function patchTask(id: string, patch: Partial<Omit<TaskRow, "id">>): boolean {
  const keys = Object.keys(patch).filter((k) => TASK_PATCH_COLS.has(k));
  if (keys.length === 0) return false;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  // 只透传白名单列的值，非法 key 完全忽略
  const params: Record<string, SQLInputValue> = { id };
  for (const k of keys) params[k] = (patch as Record<string, unknown>)[k] as SQLInputValue;
  const result = getDb().prepare(`UPDATE tasks SET ${sets} WHERE id = @id`).run(params);
  return Number(result.changes) > 0;
}

export function deleteTask(id: string): boolean {
  const result = getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

/** ─── reviews 表（L4 复盘：日/周/月） ─── */

export type ReviewRow = {
  id: string;
  type: "daily" | "weekly" | "monthly";
  period: string;
  good: string;
  problems: string;
  next: string;
  mood: number;
  created_at: string;
  updated_at: string;
};

const REVIEW_COLS = "id, type, period, good, problems, next, mood, created_at, updated_at";

function rowToReview(row: Record<string, unknown>): ReviewRow {
  return {
    id: String(row.id),
    type: row.type as ReviewRow["type"],
    period: String(row.period),
    good: String(row.good ?? ""),
    problems: String(row.problems ?? ""),
    next: String(row.next ?? ""),
    mood: Number(row.mood ?? 3),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function listReviews(type?: string): ReviewRow[] {
  const stmt = type
    ? getDb().prepare(`SELECT ${REVIEW_COLS} FROM reviews WHERE type = ? ORDER BY period DESC`)
    : getDb().prepare(`SELECT ${REVIEW_COLS} FROM reviews ORDER BY period DESC`);
  const rows = type ? stmt.all(type) : stmt.all();
  return (rows as Record<string, unknown>[]).map(rowToReview);
}

export function getReview(type: string, period: string): ReviewRow | null {
  const row = getDb()
    .prepare(`SELECT ${REVIEW_COLS} FROM reviews WHERE type = ? AND period = ?`)
    .get(type, period) as Record<string, unknown> | undefined;
  return row ? rowToReview(row) : null;
}

export function upsertReview(r: Omit<ReviewRow, "id" | "created_at" | "updated_at">): ReviewRow {
  const existing = getReview(r.type, r.period);
  const now = todayLocal();
  const id = existing?.id ?? `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = existing?.created_at ?? now;
  getDb()
    .prepare(
      `INSERT INTO reviews (id, type, period, good, problems, next, mood, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(type, period) DO UPDATE SET
         good = excluded.good, problems = excluded.problems, next = excluded.next,
         mood = excluded.mood, updated_at = excluded.updated_at`
    )
    .run(id, r.type, r.period, r.good, r.problems, r.next, r.mood, createdAt, now);
  return { id, type: r.type, period: r.period, good: r.good, problems: r.problems, next: r.next, mood: r.mood, created_at: createdAt, updated_at: now };
}

/** ─── book_notes 表（阅读笔记/高亮） ─── */

export type BookNoteRow = {
  id: string;
  book: string;
  text: string;
  note: string;
  occurrence: number;
  paraIndex?: number;
  startOffset?: number;
  endOffset?: number;
  created_at: string;
};

export function listBookNotes(book: string): BookNoteRow[] {
  const rows = getDb()
    .prepare("SELECT id, book, text, note, occurrence, para_index, start_offset, end_offset, created_at FROM book_notes WHERE book = ? ORDER BY created_at DESC")
    .all(book) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    book: String(r.book),
    text: String(r.text),
    note: String(r.note ?? ""),
    occurrence: Number(r.occurrence ?? 1),
    paraIndex: r.para_index != null ? Number(r.para_index) : undefined,
    startOffset: r.start_offset != null ? Number(r.start_offset) : undefined,
    endOffset: r.end_offset != null ? Number(r.end_offset) : undefined,
    created_at: String(r.created_at),
  }));
}

export function addBookNote(
  book: string,
  text: string,
  note: string,
  occurrence = 1,
  loc?: { paraIndex: number; startOffset: number; endOffset: number }
): BookNoteRow {
  const id = `bn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const now = todayLocal();
  getDb()
    .prepare(
      "INSERT INTO book_notes (id, book, text, note, occurrence, para_index, start_offset, end_offset, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      book,
      text,
      note,
      occurrence,
      loc?.paraIndex ?? null,
      loc?.startOffset ?? null,
      loc?.endOffset ?? null,
      now
    );
  return { id, book, text, note, occurrence, paraIndex: loc?.paraIndex, startOffset: loc?.startOffset, endOffset: loc?.endOffset, created_at: now };
}

export function deleteBookNote(id: string): boolean {
  const result = getDb().prepare("DELETE FROM book_notes WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

/** 迁移：把旧 workspace.reviews 数组灌入 reviews 表（幂等） */
export function migrateReviewsFromSnapshot(snapshot: Record<string, unknown>) {
  const reviews = snapshot.reviews;
  if (!Array.isArray(reviews) || reviews.length === 0) return;
  const stmt = getDb().prepare("SELECT COUNT(*) AS c FROM reviews");
  const { c } = stmt.get() as { c: number };
  if (c > 0) return; // 已有数据不重复灌
  for (const r of reviews) {
    const row = r as Record<string, unknown>;
    try {
      const type = String(row.type ?? "daily");
      if (!["daily", "weekly", "monthly"].includes(type)) continue;
      upsertReview({
        type: type as ReviewRow["type"],
        period: String(row.period ?? todayLocal()),
        good: String(row.good ?? ""),
        problems: String(row.problems ?? ""),
        next: String(row.next ?? ""),
        mood: Number(row.mood ?? 3),
      });
    } catch {
      // 跳过坏行
    }
  }
}

/** 按标题模糊匹配（AI 助手 同步任务用） */
export function findTaskByTitle(title: string): TaskRow | null {
  const row = getDb().prepare(`SELECT ${TASK_COLS} FROM tasks WHERE title LIKE ? LIMIT 1`).get(`%${title}%`) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToTask(row) : null;
}

/** 迁移：把旧 workspace.tasks 数组灌入 tasks 表（幂等） */
export function migrateTasksFromSnapshot(snapshot: Record<string, unknown>) {
  const tasks = snapshot.tasks;
  if (!Array.isArray(tasks)) return;
  const stmt = getDb().prepare(`SELECT COUNT(*) AS c FROM tasks`);
  const { c } = stmt.get() as { c: number };
  if (c > 0) return; // 已有数据不重复灌
  for (const t of tasks) {
    const row = t as Record<string, unknown>;
    try {
      upsertTask({
        id: String(row.id ?? `t-${Math.random().toString(36).slice(2, 8)}`),
        branch_id: String(row.branchId ?? "career"),
        title: String(row.title ?? "未命名任务"),
        date: String(row.date ?? todayLocal()),
        start_time: row.startTime ? String(row.startTime) : null,
        minutes: Number(row.minutes ?? 60),
        priority: (row.priority as TaskRow["priority"]) ?? "mid",
        status: (row.status as TaskRow["status"]) ?? "todo",
        note: String(row.note ?? ""),
        source: "manual",
        auto: 0,
        goal_id: row.goalId ? String(row.goalId) : null,
        completed_at: row.completedAt ? String(row.completedAt) : null,
      });
    } catch {
      // 跳过坏行
    }
  }
}
