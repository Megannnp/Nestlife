/**
 * 项目活跃度扫描 — 自动感知各项目"最近在不在动"
 *
 * 信号源：
 *  1. 目录最近文件修改时间（mtime）
 *  2. git 最近提交时间（若有仓库）
 *
 * 输出写入 DB 表 project_activity（供事业页展示）
 * 由每日 cron 调用（与 daily-summary 同批）
 */
import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const HOME = process.env.HOME || "";
const DATA_DIR = process.env.NESTLIFE_DATA || path.join(HOME, ".nestlife", "data");
const DB_FILE = path.join(DATA_DIR, "nestlife.db");

/**
 * 项目 → 磁盘位置映射（与事业页 project.id 对应）
 * 通过环境变量 NESTLIFE_PROJECT_DIRS 配置，格式：id=标签@路径1,路径2;id=标签@路径
 * 例：NESTLIFE_PROJECT_DIRS="p-app=我的产品@/srv/myapp;p-blog=博客@~/blog,~/docs/blog"
 * 留空则不扫描本地目录活跃度（活跃度显示"无数据"）。
 */
const PROJECT_DIRS = (process.env.NESTLIFE_PROJECT_DIRS || "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [idAndLabel, dirsPart] = s.split("@");
    const eq = idAndLabel.indexOf("=");
    const projectId = (eq >= 0 ? idAndLabel.slice(0, eq) : idAndLabel).trim();
    const label = (eq >= 0 ? idAndLabel.slice(eq + 1) : projectId).trim();
    return {
      projectId,
      label,
      dirs: (dirsPart || "")
        .split(",")
        .map((d) => d.trim().replace(/^~(?=\/)/, process.env.HOME || ""))
        .filter(Boolean),
    };
  });

/** 扫描目录最近 mtime（跳过噪音目录） */
function newestMtime(dir, depth = 0) {
  if (depth > 3 || !fs.existsSync(dir)) return null;
  let newest = null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (["node_modules", ".next", "dist", "build", "backups", ".git"].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) {
        const sub = newestMtime(full, depth + 1);
        if (sub && (!newest || sub > newest)) newest = sub;
      } else if (e.isFile()) {
        const st = fs.statSync(full);
        if (!newest || st.mtimeMs > newest) newest = st.mtimeMs;
      }
    } catch {
      // skip
    }
  }
  return newest;
}

/** git 最近提交时间（ms） */
function gitLastCommit(dir) {
  try {
    const out = execSync("git log -1 --format=%ct", { cwd: dir, timeout: 5000 }).toString().trim();
    const sec = parseInt(out, 10);
    return Number.isFinite(sec) ? sec * 1000 : null;
  } catch {
    return null;
  }
}

function getDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_activity (
      project_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      last_active_at INTEGER,
      last_git_at INTEGER,
      scanned_at TEXT NOT NULL
    );
  `);
  return db;
}

function main() {
  const db = getDb();
  const now = Date.now();
  const scanAt = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT INTO project_activity (project_id, label, last_active_at, last_git_at, scanned_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      label = excluded.label,
      last_active_at = excluded.last_active_at,
      last_git_at = excluded.last_git_at,
      scanned_at = excluded.scanned_at
  `);

  const results = [];
  for (const p of PROJECT_DIRS) {
    let lastActive = null;
    let lastGit = null;
    for (const d of p.dirs) {
      const mt = newestMtime(d);
      if (mt && (!lastActive || mt > lastActive)) lastActive = mt;
      const g = gitLastCommit(d);
      if (g && (!lastGit || g > lastGit)) lastGit = g;
    }
    upsert.run(p.projectId, p.label, lastActive, lastGit, scanAt);

    const activeDays = lastActive ? Math.max(0, Math.floor((now - lastActive) / 86400000)) : null;
    const gitDays = lastGit ? Math.max(0, Math.floor((now - lastGit) / 86400000)) : null;
    results.push({ id: p.projectId, label: p.label, activeDays, gitDays });
    console.log(`${p.label}: 文件活跃 ${activeDays === null ? "无" : activeDays + " 天前"} | git ${gitDays === null ? "无仓库" : gitDays + " 天前"}`);
  }

  db.close();
  return results;
}

// 直接运行
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  console.log("🔍 项目活跃度扫描：");
  main();
}

export { main as scanProjectActivity };
