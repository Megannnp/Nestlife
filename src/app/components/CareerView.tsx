"use client";

import { useEffect, useState } from "react";
import type { Workspace, Project, Milestone } from "../../lib/types.ts";
import { useToast } from "./Toast.tsx";
import { todayLocal } from "../../lib/date-local.ts";

type Activity = { projectId: string; label: string; activeDays: number | null; gitDays: number | null; state: "active" | "slow" | "stale" };

const STATE_LABEL: Record<string, { text: string; color: string; bg: string }> = {
  active: { text: "活跃中", color: "#059669", bg: "#F0FDF4" },
  slow: { text: "放缓", color: "#D97706", bg: "#FEF3C7" },
  stale: { text: "停滞", color: "#DC2626", bg: "#FEE2E2" },
};

interface CareerViewProps {
  workspace: Workspace;
  toggleMilestone: (id: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  active: "进行中",
  planning: "规划",
  paused: "暂停",
  done: "已完成",
};

/** 事业页：项目列表 → 项目详情（Linear 式：只看下一步/里程碑/阻塞） */
export function CareerView({ workspace, toggleMilestone }: CareerViewProps) {
  const { toast } = useToast();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Record<string, Activity>>({});
  const activeProject = workspace.projects.find((p) => p.id === activeProjectId) ?? null;

  // 拉取项目活跃度（自动感知）
  useEffect(() => {
    fetch("/api/projects/activity")
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, Activity> = {};
        (d.activities ?? []).forEach((a: Activity) => {
          map[a.projectId] = a;
        });
        setActivities(map);
      })
      .catch(() => {});
  }, []);

  // 列表视图
  if (!activeProject) {
    return (
      <div className="flex flex-col gap-4">
        <section className="workspace-pane">
          <div className="section-label mb-3">事业</div>
          <div className="flex flex-col">
            {workspace.projects.map((p: Project) => {
              const milestones = workspace.milestones.filter((m) => m.projectId === p.id);
              const next = milestones.find((m) => !m.done);
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveProjectId(p.id)}
                  className="flex items-center gap-3 py-3 border-b border-[#F1F1F3] last:border-0 text-left hover:bg-[#F8F8F9] px-2 -mx-2 rounded-[8px] transition-colors"
                >
                  <span className="text-[18px] shrink-0">{p.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-[#18181B]">{p.name}</span>
                      <span className="text-[10px] px-1.5 py-px rounded bg-[#F1F1F3] text-[#52525B] font-semibold">{STATUS_LABEL[p.status]}</span>
                      {p.score && <span className="text-[10px] text-[#D97706]">{"★".repeat(p.score.stars)}</span>}
                    </div>
                    <div className="text-[12px] text-[#A1A1AA] mt-0.5 truncate">{p.tagline}</div>
                  </div>
                  <div className="w-[120px] shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[#F1F1F3] overflow-hidden">
                        <div className="h-full rounded-full bg-[#27272A]" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="text-[11px] font-semibold text-[#18181B]">{p.progress}%</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {activities[p.id] && (
                        <span className="text-[10px] px-1.5 py-px rounded-full font-semibold" style={{ backgroundColor: STATE_LABEL[activities[p.id].state].bg, color: STATE_LABEL[activities[p.id].state].color }}>
                          {STATE_LABEL[activities[p.id].state].text}
                        </span>
                      )}
                      <span className="text-[10px] text-[#A1A1AA]">
                        {activities[p.id]?.activeDays != null
                          ? `最近动过 ${activities[p.id].activeDays === 0 ? "今天" : activities[p.id].activeDays + " 天前"}`
                          : "无活动记录"}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#A1A1AA] mt-0.5">
                      {next ? `里程碑：${next.title} ${next.dueDate.slice(5)}` : "无待办里程碑"}
                    </div>
                  </div>
                  <span className="text-[#A1A1AA] shrink-0">→</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  // 详情视图
  const milestones = workspace.milestones.filter((m) => m.projectId === activeProject.id);
  const doneMilestones = milestones.filter((m) => m.done).length;
  const overdue = milestones.filter((m) => !m.done && m.dueDate < todayLocal());

  return (
    <div className="flex flex-col gap-4">
      {/* 头部 */}
      <section className="workspace-pane">
        <button className="text-[12px] text-[#71717A] hover:text-[#18181B] mb-3" onClick={() => setActiveProjectId(null)}>
          ← 全部项目
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[24px]">{activeProject.emoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] font-bold text-[#18181B]">{activeProject.name}</h1>
            <p className="text-[12px] text-[#A1A1AA] mt-0.5">{activeProject.tagline}</p>
          </div>
          <span className="text-[11px] px-2 py-1 rounded-full bg-[#F1F1F3] text-[#52525B] font-semibold">{STATUS_LABEL[activeProject.status]}</span>
          <span className="text-[14px] font-bold text-[#18181B]">{activeProject.progress}%</span>
        </div>
      </section>

      {/* 评分卡（带依据） */}
      {activeProject.score && (
        <section className="workspace-pane">
          <div className="flex items-center justify-between mb-3">
            <div className="section-label">评分 · 带依据</div>
            <div className="flex items-center gap-2">
              <span className="text-[20px] font-bold text-[#18181B]">{activeProject.score.total} 分</span>
              <span className="text-[13px] text-[#D97706]">{"★".repeat(activeProject.score.stars)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {(
              [
                { key: "maturity" as const, label: "成熟度", weight: "40%" },
                { key: "users" as const, label: "用户验证", weight: "30%" },
                { key: "business" as const, label: "商业潜力", weight: "20%" },
                { key: "strategy" as const, label: "战略价值", weight: "10%" },
              ]
            ).map((d) => (
              <div key={d.key}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-[#52525B]">
                    {d.label} <span className="text-[10px] text-[#A1A1AA] font-normal">权重 {d.weight}</span>
                  </span>
                  <span className="font-bold text-[#18181B]">{activeProject.score!.dims[d.key]}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-[#F1F1F3] overflow-hidden">
                  <div className="h-full rounded-full bg-[#27272A]" style={{ width: `${activeProject.score!.dims[d.key]}%` }} />
                </div>
                <div className="text-[11px] text-[#A1A1AA] leading-[1.6] mt-0.5">{activeProject.score!.reasons[d.key]}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#A1A1AA] mt-3">总分 = 四维加权：成熟度×40% + 用户验证×30% + 商业潜力×20% + 战略价值×10%（≥85 五星 / ≥70 四星 / ≥55 三星 / ≥40 二星 / 其余一星）</p>
        </section>
      )}

      {/* 在营事项 */}
      {(activeProject.activeItems?.length ?? 0) > 0 && (
        <section className="workspace-pane">
          <div className="section-label mb-3">在营事项</div>
          <div className="flex flex-col">
            {activeProject.activeItems!.map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-[#F1F1F3] last:border-0">
                <span className="text-[13px] text-[#3F3F46] leading-[1.6]">{item}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 下一步 */}
      <section className="workspace-pane">
        <div className="section-label mb-3">下一步</div>
        {activeProject.nextSteps.length === 0 ? (
          <p className="text-[12px] text-[#A1A1AA] py-2">没有待办行动</p>
        ) : (
          <div className="flex flex-col">
            {activeProject.nextSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-[#F1F1F3] last:border-0">
                <span className="text-[12px] text-[#A1A1AA] w-[20px] text-center shrink-0">{i + 1}</span>
                <span className="text-[13px] text-[#3F3F46] leading-[1.6]">{s}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 里程碑 */}
      <section className="workspace-pane">
        <div className="flex items-center justify-between mb-3">
          <div className="section-label">里程碑</div>
          <div className="text-[12px] text-[#71717A]">{doneMilestones}/{milestones.length}</div>
        </div>
        {milestones.length === 0 ? (
          <p className="text-[12px] text-[#A1A1AA] py-2">暂无里程碑</p>
        ) : (
          <div className="flex flex-col">
            {milestones
              .sort((a, z) => (a.dueDate < z.dueDate ? -1 : 1))
              .map((m: Milestone) => {
                const isOverdue = !m.done && m.dueDate < todayLocal();
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-[#F1F1F3] last:border-0">
                    <button
                      onClick={() => { toggleMilestone(m.id); toast(m.done ? "已取消完成" : "✅ 里程碑已完成"); }}
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] shrink-0 ${
                        m.done ? "bg-[#27272A] border-[#27272A] text-white" : "border-[#D4D4D8] text-transparent hover:border-[#A1A1AA]"
                      }`}
                    >
                      ✓
                    </button>
                    <span className={`flex-1 text-[13px] ${m.done ? "line-through text-[#A1A1AA]" : "text-[#18181B]"}`}>{m.title}</span>
                    <span className={`text-[11px] font-mono ${isOverdue ? "text-[#DC2626]" : "text-[#A1A1AA]"}`}>
                      {m.dueDate.slice(5)}
                      {isOverdue && " 逾期"}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
        {overdue.length > 0 && (
          <p className="text-[11px] text-[#DC2626] mt-2">⚠ {overdue.length} 个里程碑逾期</p>
        )}
      </section>

      {/* 阻塞 */}
      <section className="workspace-pane">
        <div className="section-label mb-3">阻塞</div>
        {activeProject.blockers.length === 0 ? (
          <p className="text-[12px] text-[#A1A1AA] py-2">没有阻塞项</p>
        ) : (
          <div className="flex flex-col">
            {activeProject.blockers.map((b, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-[#F1F1F3] last:border-0">
                <span className="text-[12px] shrink-0">⛔</span>
                <span className="text-[13px] text-[#DC2626]/80 leading-[1.6]">{b}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
