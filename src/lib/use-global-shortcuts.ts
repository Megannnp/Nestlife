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
  /** 用户菜单配置（跟随改名/隐藏/排序），缺省用默认全 9 视图 */
  navItems?: { key: string; visible?: boolean }[];
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
      // 1-9 → 切页（跟随用户菜单顺序；隐藏项自动跳过）
      else if (/^[1-9]$/.test(e.key)) {
        const DEFAULT_VIEWS: LifeView[] = ["today", "reviews", "career", "growth", "agent", "knowledge", "wechat", "decisions", "settings"];
        const nav = (opts.navItems?.filter((n) => n.visible !== false) ?? []).map((n) => n.key) as LifeView[];
        const views = nav.length ? nav : DEFAULT_VIEWS;
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
