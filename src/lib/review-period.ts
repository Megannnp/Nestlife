/**
 * 复盘周期工具：日 / 周（ISO）/ 月 的键与范围计算。
 * 日：YYYY-MM-DD　周：YYYY-Www（ISO 8601）　月：YYYY-MM
 */
import { dateLocal } from "./date-local.ts";

/** 日期 → ISO 周键（YYYY-Www） */
export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; // 1=Mon..7=Sun
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** 周键（YYYY-Www）→ 该周周一/周日（YYYY-MM-DD） */
export function weekRange(weekKey: string): { start: string; end: string } {
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return { start: weekKey, end: weekKey };
  const [y, w] = [Number(m[1]), Number(m[2])];
  const jan1 = new Date(y, 0, 1);
  const jan1Day = jan1.getDay() || 7; // 1=Mon..7=Sun
  const monday = new Date(y, 0, 1 + (w - 1) * 7 - jan1Day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: dateLocal(monday), end: dateLocal(sunday) };
}

/** 今天 → 三种 period 键 */
export function currentPeriods(now = new Date()): { daily: string; weekly: string; monthly: string } {
  return {
    daily: dateLocal(now),
    weekly: isoWeekKey(now),
    // 用本地日期取月（toISOString 是 UTC，东八区每月 1 日 0-8 点会错一个月）
    monthly: dateLocal(now).slice(0, 7),
  };
}

/** 当月键的日期范围（YYYY-MM → 月初到月末） */
export function monthRange(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(last).padStart(2, "0")}`,
  };
}

/** 周显示名：2026-W32 → "8月第2周（08-03 ~ 08-09）"（尽力而为，失败则原样） */
export function weekLabel(weekKey: string): string {
  const { start, end } = weekRange(weekKey);
  return `${start} ~ ${end}`;
}
