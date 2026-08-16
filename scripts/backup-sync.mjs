/**
 * 异地备份同步 — 本地 data/ → iCloud Drive（灾备）
 *
 * 为什么：SQLite + 备份全在本地，笔记本丢失/损坏 = 全部数据丢失。
 * 方案：每日备份后，把 db + 知识库 + 最近备份同步到 iCloud Drive
 *       （Apple 私人云盘，设备间加密同步），一行脚本，零依赖。
 *
 * iCloud 目录：~/Library/Mobile Documents/com~apple~CloudDocs/筑巢人生备份/NestLife/
 * 由 cron 23:30 与 backup.mjs 串联调用。
 *
 * 保留策略：iCloud 端只保留最近 14 份备份（与本地一致）
 */
import os from "node:os";
import fs from "fs";
import path from "path";

const HOME = os.homedir();
const DATA_DIR = process.env.NESTLIFE_DATA || path.join(HOME, ".nestlife", "data");
const DB_FILE = path.join(DATA_DIR, "nestlife.db");
const KNOWLEDGE_DIR = path.join(DATA_DIR, "knowledge");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

// 异地备份目录（可选：NESTLIFE_ICLOUD_DIR，如 iCloud/网盘同步目录；留空则跳过异地备份）
const ICLOUD_ROOT = process.env.NESTLIFE_ICLOUD_DIR || "";
const KEEP = 14;

/** 递归复制目录（跳过 .git/node_modules/.next） */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith(".") || ["node_modules", ".next", "build"].includes(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) count += copyDir(s, d);
    else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      count++;
    }
  }
  return count;
}

function main() {
  if (!ICLOUD_ROOT) {
    console.log("⚠️ 未配置 NESTLIFE_ICLOUD_DIR，跳过异地备份");
    return;
  }
  if (!fs.existsSync(DB_FILE)) {
    console.log("⚠️ 无数据库文件，跳过异地备份");
    return;
  }

  // 1. 数据库本体
  fs.mkdirSync(ICLOUD_ROOT, { recursive: true });
  fs.copyFileSync(DB_FILE, path.join(ICLOUD_ROOT, "nestlife.db"));
  console.log("✅ 数据库已同步到 iCloud");

  // 2. 知识库（增量覆盖）
  if (fs.existsSync(KNOWLEDGE_DIR)) {
    const n = copyDir(KNOWLEDGE_DIR, path.join(ICLOUD_ROOT, "knowledge"));
    console.log(`✅ 知识库已同步（${n} 个文件）`);
  }

  // 3. 最近备份（保留 14 份）
  if (fs.existsSync(BACKUPS_DIR)) {
    const destBackups = path.join(ICLOUD_ROOT, "backups");
    fs.mkdirSync(destBackups, { recursive: true });
    const backups = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith("nestlife-") && f.endsWith(".db"))
      .sort()
      .slice(-KEEP);
    for (const f of backups) fs.copyFileSync(path.join(BACKUPS_DIR, f), path.join(destBackups, f));
    // 清理 iCloud 端多余的旧备份
    const remote = fs
      .readdirSync(destBackups)
      .filter((f) => f.startsWith("nestlife-") && f.endsWith(".db"))
      .sort();
    while (remote.length > KEEP) {
      const old = remote.shift();
      if (old) fs.unlinkSync(path.join(destBackups, old));
    }
    console.log(`✅ 最近 ${backups.length} 份备份已同步`);
  }

  // 4. 同步时间戳
  fs.writeFileSync(path.join(ICLOUD_ROOT, "last-sync.txt"), new Date().toISOString());

  // 5. 自检：iCloud 目录真实存在且 db 可读
  const remoteDb = path.join(ICLOUD_ROOT, "nestlife.db");
  const ok = fs.existsSync(remoteDb) && fs.statSync(remoteDb).size > 0;
  console.log(ok ? `🎉 异地备份完成：${ICLOUD_ROOT}` : "❌ 异地备份异常：目标文件缺失");
  if (!ok) process.exitCode = 1;
}

main();
