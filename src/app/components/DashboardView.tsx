"use client";

import { useState } from "react";
import type { Workspace, Task, BranchId } from "../../lib/types.ts";
import { formatMinutes, tasksOfDate, todayStr, priorityText } from "../../lib/utils.ts";
import { useReminderNotifications } from "../../lib/use-reminder-notifications.ts";
import { useToast } from "./Toast.tsx";
import { parseTaskInput } from "../../lib/parse-task.ts";

interface DashboardViewProps {
  workspace: Workspace;
  toggleTask: (taskId: string) => void;
  addTask: (task: Omit<Task, "id" | "createdAt" | "status" | "completedAt">) => void;
  removeTask: (taskId: string) => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: "bg-[#FEE2E2] text-[#DC2626]",
  mid: "bg-[#FEF3C7] text-[#D97706]",
  low: "bg-[#F1F1F3] text-[#71717A]",
};

const LEVEL_LABEL: Record<string, string> = { long: "长期", mid: "中期", short: "短期" };

/** 今日看板：简单白卡风格，三块卡片 */
export function DashboardView({ workspace, toggleTask, addTask, removeTask }: DashboardViewProps) {
  // 提醒通知（浏览器通知）
  useReminderNotifications(workspace.reminders);
  const { toast } = useToast();

  const today = todayStr();
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayTasks = tasksOfDate(workspace.tasks, today);
  const doneCount = todayTasks.filter((t) => t.status === "done").length;

  const activeReminders = workspace.reminders.filter((r) => r.enabled && (r.date === today || r.date === "") && r.time >= timeStr);

  const [draft, setDraft] = useState({ branchId: "career" as BranchId, goalId: "" as string, title: "" });
  const submit = () => {
    if (!draft.title.trim()) return;
    // 自然语言解析：明天下午3点交材料 → date/time/priority
    const parsed = parseTaskInput(draft.title);
    addTask({
      branchId: draft.branchId,
      goalId: draft.goalId || undefined,
      title: parsed.title,
      date: parsed.date ?? today,
      startTime: parsed.startTime,
      minutes: parsed.minutes ?? 60,
      priority: parsed.priority ?? "mid",
      note: draft.title !== parsed.title ? `原文：${draft.title}` : "",
    });
    setDraft({ ...draft, title: "" });
    toast(`✅ 已添加：${parsed.title}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 今日任务 */}
      <section className="workspace-pane">
        <div className="flex items-center justify-between mb-3">
          <div className="section-label">今日任务</div>
          <div className="text-[12px] text-[#71717A]">
            {doneCount} / {todayTasks.length}
          </div>
        </div>

        {/* 添加 */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <select
            className="input-field !min-h-[32px]"
            value={draft.branchId}
            onChange={(e) => setDraft({ ...draft, branchId: e.target.value as BranchId })}
          >
            {workspace.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.emoji} {b.name}
              </option>
            ))}
          </select>
          <select
            className="input-field !min-h-[32px] max-w-[140px]"
            value={draft.goalId}
            onChange={(e) => setDraft({ ...draft, goalId: e.target.value })}
            title="关联目标（选填，可在事业页看目标推进）"
          >
            <option value="">🎯 无目标</option>
            {workspace.goals.filter((g) => !g.done).map((g) => (
              <option key={g.id} value={g.id}>
                {g.title.slice(0, 18)}{g.title.length > 18 ? "…" : ""}
              </option>
            ))}
          </select>
          <textarea
            id="task-input"
            className="input-field !min-h-[32px] flex-1 min-w-[160px] resize-none leading-[1.6]"
            placeholder="添加任务（支持：明天下午3点交材料）"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            style={{ height: "auto", maxHeight: 96 }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 96) + "px";
            }}
          />
          <button className="primary-button !min-h-[32px]" onClick={submit}>添加</button>
        </div>

        {todayTasks.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-[28px] mb-2">🌤️</div>
            <p className="text-[13px] font-semibold text-[#18181B] mb-1">今天还没有任务</p>
            <p className="text-[12px] text-[#A1A1AA] mb-3">试试用一句话添加：明天下午3点交材料</p>
            <button
              className="secondary-button !min-h-[30px] !text-[12px]"
              onClick={() => document.querySelector<HTMLInputElement>('input[placeholder*="添加任务"]')?.focus()}
            >
              ➕ 添加任务
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {todayTasks.map((t) => {
              const branch = workspace.branches.find((b) => b.id === t.branchId);
              const goal = t.goalId ? workspace.goals.find((g) => g.id === t.goalId) : undefined;
              const done = t.status === "done";
              return (
                <div key={t.id} className={`flex items-center gap-3 py-2.5 border-b border-[#F1F1F3] last:border-0 ${done ? "opacity-50" : ""}`}>
                  <button
                    onClick={() => toggleTask(t.id)}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] shrink-0 ${
                      done ? "bg-[#27272A] border-[#27272A] text-white" : "border-[#D4D4D8] text-transparent hover:border-[#A1A1AA]"
                    }`}
                  >
                    ✓
                  </button>
                  <span className={`flex-1 min-w-0 text-[13px] truncate ${done ? "line-through text-[#A1A1AA]" : "text-[#18181B]"}`}>
                    {t.title}
                  </span>
                  {t.auto && (
                    <span className="text-[10px] px-1.5 py-px rounded bg-[#EDEDED] text-[#71717A] font-semibold shrink-0" title={t.source ? `推断自${t.source}` : "AI 助手 自动生成"}>
                      ✨ 自动
                    </span>
                  )}
                  {goal && !done && (
                    <span className="text-[10px] px-1.5 py-px rounded bg-[#EFF6FF] text-[#2563EB] font-semibold shrink-0 max-w-[120px] truncate" title={`关联目标：${goal.title}`}>
                      🎯 {goal.title.slice(0, 10)}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-px rounded font-bold ${PRIORITY_COLOR[t.priority]}`}>{priorityText(t.priority)}</span>
                  {t.startTime && <span className="text-[11px] text-[#71717A] font-mono">{t.startTime}</span>}
                  <span className="text-[11px] text-[#A1A1AA]">{formatMinutes(t.minutes)}</span>
                  <span className="text-[12px] text-[#A1A1AA]">{branch?.emoji}</span>
                  {!t.auto && (
                    <button
                      className="text-[11px] text-[#A1A1AA] hover:text-[#DC2626]"
                      onClick={() => removeTask(t.id)}
                    >
                      删
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 目标推进 */}
      {(workspace.goals?.length ?? 0) > 0 && (
        <section className="workspace-pane">
          <div className="section-label mb-3">目标推进</div>
          <div className="flex flex-col gap-3">
            {(["long", "mid", "short"] as const).map((level) => {
              const goals = workspace.goals.filter((g) => g.level === level);
              if (goals.length === 0) return null;
              return (
                <div key={level}>
                  <div className="text-[11px] font-semibold text-[#A1A1AA] mb-1.5">{LEVEL_LABEL[level]}</div>
                  <div className="flex flex-col">
                    {goals.map((g) => {
                      const ts = workspace.tasks.filter((t) => t.goalId === g.id);
                      const done = ts.filter((t) => t.status === "done").length;
                      const pct = ts.length ? Math.round((done / ts.length) * 100) : null;
                      return (
                        <div key={g.id} className="py-2.5 border-b border-[#F1F1F3] last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[#18181B] flex-1 min-w-0 truncate">{g.title}</span>
                            {pct != null ? (
                              <span className="text-[11px] font-semibold text-[#18181B]">{pct}%</span>
                            ) : (
                              <span className="text-[10px] text-[#A1A1AA]">未关联任务</span>
                            )}
                          </div>
                          {pct != null && (
                            <div className="mt-1.5 h-1 rounded-full bg-[#F1F1F3] overflow-hidden">
                              <div className="h-full rounded-full bg-[#27272A]" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                          {ts.length > 0 && (
                            <div className="text-[11px] text-[#A1A1AA] mt-1">{done}/{ts.length} 完成</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 提醒 + 时刻表 */}
      <section className="workspace-pane">
        <div className="flex items-center justify-between mb-3">
          <div className="section-label">提醒 · 时刻表</div>
          {typeof window !== "undefined" && "Notification" in window && (
            <button
              className="text-[11px] px-2 py-1 rounded-full font-semibold transition-colors"
              style={{
                backgroundColor: Notification.permission === "granted" ? "#F0FDF4" : "#F1F1F3",
                color: Notification.permission === "granted" ? "#059669" : "#71717A",
              }}
              onClick={() => {
                if (Notification.permission !== "granted") Notification.requestPermission();
              }}
            >
              {Notification.permission === "granted" ? "🔔 通知已开启" : Notification.permission === "denied" ? "🔕 通知被拒" : "🔔 开启通知"}
            </button>
          )}
        </div>

        <div className="text-[12px] font-bold text-[#71717A] mb-2">提醒</div>
        {activeReminders.length > 0 ? (
          <div className="flex flex-col mb-4">
            {activeReminders.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-[#F1F1F3] last:border-0">
                <span className="text-[12px]">⏰</span>
                <span className="flex-1 text-[13px] text-[#18181B] truncate">{r.title}</span>
                <span className="text-[12px] text-[#71717A] font-mono">{r.time}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[#A1A1AA] mb-4">暂无提醒</p>
        )}

        <div className="text-[12px] font-bold text-[#71717A] mb-2">时刻表</div>
        <div className="flex flex-col">
          {workspace.schedule.map((item) => {
            const passed = item.time < timeStr;
            const isNow = item.time <= timeStr && timeStr < (nextTime(workspace.schedule, item.time) || "24:00");
            return (
              <div key={item.id} className={`flex items-center gap-3 py-1.5 border-b border-[#F1F1F3] last:border-0 ${passed && !isNow ? "opacity-40" : ""}`}>
                <span className="text-[12px] font-mono text-[#18181B] w-[44px] shrink-0">{item.time}</span>
                <span className="text-[13px] truncate flex-1">
                  {isNow ? <span className="font-bold text-[#18181B]">{item.title}</span> : <span className="text-[#3F3F46]">{item.title}</span>}
                </span>
                {isNow && <span className="text-[10px] px-1.5 py-px rounded-full bg-[#18181B] text-white font-bold">现在</span>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function nextTime(schedule: { time: string }[], t: string): string | null {
  const idx = schedule.findIndex((s) => s.time > t);
  return idx >= 0 ? schedule[idx].time : null;
}
