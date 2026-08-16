/**
 * 周报自动生成 — 每周日 20:00 由 cron 调用
 *
 * 产出：data/reports/周报-YYYY-Wxx.md
 * 内容：任务完成率 / 分支统计 / 项目进度 / 新增决策 / 知识库增量 / 复盘 / 下周建议
 * 顺手做决策闭环：列出超 30 天未复查的已采纳决策
 * 生成后插入周一任务「📊 查看本周周报」提醒老板（不重复插入）
 */
import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

const HOME = process.env.HOME || "";
const DATA_DIR = process.env.NESTLIFE_DATA || path.join(HOME, ".nestlife", "data");
const DB_FILE = path.join(DATA_DIR, "nestlife.db");
const KNOWLEDGE_DIR = path.join(DATA_DIR, "knowledge");
const REPORTS_DIR = path.join(DATA_DIR, "reports");

const BRANCH_LABEL = { career: "🏗️ 事业", growth: "🌱 成长", life: "🏡 生活" };

function getDb() {
  // 数据目录可能不存在（全新部署/CI），先创建
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
  `);
  return db;
}

/** ISO 周：YYYY-Wxx */
function isoWeek(d = new Date()) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); // 周四基准
  const week1 = new Date(t.getFullYear(), 0, 4);
  const week = 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${t.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekRange() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 0=周一
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { start: fmt(monday), end: fmt(sunday) };
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

/** 统计知识库文件数 */
function countKnowledgeFiles() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return { total: 0, recent: 0, weekNew: [] };
  let total = 0;
  let recent = 0;
  const weekNew = [];
  const weekAgo = Date.now() - 7 * 86400000;
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile()) {
        total++;
        const st = fs.statSync(full);
        if (st.mtimeMs > weekAgo) {
          recent++;
          weekNew.push(path.relative(KNOWLEDGE_DIR, full));
        }
      }
    }
  };
  walk(KNOWLEDGE_DIR);
  return { total, recent, weekNew };
}

function runWeeklyReport() {
  const db = getDb();
  const { start, end } = weekRange();
  const week = isoWeek();

  // ── 1. 任务统计（本周） ──
  const taskRows = db
    .prepare("SELECT branch_id, status FROM tasks WHERE date >= ? AND date <= ?")
    .all(start, end);
  const total = taskRows.length;
  const done = taskRows.filter((t) => t.status === "done").length;
  const rate = total === 0 ? 0 : Math.round((done / total) * 100);

  const byBranch = {};
  for (const t of taskRows) {
    byBranch[t.branch_id] = byBranch[t.branch_id] || { total: 0, done: 0 };
    byBranch[t.branch_id].total++;
    if (t.status === "done") byBranch[t.branch_id].done++;
  }

  // 未完成任务（下周建议）
  const pending = db
    .prepare("SELECT title, date FROM tasks WHERE date >= ? AND date <= ? AND status != 'done' ORDER BY date")
    .all(start, end);

  // ── 2. 项目进度（快照） ──
  const snapshot = loadSnapshot(db);
  const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
  const milestones = Array.isArray(snapshot.milestones) ? snapshot.milestones : [];

  // ── 3. 决策（本周新增 + 超 30 天未复查） ──
  let weekDecisions = [];
  let reviewDue = [];
  try {
    const rows = db.prepare("SELECT * FROM decisions").all();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    for (const r of rows) {
      // 本地时区解析（new Date('YYYY-MM-DD') 会按 UTC，边界日错 8 小时）
      const dm = String(r.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const d = dm
        ? new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]))
        : new Date(String(r.created_at || ""));
      if (!isNaN(d.getTime()) && d >= weekAgo) weekDecisions.push(String(r.title));
      if (String(r.status) === "accepted" && !isNaN(d.getTime()) && d < monthAgo) {
        const days = Math.floor((Date.now() - d.getTime()) / 86400000);
        reviewDue.push({ title: String(r.title), days, date: String(r.date || "") });
      }
    }
  } catch {
    // decisions 表可能不存在（老库）→ 跳过
  }

  // ── 4. 知识库 ──
  const kb = countKnowledgeFiles();

  // ── 5. 复盘（本周 weekly） ──
  let weeklyReview = null;
  try {
    const rows = db.prepare("SELECT * FROM reviews WHERE type = 'weekly'").all();
    const target = rows.find((r) => String(r.period) === week);
    if (target) weeklyReview = { good: String(target.good || ""), problems: String(target.problems || ""), next: String(target.next || "") };
  } catch {
    // 无 reviews 表
  }

  // ── 组装 Markdown ──
  const lines = [];
  lines.push(`# 📊 筑巢人生周报 ${week}（${start} ~ ${end}）`);
  lines.push("");
  lines.push(`> 自动生成于 ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
  lines.push("");
  lines.push("## 一、任务完成情况");
  lines.push("");
  if (total === 0) {
    lines.push("本周没有任务记录。");
  } else {
    lines.push(`- 本周任务 **${done} / ${total}**，完成率 **${rate}%**`);
    for (const [bid, s] of Object.entries(byBranch)) {
      const label = BRANCH_LABEL[bid] || bid;
      const r = s.total === 0 ? 0 : Math.round((s.done / s.total) * 100);
      lines.push(`- ${label}：${s.done}/${s.total}（${r}%）`);
    }
  }
  lines.push("");
  lines.push("## 二、项目进度");
  lines.push("");
  if (projects.length === 0) {
    lines.push("暂无项目数据。");
  } else {
    for (const p of projects) {
      const ms = milestones.filter((m) => String(m.projectId) === String(p.id));
      const msDone = ms.filter((m) => m.done).length;
      lines.push(`- **${p.emoji || "📁"} ${p.name}**：${p.progress}%${p.tagline ? `（${p.tagline}）` : ""}${ms.length ? ` · 里程碑 ${msDone}/${ms.length}` : ""}`);
      if (Array.isArray(p.nextSteps) && p.nextSteps.length) {
        lines.push(`  - 下一步：${p.nextSteps.slice(0, 3).join(" / ")}`);
      }
    }
  }
  lines.push("");
  lines.push("## 三、决策记录");
  lines.push("");
  lines.push(`- 本周新增决策：**${weekDecisions.length}** 条`);
  if (weekDecisions.length) weekDecisions.forEach((t) => lines.push(`  - 📌 ${t}`));
  if (reviewDue.length) {
    lines.push("");
    lines.push(`- ⏰ **超 30 天待复查决策 ${reviewDue.length} 条**（ADR 的价值在回头看）：`);
    for (const r of reviewDue) lines.push(`  - 🔁 ${r.title}（${r.date}，已 ${r.days} 天）`);
  }
  lines.push("");
  lines.push("## 四、知识库");
  lines.push("");
  lines.push(`- 累计文档：**${kb.total}** 个文件${kb.recent ? `，本周新增/修改 **${kb.recent}** 个` : ""}`);
  if (kb.weekNew.length) kb.weekNew.slice(0, 10).forEach((f) => lines.push(`  - 📄 ${f}`));
  lines.push("");
  lines.push("## 五、本周复盘");
  lines.push("");
  if (weeklyReview) {
    if (weeklyReview.good) lines.push(`- ✅ 做得好的：${weeklyReview.good}`);
    if (weeklyReview.problems) lines.push(`- ⚠️ 问题：${weeklyReview.problems}`);
    if (weeklyReview.next) lines.push(`- 🎯 下一步：${weeklyReview.next}`);
  } else {
    lines.push("本周未写周复盘（可在「复盘」页补上，周报会引用）。");
  }
  lines.push("");
  lines.push("## 六、下周建议（本周未完成任务）");
  lines.push("");
  if (pending.length === 0) {
    lines.push("本周任务全部完成，可以规划新的挑战 🎉");
  } else {
    for (const p of pending.slice(0, 15)) lines.push(`- [ ] ${p.title}（${p.date}）`);
    if (pending.length > 15) lines.push(`  …等共 ${pending.length} 条`);
  }
  lines.push("");

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const file = path.join(REPORTS_DIR, `周报-${week}.md`);
  fs.writeFileSync(file, lines.join("\n"), "utf8");

  // ── 插入周一提醒任务（不重复） ──
  const monday = new Date(start);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const taskDate = fmt(nextMonday);
  const taskTitle = `📊 查看本周周报（${week}）`;
  const exists = db.prepare("SELECT 1 FROM tasks WHERE title = ? AND date = ?").get(taskTitle, taskDate);
  if (!exists) {
    db.prepare(
      `INSERT INTO tasks (id, branch_id, title, date, start_time, minutes, priority, status, note, source, auto, created_at, completed_at)
       VALUES (?, 'career', ?, ?, NULL, 15, 'mid', 'todo', '周报路径：${file}', '自动汇总', 1, ?, NULL)`
    ).run(`t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, taskTitle, taskDate, new Date().toISOString());
    console.log(`📌 已插入提醒任务：${taskTitle}（${taskDate}）`);
  }

  db.close();
  console.log(`✅ 周报已生成：${file}`);
  return file;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) runWeeklyReport();

export { runWeeklyReport };
