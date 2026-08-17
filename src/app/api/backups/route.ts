import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { resetDbConnection } from "../../../lib/db.ts";
import { BACKUP_DIR, DB_FILE } from "../../../lib/config.ts";

/**
 * /api/backups — 备份管理
 *  GET    列出备份文件
 *  POST   { action: "restore", file: "nestlife-xxxx.db" } 恢复指定备份
 *  POST   { action: "backup" } 立即备份
 */

export async function GET() {
  if (!fs.existsSync(BACKUP_DIR)) return NextResponse.json({ backups: [] });
  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("nestlife-") && f.endsWith(".db"))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return NextResponse.json({ backups });
}

export async function POST(req: Request) {
  const { action, file } = await req.json();

  // 立即备份
  if (action === "backup") {
    if (!fs.existsSync(DB_FILE)) return NextResponse.json({ error: "no db" }, { status: 400 });
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const dest = path.join(BACKUP_DIR, `nestlife-${stamp}.db`);
    fs.copyFileSync(DB_FILE, dest);
    try { fs.chmodSync(dest, 0o600); } catch { /* 权限收紧失败不阻塞 */ }
    return NextResponse.json({ ok: true, name: `nestlife-${stamp}.db` });
  }

  // 恢复备份
  if (action === "restore") {
    if (!file || !/^nestlife-[0-9_]+\.db$/.test(file)) {
      return NextResponse.json({ error: "invalid file name" }, { status: 400 });
    }
    const src = path.join(BACKUP_DIR, file);
    if (!fs.existsSync(src)) return NextResponse.json({ error: "backup not found" }, { status: 404 });
    // 恢复前先备份当前
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `nestlife-pre-restore-${stamp}.db`));
    }
    fs.copyFileSync(src, DB_FILE);
    try { fs.chmodSync(DB_FILE, 0o600); } catch { /* 同上 */ }
    // 强制重连，避免旧连接读到缓存页（恢复后前端刷新即见新数据）
    resetDbConnection();
    return NextResponse.json({ ok: true, restored: file });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
