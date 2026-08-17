"use client";

/** 通用工具函数 */

export function makeId(prefix = "id"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 今天日期 YYYY-MM-DD（本地时区） */
export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 日期字符串（YYYY-MM-DD）偏移 N 天：如 shiftDate("2026-08-17", -1) → "2026-08-16" */
export function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 格式化日期为 8月3日 周一 样式 */
export function formatDateCN(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
}

/** 当前时间 HH:mm */
export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 分钟数 → "1h30m" 样式 */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}

/** 分支状态灯文案 */
export function branchStatusText(status: string): { label: string; color: string } {
  switch (status) {
    case "on_track":
      return { label: "正常", color: "#059669" };
    case "attention":
      return { label: "关注", color: "#D97706" };
    case "risk":
      return { label: "风险", color: "#DC2626" };
    default:
      return { label: "正常", color: "#059669" };
  }
}

/** 任务优先级文案 */
export function priorityText(p: string): string {
  switch (p) {
    case "high":
      return "高";
    case "mid":
      return "中";
    default:
      return "低";
  }
}

/** 按日期过滤任务 */
export function tasksOfDate<T extends { date: string }>(tasks: T[], date: string): T[] {
  return tasks.filter((t) => t.date === date);
}

/** 分支完成率 */
export function branchProgress(branchId: string, goals: { branchId: string; progress: number }[]): number {
  const list = goals.filter((g) => g.branchId === branchId);
  if (list.length === 0) return 0;
  return Math.round(list.reduce((s, g) => s + g.progress, 0) / list.length);
}
