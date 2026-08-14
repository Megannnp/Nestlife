import { NextResponse } from "next/server";
import { getDb, listReviews, getReview, upsertReview } from "../../../lib/db.ts";
import { weekRange, monthRange } from "../../../lib/review-period.ts";
import { todayLocal } from "../../../lib/date-local.ts";

/**
 * /api/reviews — L4 复盘（日/周/月）
 *  GET  ?type=daily|weekly|monthly&period=YYYY-MM-DD|YYYY-Www|YYYY-MM
 *       → { review: 当前期间复盘(或 null), stats: 自动统计, history: 历史列表 }
 *  POST { type, period, good, problems, next, mood } → upsert
 */

function periodRange(type: string, period: string): { start: string; end: string } {
  if (type === "daily") return { start: period, end: period };
  if (type === "weekly") return weekRange(period);
  if (type === "monthly") return monthRange(period);
  return { start: period, end: period };
}

/** 自动统计：任务完成、习惯打卡、里程碑（周/月维度） */
function computeStats(type: string, period: string) {
  const { start, end } = periodRange(type, period);
  const db = getDb();

  // 任务统计
  const taskRows = db
    .prepare("SELECT status, minutes FROM tasks WHERE date >= ? AND date <= ?")
    .all(start, end) as { status: string; minutes: number }[];
  const total = taskRows.length;
  const done = taskRows.filter((t) => t.status === "done").length;
  const minutes = taskRows.reduce((s, t) => s + Number(t.minutes || 0), 0);
  const doneMinutes = taskRows.filter((t) => t.status === "done").reduce((s, t) => s + Number(t.minutes || 0), 0);

  // 习惯打卡（done_dates 为 JSON 数组，含范围内任意日期即算打卡一次）
  const habitRows = db.prepare("SELECT name, done_dates FROM habits").all() as { name: string; done_dates: string }[];
  let habitChecks = 0;
  for (const h of habitRows) {
    try {
      const dates = JSON.parse(String(h.done_dates || "[]")) as string[];
      if (dates.some((d) => d >= start && d <= end)) habitChecks += 1;
    } catch { /* 忽略坏数据 */ }
  }

  // 里程碑 / 项目（周、月复盘看进度用）
  const milestoneRows = db.prepare("SELECT title, done FROM milestones WHERE due_date >= ? AND due_date <= ?").all(start, end) as { title: string; done: number }[];
  const milestones = milestoneRows.map((m) => ({ title: m.title, done: !!m.done }));

  return { start, end, total, done, minutes, doneMinutes, habitChecks, milestones };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "daily";
  const period = searchParams.get("period") || todayLocal();

  if (!["daily", "weekly", "monthly"].includes(type)) {
    return NextResponse.json({ error: "type must be daily|weekly|monthly" }, { status: 400 });
  }

  const review = getReview(type, period);
  const stats = computeStats(type, period);
  const history = listReviews(type).slice(0, 60);
  return NextResponse.json({ review, stats, history });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, period, good, problems, next, mood } = body;
    if (!["daily", "weekly", "monthly"].includes(type) || !period) {
      return NextResponse.json({ error: "type and period required" }, { status: 400 });
    }
    const saved = upsertReview({
      type,
      period: String(period),
      good: String(good ?? ""),
      problems: String(problems ?? ""),
      next: String(next ?? ""),
      mood: Number(mood ?? 3),
    });
    return NextResponse.json({ ok: true, review: saved });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
