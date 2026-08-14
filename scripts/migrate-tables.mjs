/**
 * 一次性迁移：workspace 快照 → 独立表（goals/habits/projects/milestones）
 * 运行：node scripts/migrate-tables.mjs
 */
import { DatabaseSync } from "node:sqlite";
import path from "path";

const HOME = process.env.HOME || "";
const DB_FILE = path.join(process.env.NESTLIFE_DATA || path.join(HOME, ".nestlife", "data"), "nestlife.db");

const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY, branch_id TEXT, level TEXT, title TEXT, measure TEXT,
    due_date TEXT, progress INTEGER, done INTEGER, parent_id TEXT, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY, name TEXT, emoji TEXT, done_dates TEXT, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT, emoji TEXT, status TEXT, tagline TEXT,
    next_steps TEXT, blockers TEXT, active_items TEXT, progress INTEGER, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY, project_id TEXT, title TEXT, due_date TEXT, done INTEGER
  );
`);

const row = db.prepare("SELECT snapshot FROM workspace WHERE id = 1").get();
if (!row) {
  console.log("无快照，跳过");
  process.exit(0);
}
const snap = JSON.parse(row.snapshot);

// goals
let n = 0;
const insGoal = db.prepare("INSERT OR IGNORE INTO goals VALUES (?,?,?,?,?,?,?,?,?,?)");
for (const g of snap.goals || []) {
  insGoal.run(g.id, g.branchId, g.level, g.title, g.measure || "", g.dueDate || null, g.progress || 0, g.done ? 1 : 0, g.parentId || null, g.createdAt || "");
  n++;
}
console.log(`goals: ${n}`);

// habits
n = 0;
const insHabit = db.prepare("INSERT OR IGNORE INTO habits VALUES (?,?,?,?,?)");
for (const h of snap.habits || []) {
  insHabit.run(h.id, h.name, h.emoji || "✅", JSON.stringify(h.doneDates || []), h.createdAt || "");
  n++;
}
console.log(`habits: ${n}`);

// projects
n = 0;
const insProj = db.prepare("INSERT OR IGNORE INTO projects VALUES (?,?,?,?,?,?,?,?,?,?)");
for (const p of snap.projects || []) {
  insProj.run(p.id, p.name, p.emoji || "📁", p.status || "active", p.tagline || "", JSON.stringify(p.nextSteps || []), JSON.stringify(p.blockers || []), JSON.stringify(p.activeItems || []), p.progress || 0, p.createdAt || "");
  n++;
}
console.log(`projects: ${n}`);

// milestones
n = 0;
const insMs = db.prepare("INSERT OR IGNORE INTO milestones VALUES (?,?,?,?,?)");
for (const m of snap.milestones || []) {
  insMs.run(m.id, m.projectId, m.title, m.dueDate, m.done ? 1 : 0);
  n++;
}
console.log(`milestones: ${n}`);

console.log("✅ 表拆分完成");
db.close();
