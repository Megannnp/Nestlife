import type { Workspace, Branch, Goal, Plan, Task, ScheduleItem, Reminder, Attitude, Project, Milestone, Habit, Decision } from "./types.ts";
import { todayLocal } from "./date-local.ts";

/** 当前数据版本 */
export const STORAGE_VERSION = 1;

/**
 * ═══ 首次启动的通用模板 ═══
 * 只保留系统结构（分支/时刻表/通用习惯），业务数据全部留空，
 * 由用户通过「人生态度」「目标」「项目」自行填写，避免带入任何个人内容。
 */

/** ═══ 人生态度（占位，引导用户编辑） ═══ */

export const seedAttitude: Attitude = {
  sourcePath: "",
  who: "（在这里写下「我是谁」——你的人生态度，是系统一切规划的起点。）",
  beliefs: [
    "人是可被重新定义的。",
    "记录、复盘、迭代，让经验变成可复用的资产。",
    "先理解目标，再行动。",
  ],
  how: [
    "拆小步，每天推进。",
    "定期复盘，让每一天都算数。",
    "学习和创造优先：学了就要用出来。",
  ],
  become: "（写下一个你正在成为的人。）",
};

/** ═══ 分支（L1，系统结构，通用） ═══ */

export const seedBranches: Branch[] = [
  {
    id: "career",
    name: "事业",
    emoji: "🏗️",
    tagline: "正在推进的事业与项目",
    status: "on_track",
    color: "#2563EB",
  },
  {
    id: "growth",
    name: "成长",
    emoji: "🌱",
    tagline: "学习 · 技能 · 长期成长",
    status: "on_track",
    color: "#059669",
  },
  {
    id: "life",
    name: "生活",
    emoji: "🏡",
    tagline: "健康 · 家庭 · 重要的人",
    status: "on_track",
    color: "#D97706",
  },
];

/** ═══ 初始数据：全部留空，用户自行开始 ═══ */

export const seedGoals: Goal[] = [];
export const seedPlans: Plan[] = [];
export const seedTasks: Task[] = [];

/** ═══ 时刻表（通用框架，用户可改） ═══ */

export const seedSchedule: ScheduleItem[] = [
  { id: "s-1", time: "06:00", title: "起床 · 晨间准备", branchId: "life", repeat: "daily" },
  { id: "s-2", time: "07:00", title: "上午 专注时段", branchId: "career", repeat: "daily" },
  { id: "s-3", time: "12:00", title: "午饭 · 休息", branchId: "life", repeat: "daily" },
  { id: "s-4", time: "14:00", title: "下午 推进事项", branchId: "career", repeat: "daily" },
  { id: "s-5", time: "18:00", title: "晚饭", branchId: "life", repeat: "daily" },
  { id: "s-6", time: "19:30", title: "晚上 学习 / 复盘", branchId: "growth", repeat: "daily" },
  { id: "s-7", time: "23:00", title: "收尾 · 休息", branchId: "life", repeat: "daily" },
];

export const seedReminders: Reminder[] = [];

/** ═══ 事业：项目（留空，用户自行创建） ═══ */

export const seedProjects: Project[] = [];
export const seedMilestones: Milestone[] = [];

/** ═══ 成长：习惯（通用推荐，用户可改） ═══ */

export const seedHabits: Habit[] = [
  { id: "h-1", name: "运动", emoji: "🏃", doneDates: [], createdAt: todayLocal() },
  { id: "h-2", name: "复盘", emoji: "📝", doneDates: [], createdAt: todayLocal() },
  { id: "h-3", name: "早睡早起", emoji: "🌅", doneDates: [], createdAt: todayLocal() },
];

/** ═══ 决策室（留空） ═══ */

export const seedDecisions: Decision[] = [];

/** ═══ 完整工作区默认数据 ═══ */

export function seedWorkspace(): Workspace {
  return {
    storageVersion: STORAGE_VERSION,
    attitude: seedAttitude,
    branches: seedBranches,
    goals: seedGoals,
    plans: seedPlans,
    tasks: seedTasks,
    schedule: seedSchedule,
    reminders: seedReminders,
    reviews: [],
    todayTop3: [],
    projects: seedProjects,
    milestones: seedMilestones,
    habits: seedHabits,
    dailyNotes: [],
    decisions: seedDecisions,
  };
}
