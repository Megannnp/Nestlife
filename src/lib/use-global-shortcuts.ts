"use client";

import { useEffect } from "react";
import type { LifeView } from "./types.ts";

/**
 * 全局键盘快捷键
 *  - n：聚焦"添加任务"输入框
 *  - 空格：勾选当前任务（今日页第一个未完成）
 *  - 1-7：切换页面（今天/事业/成长/AI/知识/决策/设置）
 */
export function useGlobalShortcuts(opts: {
  activeView: string;
  setActiveView: (v: LifeView) => void;
  onToggleFirstTask?: () => void;
  focusTaskInput?: () => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 输入框内不触发
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      // ⌘/Ctrl 组合键不触发
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (opts.enabled === false) return;

      // n → 聚焦添加任务
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        opts.focusTaskInput?.();
      }
      // 空格 → 勾选第一个未完成任务
      else if (e.key === " " && opts.activeView === "today") {
        e.preventDefault();
        opts.onToggleFirstTask?.();
      }
      // 1-7 → 切页
      else if (/^[1-7]$/.test(e.key)) {
        const views: LifeView[] = ["today", "career", "growth", "agent", "knowledge", "decisions", "settings"];
        const idx = parseInt(e.key, 10) - 1;
        if (views[idx]) {
          opts.setActiveView(views[idx]);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [opts]);
}
