/**
 * 核心逻辑单元测试 — 纯函数级，无需浏览器/服务器
 * 运行：node --test --test-concurrency=1 tests/unit.test.mjs
 * 说明：Node 22.6+ 原生支持 .ts（type stripping），直接 import 源码，不依赖 npx/tsx
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const { parseTaskInput } = await import("../src/lib/parse-task.ts");

/** 便捷调用：now 传 ISO 字符串 */
function parse(input, nowStr) {
  return parseTaskInput(input, new Date(nowStr));
}

// ─── 自然语言解析测试 ───
test("parse-task: 明天下午3点交材料", () => {
  const r = parse("明天下午3点交材料", "2026-08-03T10:00:00");
  assert.equal(r.title, "交材料");
  assert.equal(r.date, "2026-08-04");
  assert.equal(r.startTime, "15:00");
});

test("parse-task: 今天上午10点开会", () => {
  const r = parse("今天上午10点开会", "2026-08-03T10:00:00");
  assert.equal(r.title, "开会");
  assert.equal(r.date, "2026-08-03");
  assert.equal(r.startTime, "10:00");
});

test("parse-task: 紧急任务 → high 优先级", () => {
  const r = parse("紧急 明天交软著材料", "2026-08-03T10:00:00");
  assert.equal(r.priority, "high");
  assert.equal(r.title, "交软著材料");
});

test("parse-task: 周五 → 本周五日期", () => {
  const r = parse("周五晚上复习语法", "2026-08-03T10:00:00"); // 周一听
  assert.equal(r.date, "2026-08-07"); // 周五
});

test("parse-task: 无日期时间 → 原样标题", () => {
  const r = parse("整理学习笔记", "2026-08-03T10:00:00");
  assert.equal(r.title, "整理学习笔记");
  assert.equal(r.date, undefined);
});

test("parse-task: 后天 → +2 天", () => {
  const r = parse("后天交材料", "2026-08-03T10:00:00");
  assert.equal(r.date, "2026-08-05");
});

test("parse-task: 大后天 → +3 天", () => {
  const r = parse("大后天面试", "2026-08-03T10:00:00");
  assert.equal(r.date, "2026-08-06");
});

test("parse-task: HH:mm 格式时间", () => {
  const r = parse("14:30 提交周报", "2026-08-03T10:00:00");
  assert.equal(r.title, "提交周报");
  assert.equal(r.startTime, "14:30");
});

test("parse-task: 晚上8点 → 20:00 + 120 分钟", () => {
  const r = parse("晚上8点复习", "2026-08-03T10:00:00");
  assert.equal(r.startTime, "20:00");
  assert.equal(r.minutes, 120);
});

test("parse-task: 有空 → low 优先级", () => {
  const r = parse("有空整理相册", "2026-08-03T10:00:00");
  assert.equal(r.priority, "low");
  assert.equal(r.title, "整理相册");
});

test("parse-task: 周三 → 本周三（周一说）", () => {
  const r = parse("周三开会", "2026-08-03T10:00:00"); // 周一说
  assert.equal(r.date, "2026-08-05");
});

test("parse-task: 下周一（周三说）", () => {
  const r = parse("下周一交论文", "2026-08-05T10:00:00"); // 周三说
  assert.equal(r.date, "2026-08-10");
});

test("parse-task: 今晚8点 → 20:00（时段语义）", () => {
  const r = parse("今晚8点看书", "2026-08-03T10:00:00");
  assert.equal(r.startTime, "20:00");
});

test("parse-task: 明早7点 → 明天 + 07:00", () => {
  const r = parse("明早7点跑步", "2026-08-03T10:00:00");
  assert.equal(r.date, "2026-08-04");
  assert.equal(r.startTime, "07:00");
  assert.equal(r.title, "跑步");
});

test("parse-task: 两点半 → 2:30 + 标题干净", () => {
  const r = parse("两点半开会", "2026-08-03T10:00:00");
  assert.equal(r.startTime, "02:30");
  assert.equal(r.title, "开会");
});

test("parse-task: 上午10点 → 10:00（不被午误判为中午）", () => {
  const r = parse("今天上午10点开会", "2026-08-03T10:00:00");
  assert.equal(r.startTime, "10:00");
});

test("parse-task: 下周三 → 标题干净", () => {
  const r = parse("下周三交报告", "2026-08-03T10:00:00");
  assert.equal(r.title, "交报告");
});

// ─── 热力图逻辑测试 ───
test("heatmap: 周一起始偏移", async () => {
  const { monBasedOffsetOf } = await import("../src/lib/heatmap.ts");
  // 2026-08-03 是周一 → offset 0
  assert.equal(monBasedOffsetOf("2026-08-03"), 0);
  // 2026-08-09 是周日 → offset 6
  assert.equal(monBasedOffsetOf("2026-08-09"), 6);
});

test("heatmap: 网格按周切分", async () => {
  const { buildHeatmapGrid } = await import("../src/lib/heatmap.ts");
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date("2026-08-03");
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), completed: i % 3, minutes: 30 };
  });
  const { grid, weeks } = buildHeatmapGrid(days, 0);
  assert.equal(weeks, 2);
  assert.equal(grid.length, 2);
  assert.equal(grid[0].length, 7);
});

// ─── 工具函数测试 ───
test("utils: 分钟格式化", async () => {
  const { formatMinutes } = await import("../src/lib/utils.ts");
  assert.equal(formatMinutes(30), "30 分钟");
  assert.equal(formatMinutes(90), "1 小时 30 分");
  assert.equal(formatMinutes(120), "2 小时");
});

test("utils: 分支进度平均", async () => {
  const { branchProgress } = await import("../src/lib/utils.ts");
  const goals = [
    { branchId: "career", progress: 50 },
    { branchId: "career", progress: 100 },
    { branchId: "growth", progress: 20 },
  ];
  assert.equal(branchProgress("career", goals), 75);
  assert.equal(branchProgress("growth", goals), 20);
  assert.equal(branchProgress("life", goals), 0);
});

// ─── 复盘周期（时区）测试 ───
test("review-period: 月初凌晨月键取本地月（非 UTC）", async () => {
  const { currentPeriods } = await import("../src/lib/review-period.ts");
  // 本地 8/1 00:30（东八区，UTC 仍是 7/31）→ 月键应为 2026-08
  assert.equal(currentPeriods(new Date(2026, 7, 1, 0, 30)).monthly, "2026-08");
  // 7/31 23:30 → 2026-07
  assert.equal(currentPeriods(new Date(2026, 6, 31, 23, 30)).monthly, "2026-07");
});

// ─── 每日汇总脚本（DB 独立测试，用临时目录） ───
test("daily-summary: 脚本可运行且生成任务", () => {
  const out = execSync(`NESTLIFE_DATA=/tmp/nestlife-unit-${Date.now()} node scripts/daily-summary.mjs 2>&1`, {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf-8",
  });
  assert.match(out, /每日汇总完成/);
});

console.log("✅ 单元测试完成");

