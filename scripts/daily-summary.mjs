import { DatabaseSync } from "node:sqlite";
import path from "path";

/**
 * 每日自动汇总 — 生成今日任务（cron 7:00 调用）
 * 1. 结转昨日未完成任务 → 今天
 * 2. 7 天内到期的里程碑 → 提示任务
 * 3. 例行任务（时刻表高价值时段）
 */

const DATA_DIR = process.env.NESTLIFE_DATA || path.join(process.env.HOME || "", ".nestlife", "data");
const DB_FILE = path.join(DATA_DIR, "nestlife.db");

function getDb() {
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
    CREATE TABLE IF NOT EXISTS workspace (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      snapshot TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      context TEXT DEFAULT '',
      decision TEXT DEFAULT '',
      rationale TEXT DEFAULT '',
      alternatives TEXT DEFAULT '',
      branch_id TEXT DEFAULT 'career',
      status TEXT DEFAULT 'accepted',
      date TEXT DEFAULT '',
      source TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function dayStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  // 本地日期（修复 UTC 时区 bug：凌晨会错一天）
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function loadSnapshot(db) {
  const row = db.prepare("SELECT snapshot FROM workspace WHERE id = 1").get();
  if (!row) return {};
  try {
    return JSON.parse(row.snapshot);
  } catch {
    return {};
  }
}

function runDailySummary() {
  const db = getDb();
  const today = dayStr(0);
  const yesterday = dayStr(-1);
  const details = [];
  let generated = 0;

  // 1. 结转昨日未完成任务
  const yesterdayPending = db
    .prepare("SELECT * FROM tasks WHERE date = ? AND status != 'done'")
    .all(yesterday);

  for (const t of yesterdayPending) {
    const title = String(t.title || "");
    if (!title) continue;
    const exists = db.prepare("SELECT 1 FROM tasks WHERE date = ? AND title = ?").get(today, title);
    if (exists) continue;

    const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(
      `INSERT INTO tasks (id, branch_id, title, date, start_time, minutes, priority, status, note, source, auto, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', ?, '自动汇总', 1, ?, NULL)`
    ).run(
      id,
      String(t.branch_id || "career"),
      title,
      today,
      t.start_time ? String(t.start_time) : null,
      Number(t.minutes || 60),
      String(t.priority || "mid"),
      `昨日结转：${t.note ? String(t.note) : "未完成"}`.slice(0, 200),
      today
    );
    generated++;
    details.push(`结转：${title}`);
  }

  // 2. 里程碑：7 天内到期
  const snapshot = loadSnapshot(db);
  const milestones = Array.isArray(snapshot.milestones) ? snapshot.milestones : [];
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 86400000);

  for (const m of milestones) {
    if (m.done) continue;
    const due = String(m.dueDate || "");
    if (!due) continue;
    // 按本地时区解析 YYYY-MM-DD（new Date('YYYY-MM-DD') 会按 UTC，导致到期日重复/错位）
    const dm = due.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dueDate = dm ? new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])) : new Date(due);
    if (dueDate < now || dueDate > in7Days) continue;

    const title = `⚠️ 里程碑：${String(m.title || "")}`;
    const exists = db.prepare("SELECT 1 FROM tasks WHERE date = ? AND title = ?").get(today, title);
    if (exists) continue;

    const project = Array.isArray(snapshot.projects)
      ? snapshot.projects.find((p) => String(p.id) === String(m.projectId || ""))
      : undefined;
    const branch = project ? String(project.branchId || "career") : "career";
    const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);

    const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(
      `INSERT INTO tasks (id, branch_id, title, date, start_time, minutes, priority, status, note, source, auto, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, 'high', 'todo', ?, '自动汇总', 1, ?, NULL)`
    ).run(id, branch, title, today, null, 30, `截止 ${due}，还有 ${daysLeft} 天`, today);
    generated++;
    details.push(`里程碑：${String(m.title || "")}（${due}）`);
  }

  // 3.5 决策复查：accepted 决策超 30 天 → 生成复查任务（决策室闭环）
  try {
    const accepted = db.prepare("SELECT id, title, created_at FROM decisions WHERE status = 'accepted'").all();
    const nowMs = Date.now();
    for (const d of accepted) {
      const created = d.created_at ? new Date(String(d.created_at)) : null;
      if (!created || isNaN(created.getTime())) continue;
      if (nowMs - created.getTime() < 30 * 86400000) continue;
      const title = `🔁 复查决策：${String(d.title || "").slice(0, 30)}`;
      const exists = db.prepare("SELECT 1 FROM tasks WHERE date = ? AND title = ?").get(today, title);
      if (exists) continue;
      const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      db.prepare(
        `INSERT INTO tasks (id, branch_id, title, date, start_time, minutes, priority, status, note, source, auto, created_at, completed_at)
         VALUES (?, 'career', ?, ?, NULL, 15, 'mid', 'todo', '决策已过 30 天，回头看一眼是否仍然有效', '自动汇总', 1, ?, NULL)`
      ).run(id, title, today, today);
      generated++;
      details.push(`决策复查：${title}`);
    }
  } catch (e) {
    details.push(`决策复查跳过：${e.message}`);
  }

  // 3. 例行任务（时刻表高价值时段）
  const schedule = Array.isArray(snapshot.schedule) ? snapshot.schedule : [];
  const routineMap = {
    "07:00": { title: "上午 AI 学习", branch: "growth", minutes: 180 },
    "14:00": { title: "下午 学术 / 创业推进", branch: "career", minutes: 180 },
    "19:30": { title: "晚上 课程 / 品牌运营", branch: "career", minutes: 120 },
  };
  for (const s of schedule) {
    const time = String(s.time || "");
    const routine = routineMap[time];
    if (!routine) continue;
    const exists = db.prepare("SELECT 1 FROM tasks WHERE date = ? AND title = ?").get(today, routine.title);
    if (exists) continue;
    const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(
      `INSERT INTO tasks (id, branch_id, title, date, start_time, minutes, priority, status, note, source, auto, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, 'mid', 'todo', '例行', '自动汇总', 1, ?, NULL)`
    ).run(id, routine.branch, routine.title, today, time, routine.minutes, today);
    generated++;
    details.push(`例行：${routine.title}（${time}）`);
  }

  db.close();
  return { generated, details };
}

// 直接运行
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const result = runDailySummary();
  console.log(`✅ 每日汇总完成：生成 ${result.generated} 条任务`);
  result.details.forEach((d) => console.log("  -", d));
}

export { runDailySummary };

