/**
 * 数据备份 — 复制 nestlife.db 到 data/backups/（带日期）
 * 保留最近 14 份
 */
import os from "node:os";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.NESTLIFE_DATA || path.join(os.homedir(), ".nestlife", "data");
const DB_FILE = path.join(DATA_DIR, "nestlife.db");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.log("无数据库文件，跳过备份");
    return;
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const dest = path.join(BACKUP_DIR, `nestlife-${stamp}.db`);

  fs.copyFileSync(DB_FILE, dest);
  console.log(`✅ 备份完成：${dest}`);

  // 清理旧备份（保留 14 份）
  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("nestlife-") && f.endsWith(".db"))
    .sort();
  while (backups.length > 14) {
    const old = backups.shift();
    if (old) {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
      console.log(`清理旧备份：${old}`);
    }
  }
}

main();
