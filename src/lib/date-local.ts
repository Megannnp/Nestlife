/**
 * 本地日期工具 — 修复 UTC 时区 bug
 *
 * 问题：new Date().toISOString().slice(0,10) 返回 UTC 日期，
 * 在 UTC+8 时区每天 0:00-8:00 会错一天（显示成昨天）。
 *
 * 统一用本地时区生成日期字符串。
 */

/** 本地日期 YYYY-MM-DD（offset 天偏移，负=昨天） */
export function todayLocal(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 从 Date 对象取本地日期 YYYY-MM-DD */
export function dateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 本地时间 HH:mm */
export function timeLocal(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 本地时间戳字符串 ISO 格式（保留本地日期部分） */
export function timestampLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
