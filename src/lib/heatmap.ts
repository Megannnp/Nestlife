"use client";

import type { Task } from "./types.ts";
import { dateLocal } from "./date-local.ts";

/**
 * NestLife 执行热力图 — 参照既有 heatmap 设计。
 * 数据源：任务完成记录（completedAt），统计每天完成任务数与分钟数。
 */

export type HeatmapDay = {
  date: string;
  completed: number;
  minutes: number;
};

const monthNames = ["", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const weekDays = ["一", "二", "三", "四", "五"];

/**
 * 从任务列表构建每日执行记录（行动历史）
 *
 * 范围规则：从「首次完成任务」当天开始算到今天；
 * 若记录不足 minDaysBack 天，则回退到 minDaysBack（保持热力图有足够宽度）；
 * 若一条完成记录都没有，返回 hasData=false（前端显示空状态）。
 */
export function buildExecutionDays(
  tasks: Task[],
  minDaysBack: number
): { days: HeatmapDay[]; startDate: string; hasData: boolean } {
  const today = new Date();
  const todayStrDate = dateLocal(today);

  // 收集所有完成日期（completedAt 优先，老数据兜底用任务日期）
  let firstDone: string | null = null;
  for (const t of tasks) {
    if (t.status !== "done") continue;
    const ds = (t.completedAt || t.date || "").slice(0, 10);
    if (!ds) continue;
    if (firstDone === null || ds < firstDone) firstDone = ds;
  }

  if (firstDone === null) {
    return { days: [], startDate: "", hasData: false };
  }

  // 起点 = max(首次完成日, 今天 - minDaysBack + 1)
  const minStart = new Date(today);
  minStart.setDate(minStart.getDate() - minDaysBack + 1);
  const minStartStr = dateLocal(minStart);
  const startStr = firstDone < minStartStr ? firstDone : minStartStr;

  const start = new Date(startStr + "T00:00:00");
  const dayMap = new Map<string, HeatmapDay>();
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const ds = dateLocal(d);
    dayMap.set(ds, { date: ds, completed: 0, minutes: 0 });
  }

  for (const t of tasks) {
    if (t.status !== "done") continue;
    const dateStr = (t.completedAt || t.date || "").slice(0, 10);
    if (dateStr > todayStrDate) continue; // 未来的日期不统计
    const day = dayMap.get(dateStr);
    if (day) {
      day.completed += 1;
      day.minutes += t.minutes || 0;
    }
  }

  const days = Array.from(dayMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { days, startDate: startStr, hasData: true };
}

/** 开始日期展示文案：YYYY.MM.DD */
export function formatHeatmapStart(start: string): string {
  return `${start.split("-")[0]}.${start.split("-")[1]}.${start.split("-")[2]}`;
}

/** 周一起始偏移：星期日=6，星期一~六=0~5 */
export function monBasedOffsetOf(start: string): number {
  const startDayOfWeek = new Date(start).getDay();
  return startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
}

/** 按周切分热力图网格（周一为首列），并生成月份标签 */
export function buildHeatmapGrid(
  days: HeatmapDay[],
  monBasedOffset: number
): {
  grid: (HeatmapDay | null)[][];
  weeks: number;
  months: { label: string; colSpan: number }[];
} {
  const totalSlots = days.length + monBasedOffset;
  const weeks = Math.ceil(totalSlots / 7);
  const grid: (HeatmapDay | null)[][] = [];
  for (let w = 0; w < weeks; w++) {
    const week: (HeatmapDay | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const slotIndex = w * 7 + d;
      if (slotIndex < monBasedOffset) {
        week.push(null);
      } else {
        const dayIndex = slotIndex - monBasedOffset;
        if (dayIndex < days.length) {
          week.push(days[dayIndex]);
        }
      }
    }
    grid.push(week);
  }
  const months: { label: string; colSpan: number }[] = [];
  grid.forEach((week) => {
    const firstDay = week.find((d) => d !== null);
    if (!firstDay) return;
    const month = new Date(firstDay.date).getMonth() + 1;
    const prevMonth = months.length > 0 ? months[months.length - 1] : null;
    if (!prevMonth || prevMonth.label !== monthNames[month]) {
      months.push({ label: monthNames[month], colSpan: 1 });
    } else {
      prevMonth.colSpan++;
    }
  });
  return { grid, weeks, months };
}

/** 左侧星期标签（周一~周五，首尾留空） */
export function buildHeatmapDayLabels(): string[] {
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (i > 0 && i < 6) labels.push(weekDays[i - 1]);
    else labels.push("");
  }
  return labels;
}
