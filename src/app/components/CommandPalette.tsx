"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LifeView, Workspace } from "../../lib/types.ts";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
  setActiveView: (v: LifeView) => void;
  /** 快速添加任务回调（回车即加） */
  onQuickAddTask: (title: string) => void;
}

/** 导航项（静态，模块级常量，避免每次渲染重建） */
const NAV_ITEMS: { key: LifeView; label: string; icon: string }[] = [
  { key: "today", label: "今天", icon: "📋" },
  { key: "career", label: "事业", icon: "🏗️" },
  { key: "growth", label: "成长", icon: "🌱" },
  { key: "agent", label: "AI 助手", icon: "🧭" },
  { key: "knowledge", label: "知识中心", icon: "📚" },
  { key: "decisions", label: "决策室", icon: "🧭" },
  { key: "wechat", label: "公众号", icon: "📣" },
  { key: "settings", label: "设置", icon: "⚙️" },
];

/** ⌘K 命令面板：搜索任务/项目/跳转/快速添加 */
export function CommandPalette({ open, onClose, workspace, setActiveView, onQuickAddTask }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"navigate" | "add">("navigate");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 打开时重置状态（渲染期间调整，React 官方推荐模式，避免 effect 同步 setState）
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setMode("navigate");
      setSelected(0);
    }
  }

  // 打开时聚焦（纯 DOM 操作，无 setState）
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // 搜索结果：导航 + 项目 + 任务（全部）+ 目标
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (mode === "add") return [];

    const items: { type: "nav" | "project" | "task" | "goal" | "habit"; key: string; label: string; sub: string; icon: string; action: () => void }[] = [];

    // 导航（q 为空显示全部，否则按 label 匹配）
    NAV_ITEMS.forEach((n) => {
      if (!q || n.label.toLowerCase().includes(q))
        items.push({
          type: "nav",
          key: `nav-${n.key}`,
          label: n.label,
          sub: "页面",
          icon: n.icon,
          action: () => {
            setActiveView(n.key);
            onClose();
          },
        });
    });

    // 项目
    workspace.projects.forEach((p) => {
      if (!q || p.name.toLowerCase().includes(q) || p.tagline.toLowerCase().includes(q))
        items.push({
          type: "project",
          key: `proj-${p.id}`,
          label: p.name,
          sub: p.tagline,
          icon: p.emoji,
          action: () => {
            setActiveView("career");
            onClose();
          },
        });
    });

    // 任务（全部，不只今日）
    workspace.tasks
      .slice()
      .sort((a, b) => (a.date > b.date ? -1 : 1))
      .forEach((t) => {
        if (!q || t.title.toLowerCase().includes(q))
          items.push({
            type: "task",
            key: `task-${t.id}`,
            label: t.title,
            sub: `${t.date} · ${t.status === "done" ? "已完成" : "待办"}`,
            icon: t.status === "done" ? "✅" : "○",
            action: () => {
              setActiveView("today");
              onClose();
            },
          });
      });

    // 目标
    workspace.goals.forEach((g) => {
      const branch = workspace.branches.find((b) => b.id === g.branchId);
      if (!q || g.title.toLowerCase().includes(q) || (g.measure || "").toLowerCase().includes(q))
        items.push({
          type: "goal",
          key: `goal-${g.id}`,
          label: g.title,
          sub: `${branch?.emoji ?? ""} ${branch?.name ?? ""} · ${g.level === "long" ? "长期" : g.level === "mid" ? "中期" : "短期"} · ${g.progress}%`,
          icon: "🎯",
          action: () => {
            setActiveView("growth");
            onClose();
          },
        });
    });

    return items.slice(0, 14);
  }, [query, mode, workspace, setActiveView, onClose]);

  const isCommand = query.startsWith("+");

  // 键盘
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, Math.max(results.length - 1, 0)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (isCommand) {
          onQuickAddTask(query.slice(1).trim());
          onClose();
        } else if (results[selected]) {
          results[selected].action();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, query, results, selected, isCommand, onQuickAddTask, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]" onClick={onClose}>
      {/* 背景 */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      {/* 面板 */}
      <div
        className="relative w-[560px] max-w-[90vw] rounded-[14px] bg-white border border-[#E4E4E7] shadow-[0_24px_60px_rgba(15,23,42,0.16)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 输入框 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#F1F1F3]">
          <span className="text-[14px] text-[#A1A1AA]">{isCommand ? "➕" : "🔍"}</span>
          <input
            ref={inputRef}
            className="flex-1 text-[14px] outline-none bg-transparent placeholder:text-[#A1A1AA]"
            placeholder={isCommand ? "添加任务：如 提交项目材料" : "搜索任务、项目、页面…（+ 号开头添加任务）"}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
              setMode(e.target.value.startsWith("+") ? "add" : "navigate");
            }}
          />
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F1F1F3] text-[#A1A1AA] font-mono">esc</span>
        </div>

        {/* 结果 */}
        <div className="max-h-[360px] overflow-y-auto p-2">
          {isCommand ? (
            <div className="px-3 py-3 text-[13px] text-[#71717A]">
              按回车添加任务：<span className="text-[#18181B] font-semibold">{query.slice(1).trim() || "…"}</span>
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-[#A1A1AA]">没有匹配结果</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {results.map((r, i) => (
                <button
                  key={r.key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-left transition-colors ${
                    i === selected ? "bg-[#F4F4F5]" : ""
                  }`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={r.action}
                >
                  <span className="text-[14px] w-[20px] text-center shrink-0">{r.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-[#18181B] truncate">{r.label}</span>
                    {r.sub && <span className="block text-[11px] text-[#A1A1AA] truncate">{r.sub}</span>}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F1F1F3] text-[#A1A1AA] font-semibold shrink-0">
                    {r.type === "nav" ? "页面" : r.type === "project" ? "项目" : r.type === "goal" ? "目标" : "任务"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
