"use client";

import { dateLocal } from "../../lib/date-local.ts";
import { useMemo, useState } from "react";
import type { Workspace } from "../../lib/types.ts";
import { todayStr } from "../../lib/utils.ts";
import {
  buildExecutionDays, buildHeatmapGrid, buildHeatmapDayLabels,
  formatHeatmapStart, monBasedOffsetOf,
} from "../../lib/heatmap.ts";

interface GrowthViewProps {
  workspace: Workspace;
  toggleHabit: (habitId: string) => void;
}

/** 习惯连续天数 */
function habitStreak(doneDates: string[]): number {
  let streak = 0;
  const d = new Date();
  while (true) {
    const ds = dateLocal(d);
    if (doneDates.includes(ds)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

/** 成长页：执行记录 + 论文阶段 + 习惯 + 热力图（复盘在侧边栏独立入口，每日记录在复盘页日复盘） */
export function GrowthView({ workspace, toggleHabit }: GrowthViewProps) {
  const today = todayStr();

  // 执行记录（行动历史）：数据源唯一——热力图范围即统计范围，顶部与图一致
  const heat = useMemo(() => buildExecutionDays(workspace.tasks, 26 * 7), [workspace.tasks]);
  const stats = useMemo(() => {
    const completedCount = heat.days.reduce((s, d) => s + d.completed, 0);
    const totalMinutes = heat.days.reduce((s, d) => s + d.minutes, 0);
    return { hasData: heat.hasData, startDate: heat.startDate, doneCount: completedCount, totalMinutes };
  }, [heat]);

  // 热力图网格（基于同一份 heat 数据）
  const { heatmapGrid, months, dayLabels } = useMemo(() => {
    const offset = monBasedOffsetOf(heat.startDate);
    const { grid, months } = buildHeatmapGrid(heat.days, offset);
    return { heatmapGrid: grid, months, dayLabels: buildHeatmapDayLabels() };
  }, [heat]);

  const [tooltip, setTooltip] = useState<{ date: string; top: number; left: number } | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {/* 习惯追踪 */}
      <section className="workspace-pane">
        <div className="section-label mb-3">习惯 · 连续天数</div>
        <div className="flex flex-col">
          {workspace.habits.map((h) => {
            const streak = habitStreak(h.doneDates);
            const done = h.doneDates.includes(today);
            return (
              <button
                key={h.id}
                onClick={() => toggleHabit(h.id)}
                className="flex items-center gap-3 py-2.5 border-b border-[#F1F1F3] last:border-0 text-left hover:bg-[#F8F8F9] px-2 -mx-2 rounded-[8px] transition-colors"
              >
                <span className="text-[16px] w-[24px] text-center shrink-0">{h.emoji}</span>
                <span className={`flex-1 text-[13px] ${done ? "text-[#18181B]" : "text-[#71717A]"}`}>{h.name}</span>
                {streak > 0 && (
                  <span className="text-[12px] text-[#D97706] font-semibold shrink-0">🔥 {streak} 天</span>
                )}
                <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] shrink-0 ${
                  done ? "bg-[#27272A] border-[#27272A] text-white" : "border-[#D4D4D8] text-transparent"
                }`}>✓</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 执行记录 · 行动历史 */}
      <section className="workspace-pane">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="section-label">执行记录 · 行动历史</div>
            <div className="text-[12px] text-[#A1A1AA] mt-1">
              {stats.hasData
                ? `从 ${formatHeatmapStart(stats.startDate)} 起 · 完成 ${stats.doneCount} 项 · ${Math.round(stats.totalMinutes / 60)} 小时`
                : "还没有执行记录，完成第一个任务后这里会自动生成"}
            </div>
          </div>
          {stats.hasData && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
              <span>少</span>
              {["#F1F1F3", "#D4D4D8", "#A1A1AA", "#71717A", "#27272A"].map((c) => (
                <span key={c} className="w-[10px] h-[10px] rounded-[2px]" style={{ backgroundColor: c }} />
              ))}
              <span>多</span>
            </div>
          )}
        </div>
        {!stats.hasData ? (
          <div className="py-12 text-center">
            <div className="text-[32px] mb-2">🕐</div>
            <div className="text-[13px] text-[#A1A1AA]">这里是你完成任务的行动地图</div>
            <div className="text-[12px] text-[#A1A1AA] mt-1">在今日页勾掉一个任务，第一个格子就会出现。</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <div className="w-max mx-auto" style={{ paddingRight: 24 }}>
            <div className="flex gap-[3px] mb-[3px] ml-[29px]">
              {months.map((m, i) => (
                <div key={i} className="text-[9px] text-[#A1A1AA] leading-none h-[12px] whitespace-nowrap" style={{ width: `${Math.max(m.colSpan * 16 - 3, 30)}px` }}>
                  {m.label}
                </div>
              ))}
            </div>
            <div className="flex gap-[3px]">
              <div className="flex flex-col gap-[3px] mr-[3px]">
                {dayLabels.map((label, i) => (
                  <div key={i} className="text-[9px] text-[#A1A1AA] leading-none w-[24px] h-[13px] flex items-center justify-end pr-[3px]">
                    {label}
                  </div>
                ))}
              </div>
              {heatmapGrid.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day, di) => {
                    if (day === null) return <div key={`pad-${wi}-${di}`} className="w-[13px] h-[13px]" />;
                    const isFuture = day.date > today;
                    const isToday = day.date === today;
                    const level = isFuture ? 0 : day.completed >= 4 ? 4 : day.completed >= 3 ? 3 : day.completed >= 2 ? 2 : day.completed >= 1 ? 1 : 0;
                    let color = "bg-[#F1F1F3]";
                    if (!isFuture && level === 1) color = "bg-[#D4D4D8]";
                    else if (!isFuture && level === 2) color = "bg-[#A1A1AA]";
                    else if (!isFuture && level === 3) color = "bg-[#71717A]";
                    else if (!isFuture && level === 4) color = "bg-[#27272A]";
                    return (
                      <button
                        key={day.date}
                        type="button"
                        title={day.date}
                        className={`w-[13px] h-[13px] rounded-[2px] ${color} cursor-pointer border-0 p-0 ${isToday ? "ring-[1px] ring-[#52525B]" : ""}`}
                        onMouseEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setTooltip({ date: day.date, top: r.top, left: r.left });
                          setTooltipVisible(true);
                        }}
                        onMouseLeave={() => setTooltipVisible(false)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
        {tooltip && (
          <div
            className="absolute z-50 bg-[#27272A] text-white px-[10px] py-[6px] rounded-[6px] pointer-events-none max-w-[190px]"
            style={{ top: tooltip.top - 44, left: tooltip.left + 18, opacity: tooltipVisible ? 1 : 0, transition: "opacity 120ms ease" }}
          >
            <div className="text-[13px] font-medium leading-[1.3] text-white/90">{tooltip.date.split("-").join(".")}</div>
            <div className="text-[12px] leading-[1.3] text-white/75 mt-[1px]">
              {(() => {
                const day = heat.days.find((d) => d.date === tooltip.date);
                if (tooltip.date > today) return "尚未到达";
                if (day && (day.completed > 0 || day.minutes > 0)) return `${day.minutes} 分钟 · ${day.completed} 项任务`;
                return "暂无执行记录";
              })()}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}