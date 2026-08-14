import { NextResponse } from "next/server";
import { DatabaseSync } from "node:sqlite";
import { DB_FILE } from "../../../../lib/config.ts";

/**
 * /api/projects/activity — 项目活跃度（自动感知）
 * 读取 project_activity 表（由 cron 每日扫描更新）
 */

export async function GET() {
  let rows: { project_id: string; label: string; last_active_at: number | null; last_git_at: number | null; scanned_at: string }[] = [];
  try {
    const db = new DatabaseSync(DB_FILE);
    rows = db.prepare("SELECT project_id, label, last_active_at, last_git_at, scanned_at FROM project_activity").all() as typeof rows;
    db.close();
  } catch {
    // 表不存在（首次）→ 空
  }

  const now = Date.now();
  const activities = rows.map((r) => {
    const activeDays = r.last_active_at ? Math.max(0, Math.floor((now - r.last_active_at) / 86400000)) : null;
    const gitDays = r.last_git_at ? Math.max(0, Math.floor((now - r.last_git_at) / 86400000)) : null;
    // 活跃状态：3 天内=活跃，3-7=放缓，>7=停滞
    let state: "active" | "slow" | "stale" = "stale";
    const ref = Math.min(activeDays ?? Infinity, gitDays ?? Infinity);
    if (ref <= 3) state = "active";
    else if (ref <= 7) state = "slow";
    return {
      projectId: r.project_id,
      label: r.label,
      activeDays,
      gitDays,
      state,
      scannedAt: r.scanned_at,
    };
  });

  return NextResponse.json({ activities, scannedAt: rows[0]?.scanned_at ?? null });
}
