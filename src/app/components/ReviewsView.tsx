"use client";

import { useEffect, useMemo, useState } from "react";
import { todayLocal } from "../../lib/date-local.ts";
import { currentPeriods, weekLabel } from "../../lib/review-period.ts";

type ReviewType = "daily" | "weekly" | "monthly";

type Review = {
  id: string;
  type: ReviewType;
  period: string;
  good: string;
  problems: string;
  next: string;
  mood: number;
  createdAt: string;
  updatedAt: string;
};

type Stats = {
  start: string;
  end: string;
  total: number;
  done: number;
  minutes: number;
  doneMinutes: number;
  habitChecks: number;
  milestones: { title: string; done: boolean }[];
};

const TYPE_TABS: { key: ReviewType; label: string; emoji: string }[] = [
  { key: "daily", label: "日复盘", emoji: "📅" },
  { key: "weekly", label: "周复盘", emoji: "🗓️" },
  { key: "monthly", label: "月复盘", emoji: "📆" },
];

const TYPE_LABEL: Record<ReviewType, string> = { daily: "日复盘", weekly: "周复盘", monthly: "月复盘" };

/** L4 复盘闭环：日/周/月复盘 + 自动统计 + 下一步反哺规划 */
export function ReviewsView() {
  const periods = useMemo(() => currentPeriods(), []);
  const [type, setType] = useState<ReviewType>("daily");
  const [period, setPeriod] = useState<string>(() => {
    // 从执行记录热力图点击进入时，定位到点击的那一天（日复盘）
    try {
      const saved = window.sessionStorage.getItem("nestlife-review-period");
      if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) {
        window.sessionStorage.removeItem("nestlife-review-period");
        return saved;
      }
    } catch {
      /* 忽略 */
    }
    return periods.daily;
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const [good, setGood] = useState("");
  const [problems, setProblems] = useState("");
  const [next, setNext] = useState("");
  const [mood, setMood] = useState(3);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [taskDate, setTaskDate] = useState<string>(periods.daily);

  // 加载：effect 内异步 IIFE（setState 均在 await 之后的回调里，避免 set-state-in-effect 误报）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/reviews?type=${type}&period=${period}`);
        const d = await r.json();
        if (cancelled) return;
        setStats(d.stats ?? null);
        setHistory(Array.isArray(d.history) ? d.history : []);
        const rv: Review | null = d.review ?? null;
        setGood(rv?.good ?? "");
        setProblems(rv?.problems ?? "");
        setNext(rv?.next ?? "");
        setMood(rv?.mood ?? 3);
      } catch {
        /* 网络异常忽略 */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, period]);

  /** 保存后刷新（事件处理器内调用，可安全 setState） */
  const refresh = async () => {
    try {
      const r = await fetch(`/api/reviews?type=${type}&period=${period}`);
      const d = await r.json();
      setStats(d.stats ?? null);
      setHistory(Array.isArray(d.history) ? d.history : []);
      const rv: Review | null = d.review ?? null;
      setGood(rv?.good ?? "");
      setProblems(rv?.problems ?? "");
      setNext(rv?.next ?? "");
      setMood(rv?.mood ?? 3);
    } catch {
      /* 忽略 */
    }
  };

  const switchType = (t: ReviewType) => {
    setType(t);
    setPeriod(t === "daily" ? periods.daily : t === "weekly" ? periods.weekly : periods.monthly);
  };

  const save = async () => {
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, period, good, problems, next, mood }),
      });
      const d = await r.json();
      if (d.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        refresh();
      }
    } catch {
      /* 忽略 */
    }
  };

  /** 反哺闭环：复盘 → 决策 → 行动（「下一步」按行转任务，并沉淀决策室） */
  const pushNextToTasks = async () => {
    const lines = next.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) {
      setToast("「下一步」还没有内容");
      setTimeout(() => setToast(null), 2500);
      return;
    }
    let ok = 0;
    for (const title of lines) {
      try {
        const r = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, date: taskDate, branchId: "career", source: "review" }),
        });
        const d = await r.json();
        if (d.ok || d.id) ok += 1;
      } catch {
        /* 忽略 */
      }
    }
    // 沉淀决策：本次复盘的行动承诺（复盘 → 决策）
    try {
      const ctx = [good.trim(), problems.trim() ? `问题：${problems.trim()}` : ""].filter(Boolean).join(" / ");
      await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `复盘行动 · ${TYPE_LABEL[type]} ${period}`,
          context: ctx.slice(0, 300) || "复盘反哺",
          decision: lines.join("；").slice(0, 500),
          rationale: stats ? `期间完成 ${stats.done}/${stats.total} 项任务 · 专注 ${stats.doneMinutes} 分钟` : "复盘反哺",
          branchId: "career",
          source: "复盘",
        }),
      });
    } catch {
      /* 忽略 */
    }
    setToast(`✅ 已生成 ${ok}/${lines.length} 个行动任务并记录决策（${taskDate}）`);
    setTimeout(() => setToast(null), 3200);
  };

  const statCards = stats
    ? [
        { label: "任务完成", value: `${stats.done}/${stats.total}`, sub: `专注 ${stats.doneMinutes} 分钟` },
        { label: "习惯打卡", value: `${stats.habitChecks} 项`, sub: "范围内已打卡" },
        { label: "里程碑", value: `${stats.milestones.filter((m) => m.done).length}/${stats.milestones.length}`, sub: "到期的里程碑" },
      ]
    : [];

  const periodInput =
    type === "daily" ? (
      <input type="date" value={period} onChange={(e) => setPeriod(e.target.value)}
        className="bg-[#F4F4F5] rounded-[8px] px-3 py-1.5 text-[13px] text-[#18181B] outline-none" />
    ) : type === "weekly" ? (
      <div className="flex items-center gap-2">
        <input type="week" value={period} onChange={(e) => setPeriod(e.target.value)}
          className="bg-[#F4F4F5] rounded-[8px] px-3 py-1.5 text-[13px] text-[#18181B] outline-none" />
        <span className="text-[11px] text-[#A1A1AA]">{weekLabel(period)}</span>
      </div>
    ) : (
      <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
        className="bg-[#F4F4F5] rounded-[8px] px-3 py-1.5 text-[13px] text-[#18181B] outline-none" />
    );

  return (
    <div className="flex flex-col gap-4">
      {/* 头部 */}
      <section className="workspace-pane">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="section-label">复盘 · L4 反哺规划</div>
            <div className="text-[12px] text-[#A1A1AA] mt-1">
              数据自动统计 · 复盘沉淀经验 · 「下一步」生成行动任务
            </div>
          </div>
          {saved && <span className="text-[11px] px-2 py-1 rounded-full bg-[#F0FDF4] text-[#059669] font-semibold">已保存 ✓</span>}
        </div>

        {/* 类型 + 期间 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#F4F4F5] rounded-[8px] p-1">
            {TYPE_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => switchType(t.key)}
                className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold transition-colors ${
                  type === t.key ? "bg-white text-[#18181B] shadow-sm" : "text-[#71717A] hover:text-[#18181B]"
                }`}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          {periodInput}
        </div>

        {/* 自动统计 */}
        {stats && !loading && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            {statCards.map((c) => (
              <div key={c.label} className="bg-[#FAFAFA] rounded-[10px] p-3 border border-[#F0F0F1]">
                <div className="text-[11px] text-[#A1A1AA]">{c.label}</div>
                <div className="text-[18px] font-bold text-[#18181B] mt-0.5">{c.value}</div>
                <div className="text-[10px] text-[#A1A1AA] mt-0.5">{c.sub}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 编辑区 */}
      <section className="workspace-pane">
        <div className="flex items-center justify-between mb-3">
          <div className="section-label">{TYPE_LABEL[type]} · 记录</div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setMood(n)}
                className={`text-[16px] transition-transform ${n <= mood ? "" : "opacity-25 grayscale"}`}>
                ⭐
              </button>
            ))}
            <span className="text-[11px] text-[#A1A1AA] ml-1">{mood}/5</span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10 text-[12px] text-[#A1A1AA]">加载中…</div>
        ) : (
          <div className="flex flex-col gap-3">
            {(
              [
                { key: "good", label: "✅ 做得好的", value: good, set: setGood, ph: "今天/本周做成了什么？哪怕很小…" },
                { key: "problems", label: "⚠️ 问题与卡点", value: problems, set: setProblems, ph: "卡在哪里？发生了什么…" },
                { key: "next", label: "➡️ 下一步", value: next, set: setNext, ph: "接下来要做什么（日复盘就是明天）？一行一条，可直接转为任务…" },
              ] as const
            ).map((f) => (
              <div key={f.key}>
                <div className="text-[12px] font-semibold text-[#52525B] mb-1.5">{f.label}</div>
                <textarea
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.ph}
                  rows={f.key === "next" ? 4 : 3}
                  className="w-full bg-[#FAFAFA] border border-[#F0F0F1] rounded-[10px] px-3.5 py-2.5 text-[13.5px] text-[#18181B] outline-none focus:border-[#D4D4D8] resize-y leading-[1.8]"
                />
              </div>
            ))}

            {/* 反哺 */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <button
                onClick={save}
                className="px-4 py-2 rounded-[9px] bg-[#18181B] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
              >
                保存复盘
              </button>
              <button
                onClick={pushNextToTasks}
                className="px-4 py-2 rounded-[9px] bg-[#F4F4F5] text-[#18181B] text-[13px] font-semibold hover:bg-[#E4E4E7] transition-colors"
              >
                「下一步」→ 生成任务
              </button>
              <input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)}
                className="bg-[#F4F4F5] rounded-[8px] px-2.5 py-1.5 text-[12px] text-[#18181B] outline-none" />
              <button
                onClick={() => setTaskDate(todayLocal())}
                className="text-[11px] text-[#A1A1AA] underline underline-offset-2 hover:text-[#18181B]"
              >
                今天
              </button>
              {toast && <span className="text-[12px] text-[#059669] font-semibold">{toast}</span>}
            </div>
          </div>
        )}
      </section>

      {/* 历史 */}
      <section className="workspace-pane">
        <div className="section-label mb-3">历史 · {TYPE_LABEL[type]}</div>
        {history.length === 0 ? (
          <p className="text-[12px] text-[#A1A1AA] py-3">还没有历史复盘，保存第一条吧。</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => setPeriod(h.period)}
                className={`text-left px-3 py-2.5 rounded-[9px] transition-colors ${
                  h.period === period ? "bg-[#F4F4F5]" : "hover:bg-[#FAFAFA]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#18181B]">
                    {h.period}
                    {h.type === "weekly" && <span className="text-[11px] text-[#A1A1AA] font-normal ml-2">{weekLabel(h.period)}</span>}
                  </span>
                  <span className="text-[11px] text-[#A1A1AA]">{h.mood}/5</span>
                </div>
                <div className="text-[12px] text-[#71717A] mt-0.5 truncate">
                  {h.good || h.problems || h.next || "（空）"}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
