"use client";

import { useEffect, useMemo, useState } from "react";

interface DecisionsViewProps {
  setActiveView: (v: "agent") => void;
}

type Decision = {
  id: string;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives: string;
  branchId: string;
  status: "proposed" | "accepted" | "rejected";
  date: string;
  source: string;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = { proposed: "待定", accepted: "已采纳", rejected: "已否决" };
const STATUS_COLOR: Record<string, string> = { proposed: "#D97706", accepted: "#059669", rejected: "#DC2626" };
const BRANCH_EMOJI: Record<string, string> = { career: "🏗️", growth: "🌱", life: "🏡" };
const BRANCH_LABEL: Record<string, string> = { career: "事业", growth: "成长", life: "生活" };

/** 决策室：自动生成的决策记录（可筛选 + 点开看详情） */
export function DecisionsView({ setActiveView }: DecisionsViewProps) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 从 API 拉取（AI 助手 自动写入），60s 轮询
  useEffect(() => {
    const load = () => {
      fetch("/api/decisions")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.decisions)) setDecisions(d.decisions);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  // 筛选
  const filtered = useMemo(() => {
    return decisions.filter(
      (d) =>
        (branchFilter === "all" || d.branchId === branchFilter) &&
        (statusFilter === "all" || d.status === statusFilter)
    );
  }, [decisions, branchFilter, statusFilter]);

  const accepted = decisions.filter((d) => d.status === "accepted").length;

  return (
    <div className="flex flex-col gap-4">
      {/* 头部 */}
      <section className="workspace-pane">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="section-label">决策室 · 自动生成</div>
            <div className="text-[12px] text-[#A1A1AA] mt-1">
              对话里做出的决策由 AI 助手 自动记录 · 点击卡片查看详情
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-1 rounded-full bg-[#F1F1F3] text-[#52525B] font-semibold">
              共 {decisions.length} 条
            </span>
            <span className="text-[11px] px-2 py-1 rounded-full bg-[#F0FDF4] text-[#059669] font-semibold">
              已采纳 {accepted}
            </span>
          </div>
        </div>

        {/* 分类筛选 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 分支筛选 */}
          <div className="flex items-center gap-1 bg-[#F4F4F5] rounded-[8px] p-1">
            {[
              { key: "all", label: "全部" },
              { key: "career", label: "🏗️ 事业" },
              { key: "growth", label: "🌱 成长" },
              { key: "life", label: "🏡 生活" },
            ].map((b) => (
              <button
                key={b.key}
                onClick={() => setBranchFilter(b.key)}
                className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold transition-colors ${
                  branchFilter === b.key ? "bg-white text-[#18181B] shadow-sm" : "text-[#71717A] hover:text-[#18181B]"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          {/* 状态筛选 */}
          <div className="flex items-center gap-1 bg-[#F4F4F5] rounded-[8px] p-1">
            {[
              { key: "all", label: "全部状态" },
              { key: "accepted", label: "已采纳" },
              { key: "proposed", label: "待定" },
              { key: "rejected", label: "已否决" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold transition-colors ${
                  statusFilter === s.key ? "bg-white text-[#18181B] shadow-sm" : "text-[#71717A] hover:text-[#18181B]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-[#A1A1AA] leading-[1.6] mt-3">
          想要补充说明，去 <button className="text-[#18181B] underline underline-offset-2" onClick={() => setActiveView("agent")}>AI 助手</button> 告诉 AI 助手
        </p>
      </section>

      {/* 决策列表 */}
      {loading ? (
        <section className="workspace-pane text-center py-12 text-[12px] text-[#A1A1AA]">加载中…</section>
      ) : filtered.length === 0 ? (
        <section className="workspace-pane text-center py-14">
          <div className="text-[32px] mb-3">🧭</div>
          <p className="text-[13px] font-semibold text-[#18181B] mb-1">
            {decisions.length === 0 ? "还没有决策记录" : "该分类下没有决策"}
          </p>
          <p className="text-[12px] text-[#A1A1AA]">在对话里做出决定（如「就定方案B」），AI 助手 会自动记录到这里</p>
        </section>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((d) => {
            const expanded = expandedId === d.id;
            return (
              <section key={d.id} className="workspace-pane !py-4 cursor-pointer transition-colors hover:bg-[#FAFAFA]" onClick={() => setExpandedId(expanded ? null : d.id)}>
                {/* 折叠态：一行摘要 */}
                <div className="flex items-center gap-2.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${expanded ? "" : ""}`} style={{ backgroundColor: `${STATUS_COLOR[d.status]}1A`, color: STATUS_COLOR[d.status] }}>
                    {STATUS_LABEL[d.status]}
                  </span>
                  <span className="text-[13px] font-semibold text-[#18181B] flex-1 truncate">{d.title}</span>
                  <span className="text-[11px] text-[#A1A1AA] shrink-0">
                    {BRANCH_EMOJI[d.branchId] ?? "🏗️"} {BRANCH_LABEL[d.branchId] ?? "事业"}
                  </span>
                  <span className="text-[11px] text-[#A1A1AA] shrink-0">{d.date}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F1F1F3] text-[#A1A1AA] shrink-0">
                    {d.source === "对话" ? "💬 对话" : "📋 历史"}
                  </span>
                  <span className={`text-[#A1A1AA] text-[12px] shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
                </div>

                {/* 展开态：完整详情 */}
                {expanded && (
                  <div className="mt-3 pt-3 border-t border-[#F1F1F3] grid grid-cols-1 md:grid-cols-2 gap-3">
                    {d.context && (
                      <div className="p-3 rounded-[8px] bg-[#F8F8F9]">
                        <div className="text-[11px] font-bold text-[#71717A] mb-1">背景</div>
                        <p className="text-[12px] text-[#3F3F46] leading-[1.6]">{d.context}</p>
                      </div>
                    )}
                    <div className="p-3 rounded-[8px] bg-[#F8F8F9]">
                      <div className="text-[11px] font-bold text-[#71717A] mb-1">决策</div>
                      <p className="text-[12px] text-[#3F3F46] leading-[1.6]">{d.decision || d.title}</p>
                    </div>
                    {d.rationale && (
                      <div className="p-3 rounded-[8px] bg-[#F0FDF4]">
                        <div className="text-[11px] font-bold text-[#059669] mb-1">依据</div>
                        <p className="text-[12px] text-[#3F3F46] leading-[1.6]">{d.rationale}</p>
                      </div>
                    )}
                    {d.alternatives && (
                      <div className="p-3 rounded-[8px] bg-[#F8F8F9]">
                        <div className="text-[11px] font-bold text-[#71717A] mb-1">备选方案</div>
                        <p className="text-[12px] text-[#3F3F46] leading-[1.6]">{d.alternatives}</p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
