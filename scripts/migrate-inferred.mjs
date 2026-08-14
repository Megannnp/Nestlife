/**
 * 一次性迁移：data/inferred-tasks.json → SQLite tasks 表
 * 运行：node scripts/migrate-inferred.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "nestlife.db");
const INFERRED_FILE = path.join(DATA_DIR, "inferred-tasks.json");

if (!fs.existsSync(INFERRED_FILE)) {
  console.log("无 inferred-tasks.json，跳过");
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(INFERRED_FILE, "utf-8"));
const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
if (tasks.length === 0) {
  console.log("无推断任务，跳过");
  process.exit(0);
}

const db = new DatabaseSync(DB_FILE);
db.exec(`
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
    created_at TEXT NOT NULL,
    completed_at TEXT
  );
`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO tasks (id, branch_id, title, date, start_time, minutes, priority, status, note, source, auto, created_at, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
`);

let count = 0;
for (const t of tasks) {
  const id = String(t.id ?? `auto-${Math.random().toString(36).slice(2, 8)}`);
  // 跳过已存在的 id
  const exists = db.prepare("SELECT 1 FROM tasks WHERE id = ?").get(id);
  if (exists) continue;
  insert.run(
    id,
    String(t.branchId ?? "career"),
    String(t.title),
    String(t.date ?? new Date().toISOString().slice(0, 10)),
    t.startTime ? String(t.startTime) : null,
    Number(t.minutes ?? 60),
    String(t.priority ?? "mid"),
    String(t.status ?? "todo"),
    String(t.note ?? ""),
    String(t.source ?? "对话"),
    String(t.createdAt ?? new Date().toISOString().slice(0, 10)),
    t.completedAt ? String(t.completedAt) : null,
  );
  count++;
}

console.log(`✅ 已迁移 ${count} 条推断任务到 SQLite`);

// 迁移完成后重命名旧文件（保留备份）
fs.renameSync(INFERRED_FILE, INFERRED_FILE + ".bak");
console.log("旧文件已备份为 inferred-tasks.json.bak");
