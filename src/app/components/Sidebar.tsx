"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LifeView, Workspace } from "../../lib/types.ts";
import { todayStr } from "../../lib/utils.ts";
import {
  buildExecutionDays, buildHeatmapGrid, buildHeatmapDayLabels,
  formatHeatmapStart, monBasedOffsetOf,
} from "../../lib/heatmap.ts";
import { mergeNavConfig, MAIN_KEYS, TOOLS_KEYS } from "../../lib/nav-config.ts";

interface SidebarProps {
  activeView: LifeView;
  setActiveView: (v: LifeView) => void;
  workspace: Workspace;
  todayTasksDone: number;
  todayTasksTotal: number;
}

export function Sidebar({ activeView, setActiveView, workspace, todayTasksDone, todayTasksTotal }: SidebarProps) {
  const todayProgress = todayTasksTotal > 0 ? Math.round((todayTasksDone / todayTasksTotal) * 100) : 0;

  // 菜单按用户配置渲染（改名/图标/隐藏/区内排序）
  const navItems = useMemo(() => mergeNavConfig(workspace.navConfig), [workspace.navConfig]);
  const navMain = navItems.filter((n) => MAIN_KEYS.includes(n.key));
  const navTools = navItems.filter((n) => TOOLS_KEYS.includes(n.key));

  // ─── 执行记录热力图：从首次完成任务起算（与成长页同一数据源） ───
  const heat = useMemo(() => buildExecutionDays(workspace.tasks, 15 * 7), [workspace.tasks]);
  const { heatmapGrid, months, dayLabels, startLabel } = useMemo(() => {
    if (!heat.hasData) {
      return { heatmapGrid: [] as (typeof heat.days)[number][][], months: [] as { label: string; colSpan: number }[], dayLabels: buildHeatmapDayLabels(), startLabel: "" };
    }
    const offset = monBasedOffsetOf(heat.startDate);
    const { grid, months } = buildHeatmapGrid(heat.days, offset);
    return {
      heatmapGrid: grid,
      months,
      dayLabels: buildHeatmapDayLabels(),
      startLabel: formatHeatmapStart(heat.startDate),
    };
  }, [heat]);

  // 折叠状态（localStorage 记忆，参考既有产品）
  const [heatmapExpanded, setHeatmapExpanded] = useState(() => {
    try {
      const stored = window.localStorage.getItem("nestlife-heatmap-expanded");
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch {
      /* 忽略 */
    }
    return true;
  });
  const toggleHeatmap = () => {
    setHeatmapExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("nestlife-heatmap-expanded", next ? "1" : "0");
      } catch {
        /* 忽略 */
      }
      return next;
    });
  };

  const [tooltip, setTooltip] = useState<{ date: string; top: number; left: number } | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const heatmapRef = useRef<HTMLDivElement | null>(null);

  // 展开时默认定位到最新日期（最右），只看历史时向左滑
  useEffect(() => {
    if (!heatmapExpanded || !heat.hasData) return;
    const el = heatmapRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [heatmapExpanded, heat.days.length, heat.hasData]);

  const onCellMouseEnter = (e: React.MouseEvent<Element>, date: string) => {
    const aside = heatmapRef.current?.closest("aside");
    if (!aside) return;
    const cell = e.currentTarget.getBoundingClientRect();
    const box = aside.getBoundingClientRect();
    const left = Math.min(cell.left - box.left + aside.scrollLeft, box.width - 200);
    const top = cell.top - box.top + aside.scrollTop - 46;
    setTooltip({ date, top, left: Math.max(4, left) });
    setTooltipVisible(true);
  };
  const onCellMouseLeave = () => setTooltipVisible(false);

  // 点击格子：显示弹窗 + 跳转复盘页并定位到当天（对齐既有产品点击行为）
  const onCellClick = (e: React.MouseEvent<Element>, date: string) => {
    onCellMouseEnter(e, date);
    try {
      window.sessionStorage.setItem("nestlife-review-period", date);
    } catch {
      /* 忽略 */
    }
    setActiveView("reviews");
  };

  const today = todayStr();

  return (
    <aside className="fixed top-0 left-0 h-screen w-[240px] z-10 hidden lg:flex flex-col bg-white/82 backdrop-blur-[18px] border-r border-[#E4E4E7] px-5 py-4 gap-3 overflow-y-auto overflow-x-hidden">
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-9 h-9 shrink-0 rounded-[9px] bg-[#E4E4E7] flex items-center justify-center text-[16px]">🪺</div>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-semibold leading-[1.2] text-[#18181B]">筑巢人生</div>
          <div className="text-[11px] leading-[1.4] text-[#71717A] mt-[1px]">NestLife</div>
        </div>
      </div>

      {/* 今日任务（菜单上方，随时可见） */}
      <div className="border-t border-[#F1F1F3] pt-3">
        <div className="flex justify-between items-center">
          <span className="text-[12px] text-[#71717A]">今日任务</span>
          <span className="text-[12px] text-[#71717A]">
            完成 <span className="text-[14px] font-semibold text-[#18181B]">{todayTasksDone}</span> / {todayTasksTotal}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[#F1F1F3] overflow-hidden mt-2">
          <div className="h-full rounded-full bg-[#27272A] transition-all duration-300" style={{ width: `${todayProgress}%` }} />
        </div>
      </div>

      {/* 导航：主区 + 工具区 */}
      <nav className="flex flex-col gap-1 mt-3">
        {navMain.map((item) => {
          const active = activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key as LifeView)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] font-semibold transition-colors ${
                active ? "bg-[#EDEDED] text-[#18181B]" : "text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#18181B]"
              }`}
            >
              <span className="text-[14px]">{item.icon}</span>
              {item.label}
            </button>
          );
        })}

        <div className="mt-2 mb-0.5 px-3 text-[10px] font-semibold tracking-[0.08em] text-[#A1A1AA] select-none">工具</div>
        {navTools.map((item) => {
          const active = activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key as LifeView)}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-colors ${
                active ? "bg-[#EDEDED] text-[#18181B]" : "text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#18181B]"
              }`}
            >
              <span className="text-[13px]">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* 执行记录热力图（默认展开，可收起；参考既有产品） */}
      <div className="border-t border-[#E4E4E7] mt-3 pt-3 w-full min-w-0 max-w-full">
        <button
          type="button"
          onClick={toggleHeatmap}
          aria-expanded={heatmapExpanded}
          className="w-full flex items-center justify-between gap-2 mb-2 cursor-pointer text-left"
        >
          <span className="text-[12px] font-semibold leading-[1.4] text-[#18181B] shrink-0">执行记录</span>
          <span className="text-[10px] leading-[1.4] text-[#A1A1AA] shrink-0 whitespace-nowrap">
            {heatmapExpanded ? "收起 ▴" : startLabel ? `开始于 ${startLabel} ▾` : "展开 ▾"}
          </span>
        </button>
        {heatmapExpanded && !heat.hasData && (
          <div className="text-[12px] text-[#A1A1AA] py-3 px-1 leading-[1.7]">
            还没有执行记录。完成今天的任务后，这里会显示你的行动轨迹。
          </div>
        )}
        {heatmapExpanded && heat.hasData && (
        <div className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden no-scrollbar" ref={heatmapRef}>
          <div className="w-max" style={{ paddingRight: 24 }}>
            <div className="flex gap-[2px] mb-[2px] ml-[29px]">
              {months.map((m, i) => (
                <div key={i} className="text-[9px] text-[#A1A1AA] leading-none h-[12px] whitespace-nowrap" style={{ width: `${Math.max(m.colSpan * 14 - 2, 30)}px` }}>
                  {m.label}
                </div>
              ))}
            </div>
            <div className="flex gap-[2px]">
              <div className="flex flex-col gap-[2px] mr-[2px]">
                {dayLabels.map((label, i) => (
                  <div key={i} className="text-[9px] text-[#A1A1AA] leading-none w-[24px] h-[12px] flex items-center justify-end pr-[3px]">
                    {label}
                  </div>
                ))}
              </div>
              {heatmapGrid.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[2px]">
                  {week.map((day, di) => {
                    if (day === null) return <div key={`pad-${wi}-${di}`} className="w-[12px] h-[12px]" />;
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
                        aria-label={`执行记录 ${day.date}`}
                        title={day.date}
                        className={`w-[12px] h-[12px] rounded-[2px] ${color} cursor-pointer border-0 p-0 ${isToday ? "ring-[1px] ring-[#52525B]" : ""}`}
                        onMouseEnter={(e) => onCellMouseEnter(e, day.date)}
                        onMouseLeave={onCellMouseLeave}
                        onClick={(e) => onCellClick(e, day.date)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
        {/* Tooltip（显示在格子上方，参考既有产品 above 定位，避免被侧边栏底部裁剪） */}
        <div
          className="absolute z-50 bg-[#27272A] text-white px-[10px] py-[6px] rounded-[6px] pointer-events-none max-w-[190px]"
          style={{
            top: tooltip?.top ?? 0,
            left: tooltip?.left ?? 0,
            opacity: tooltipVisible ? 1 : 0,
            transform: tooltipVisible ? "translateY(0)" : "translateY(4px)",
            transition: "opacity 120ms ease, transform 120ms ease",
          }}
        >
          {tooltip && (() => {
            const day = heat.days.find((d) => d.date === tooltip.date);
            const isFuture = tooltip.date > today;
            const dateLabel = tooltip.date.split("-").join(".");
            let dataLine = "";
            if (isFuture) dataLine = "尚未到达";
            else if (day && (day.completed > 0 || day.minutes > 0)) dataLine = `${day.minutes} 分钟 · ${day.completed} 项任务`;
            else dataLine = "暂无执行记录";
            return (
              <>
                <div className="text-[13px] font-medium leading-[1.3] text-white/90">{dateLabel}</div>
                <div className="text-[12px] leading-[1.3] text-white/75 mt-[1px]">{dataLine}</div>
              </>
            );
          })()}
        </div>
      </div>

      {/* 快捷键提示 */}
      <div className="mt-auto text-[10px] text-[#A1A1AA] leading-[1.8] border-t border-[#F1F1F3] pt-3">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span><kbd className="font-mono bg-[#F1F1F3] px-1 rounded text-[9px]">⌘K</kbd> 面板</span>
          <span><kbd className="font-mono bg-[#F1F1F3] px-1 rounded text-[9px]">N</kbd> 加任务</span>
          <span><kbd className="font-mono bg-[#F1F1F3] px-1 rounded text-[9px]">空格</kbd> 勾选</span>
          <span><kbd className="font-mono bg-[#F1F1F3] px-1 rounded text-[9px]">1-7</kbd> 切页</span>
        </div>
        <div className="mt-1">筑巢人生 NestLife · v0.3</div>
      </div>
    </aside>
  );
}
