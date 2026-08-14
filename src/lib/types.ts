"use client";

/**
 * NestLife 数据模型
 * 参照既有产品 types 设计。
 * 四层结构：人生态度(L0) → 分支目标(L1) → 规划(L2) → 任务/时刻表(L3) → 复盘(L4)
 */

/** 系统视图 */
export type LifeView = "today" | "career" | "growth" | "agent" | "knowledge" | "decisions" | "wechat" | "settings" | "reviews";

/** 分支 ID：事业/成长/生活，未来可扩展 */
export type BranchId = "career" | "growth" | "life";

/** 分支状态灯 */
export type BranchStatus = "on_track" | "attention" | "risk";

/** ═══ L0 人生态度（独立文档内容，展示用） ═══ */

export type AttitudeSection = {
  id: string;
  title: string;
  items: string[];
};

export type Attitude = {
  /** 人生态度文档路径（系统外独立文档） */
  sourcePath: string;
  /** 我是谁 */
  who: string;
  /** 我相信什么 */
  beliefs: string[];
  /** 我怎么活 */
  how: string[];
  /** 我要成为的人 */
  become: string;
};

/** ═══ L1 分支与目标 ═══ */

export type GoalLevel = "long" | "mid" | "short";

export type Goal = {
  id: string;
  branchId: BranchId;
  /** 层级：long=年度/3-5年 · mid=月度 · short=周度 */
  level: GoalLevel;
  title: string;
  /** 目标描述/衡量标准 */
  measure: string;
  /** 截止日期 YYYY-MM-DD */
  dueDate: string;
  /** 进度 0-100 */
  progress: number;
  done: boolean;
  createdAt: string;
  /** 父目标 id（目标树） */
  parentId?: string;
};

export type Branch = {
  id: BranchId;
  name: string;
  emoji: string;
  /** 一句话定位 */
  tagline: string;
  status: BranchStatus;
  /** 分支颜色（Tailwind 可用） */
  color: string;
};

/** ═══ L2 规划 ═══ */

export type PlanType = "year" | "month" | "week";

export type Plan = {
  id: string;
  branchId: BranchId;
  type: PlanType;
  /** 期间标题，如 2026 年度 / 2026-08 月度 / 2026-W33 周度 */
  period: string;
  /** 本期重点（3 条以内） */
  focus: string[];
  /** 本期关键结果 */
  outcomes: string[];
  /** 复盘记录 */
  review: string;
  /** 期间起止 */
  startDate: string;
  endDate: string;
  done: boolean;
  createdAt: string;
};

/** ═══ L3 执行层 ═══ */

export type TaskStatus = "todo" | "doing" | "done" | "deferred";

export type Task = {
  id: string;
  branchId: BranchId;
  title: string;
  /** 关联目标 id */
  goalId?: string;
  /** 计划日期 YYYY-MM-DD */
  date: string;
  /** 开始时间 HH:mm（可空） */
  startTime?: string;
  /** 预计时长（分钟） */
  minutes: number;
  status: TaskStatus;
  /** 优先级 高/中/低 */
  priority: "high" | "mid" | "low";
  note: string;
  createdAt: string;
  completedAt?: string;
  /** 来源：manual / 对话 / 台账 / 日程 / 计划（AI 助手 推断任务） */
  source?: string;
  /** 是否 AI 助手 自动生成 */
  auto?: boolean;
};

/** 时刻表条目 */
export type ScheduleItem = {
  id: string;
  /** 时间 HH:mm */
  time: string;
  title: string;
  branchId: BranchId;
  /** 重复：daily / weekday / none */
  repeat: "daily" | "weekday" | "none";
};

/** 提醒 */
export type Reminder = {
  id: string;
  title: string;
  /** HH:mm */
  time: string;
  /** 提醒日期 YYYY-MM-DD（一次性）或 ""（每日） */
  date: string;
  enabled: boolean;
};

/** ═══ L4 复盘 ═══ */

export type ReviewType = "daily" | "weekly" | "monthly";

export type Review = {
  id: string;
  type: ReviewType;
  /** 复盘期间 YYYY-MM-DD（日）或 YYYY-Www（周）或 YYYY-MM（月） */
  period: string;
  /** 今天/本周做得好的 */
  good: string;
  /** 问题与卡点 */
  problems: string;
  /** 下一步调整 */
  next: string;
  /** 心情 1-5 */
  mood: number;
  createdAt: string;
};

/** ═══ 事业：项目 ═══ */

export type ProjectStatus = "active" | "planning" | "paused" | "done";

export type Project = {
  id: string;
  /** 项目名示例… */
  name: string;
  emoji: string;
  status: ProjectStatus;
  /** 一句话定位 */
  tagline: string;
  /** 下一步行动（只显示要做的） */
  nextSteps: string[];
  /** 阻塞项：卡住的事 */
  blockers: string[];
  /** 在营事项（课程/训练营等运营中内容） */
  activeItems?: string[];
  /** 进度 0-100 */
  progress: number;
  /** 带依据的四维评分（成熟度/用户验证/商业潜力/战略价值） */
  score?: ProjectScore | null;
  createdAt: string;
};

/** 项目评分：四维加权（成熟度40% + 用户验证30% + 商业潜力20% + 战略价值10%） */
export type ProjectScore = {
  dims: { maturity: number; users: number; business: number; strategy: number };
  reasons: { maturity: string; users: string; business: string; strategy: string };
  total: number;
  stars: number;
};

export type Milestone = {
  id: string;
  projectId: string;
  title: string;
  /** 截止日期 YYYY-MM-DD */
  dueDate: string;
  done: boolean;
};

/** ═══ 成长：习惯 ═══ */

export type Habit = {
  id: string;
  name: string;
  emoji: string;
  /** 完成日期列表 YYYY-MM-DD（用于连续天数） */
  doneDates: string[];
  createdAt: string;
};

/** ═══ 成长：每日记录 ═══ */

export type DailyNote = {
  id: string;
  date: string;
  /** 今天学了什么 */
  learned: string;
  /** 今天产出什么 */
  produced: string;
  /** 明天要做什么 */
  tomorrow: string;
  updatedAt: string;
};

/** ═══ 决策室：ADR（Architecture Decision Record 简化版） ═══ */

export type Decision = {
  id: string;
  /** 决策标题：如 训练营改成录播课 */
  title: string;
  /** 背景：为什么面临这个选择 */
  context: string;
  /** 决策内容：选了哪个方案 */
  decision: string;
  /** 依据：知识库引用/理由 */
  rationale: string;
  /** 备选方案 */
  alternatives: string;
  /** 关联分支 */
  branchId: BranchId;
  /** 日期 */
  date: string;
  /** 状态 */
  status: "proposed" | "accepted" | "rejected";
  createdAt: string;
};

/** ═══ 全局状态 ═══ */

export type Workspace = {
  storageVersion: number;
  attitude: Attitude;
  branches: Branch[];
  goals: Goal[];
  plans: Plan[];
  tasks: Task[];
  schedule: ScheduleItem[];
  reminders: Reminder[];
  reviews: Review[];
  todayTop3: string[];
  /** 事业：项目与里程碑 */
  projects: Project[];
  milestones: Milestone[];
  /** 成长：习惯与每日记录 */
  habits: Habit[];
  dailyNotes: DailyNote[];
  /** 决策室：ADR 记录 */
  decisions: Decision[];
  /** 菜单个性化配置（可选，见 nav-config.ts） */
  navConfig?: unknown;
};
