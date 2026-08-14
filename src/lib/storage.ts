"use client";

/**
 * NestLife 存储层 v2 — SQLite（经 /api/workspace）
 * 替代旧的 localStorage 方案。数据统一在 data/nestlife.db，AI 助手 可读写全部数据。
 *
 * 流程：
 *  1. 首启：尝试从 API 读；API 空 → 用种子数据初始化并写入
 *  2. 旧 localStorage 数据（nestlife-workspace-v1）自动迁移（一次性）
 *  3. 所有读写走 API，前端不再直写 localStorage
 */

import { seedWorkspace } from "./default-data.ts";
import type { Workspace } from "./types.ts";

const LEGACY_KEY = "nestli…e-v1";

function safeParse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 读取旧 localStorage 数据（迁移源） */
function loadLegacy(): Workspace | null {
  if (typeof window === "undefined") return null;
  const data = safeParse(window.localStorage.getItem(LEGACY_KEY));
  if (!data) return null;
  const seed = seedWorkspace();
  return {
    ...seed,
    ...data,
    projects: data.projects ?? seed.projects,
    milestones: data.milestones ?? seed.milestones,
    habits: data.habits ?? seed.habits,
    dailyNotes: data.dailyNotes ?? seed.dailyNotes,
  } as Workspace;
}

/** 从 API 读取工作区；无数据时初始化（迁移旧数据或种子） */
export async function hydrateWorkspaceAsync(): Promise<Workspace> {
  try {
    const res = await fetch("/api/workspace");
    const data = await res.json();

    // API 有数据 → 合并快照 + tasks 表
    if (data?.snapshot || Array.isArray(data?.tasks)) {
      const seed = seedWorkspace();
      const snapshot = (data.snapshot ?? {}) as Record<string, unknown>;
      const pick = <T,>(key: string, fallback: T): T =>
        (snapshot[key] as T | undefined) ?? fallback;
      const workspace: Workspace = {
        ...seed,
        ...snapshot,
        attitude: pick("attitude", seed.attitude),
        branches: pick("branches", seed.branches),
        goals: pick("goals", seed.goals),
        plans: pick("plans", seed.plans),
        schedule: pick("schedule", seed.schedule),
        reminders: pick("reminders", seed.reminders),
        reviews: pick("reviews", seed.reviews),
        todayTop3: pick("todayTop3", seed.todayTop3),
        projects: pick("projects", seed.projects),
        milestones: pick("milestones", seed.milestones),
        habits: pick("habits", seed.habits),
        dailyNotes: pick("dailyNotes", seed.dailyNotes),
        decisions: pick("decisions", seed.decisions),
        tasks: Array.isArray(data.tasks) ? data.tasks.map(rowToTask) : seed.tasks,
      };
      return workspace;
    }

    // API 空 → 首次初始化：优先迁移旧 localStorage
    const legacy = loadLegacy();
    const initial = legacy ?? seedWorkspace();
    await fetch("/api/workspace", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(initial),
    });
    // 迁移完成后清除旧 localStorage
    if (legacy) {
      try {
        window.localStorage.removeItem(LEGACY_KEY);
      } catch {}
    }
    return initial;
  } catch {
    // API 不可用（如纯静态）→ 回退种子
    return seedWorkspace();
  }
}

/** 保存工作区（全量） */
export async function saveWorkspaceAsync(workspace: Workspace): Promise<boolean> {
  try {
    const res = await fetch("/api/workspace", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        snapshot: workspace,
        tasks: workspace.tasks,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 重置为种子数据 */
export async function resetWorkspaceAsync(): Promise<Workspace> {
  const seed = seedWorkspace();
  await fetch("/api/workspace", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(seed),
  });
  return seed;
}

/** DB 行 → 前端 Task 类型 */
function rowToTask(row: Record<string, unknown>): import("./types").Task {
  return {
    id: String(row.id),
    branchId: (String(row.branch_id ?? "career") as import("./types").BranchId),
    title: String(row.title),
    date: String(row.date),
    startTime: row.start_time ? String(row.start_time) : undefined,
    minutes: Number(row.minutes ?? 60),
    priority: (row.priority as "high" | "mid" | "low") ?? "mid",
    status: (row.status as "todo" | "doing" | "done" | "deferred") ?? "todo",
    note: String(row.note ?? ""),
    createdAt: String(row.created_at ?? ""),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    source: row.source ? String(row.source) : undefined,
    auto: Number(row.auto ?? 0) === 1,
    goalId: row.goal_id ? String(row.goal_id) : undefined,
  };
}
