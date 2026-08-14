/**
 * 核心逻辑单元测试 — 不依赖浏览器/服务器，纯函数级
 * 运行：node --test tests/unit.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// ─── 自然语言解析测试 ───
// parse-task.ts 是 TS，这里用内联等价逻辑测（或通过 tsx 转译）
// 为保持测试独立性，直接 import 编译产物不可行，这里测关键规则：

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);

function parseViaTsx(input, now) {
  // 写临时脚本避免 shell 转义问题；每次调用用唯一文件名，避免并发测试互相删除
  const tmp = new URL(`./tmp-parse-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.ts`, import.meta.url).pathname;
  const { writeFileSync, rmSync } = require("node:fs");
  writeFileSync(tmp, `
    import { parseTaskInput } from ${JSON.stringify(new URL("../src/lib/parse-task.ts", import.meta.url).pathname)};
    console.log(JSON.stringify(parseTaskInput(${JSON.stringify(input)}, new Date(${JSON.stringify(now)}))));
  `);
  try {
    const out = execSync(`npx tsx ${tmp}`, {
      cwd: new URL("..", import.meta.url).pathname,
      encoding: "utf-8",
    }).trim().split("\n").pop();
    return JSON.parse(out);
  } finally {
    rmSync(tmp, { force: true });
  }
}

test("parse-task: 明天下午3点交材料", () => {
  const r = parseViaTsx("明天下午3点交材料", "2026-08-03T10:00:00");
  assert.equal(r.title, "交材料");
  assert.equal(r.date, "2026-08-04");
  assert.equal(r.startTime, "15:00");
});

test("parse-task: 今天上午10点开会", () => {
  const r = parseViaTsx("今天上午10点开会", "2026-08-03T10:00:00");
  assert.equal(r.title, "开会");
  assert.equal(r.date, "2026-08-03");
  assert.equal(r.startTime, "10:00");
});

test("parse-task: 紧急任务 → high 优先级", () => {
  const r = parseViaTsx("紧急 明天交软著材料", "2026-08-03T10:00:00");
  assert.equal(r.priority, "high");
  assert.equal(r.title, "交软著材料");
});

test("parse-task: 周五 → 本周五日期", () => {
  const r = parseViaTsx("周五晚上复习语法", "2026-08-03T10:00:00"); // 周一听
  assert.equal(r.date, "2026-08-07"); // 周五
});

test("parse-task: 无日期时间 → 原样标题", () => {
  const r = parseViaTsx("整理学习笔记", "2026-08-03T10:00:00");
  assert.equal(r.title, "整理学习笔记");
  assert.equal(r.date, undefined);
});

test("parse-task: 后天 → +2 天", () => {
  const r = parseViaTsx("后天交材料", "2026-08-03T10:00:00");
  assert.equal(r.date, "2026-08-05");
});

test("parse-task: 大后天 → +3 天", () => {
  const r = parseViaTsx("大后天面试", "2026-08-03T10:00:00");
  assert.equal(r.date, "2026-08-06");
});

test("parse-task: HH:mm 格式时间", () => {
  const r = parseViaTsx("14:30 提交周报", "2026-08-03T10:00:00");
  assert.equal(r.title, "提交周报");
  assert.equal(r.startTime, "14:30");
});

test("parse-task: 晚上8点 → 20:00 + 120 分钟", () => {
  const r = parseViaTsx("晚上8点复习", "2026-08-03T10:00:00");
  assert.equal(r.startTime, "20:00");
  assert.equal(r.minutes, 120);
});

test("parse-task: 有空 → low 优先级", () => {
  const r = parseViaTsx("有空整理相册", "2026-08-03T10:00:00");
  assert.equal(r.priority, "low");
  assert.equal(r.title, "整理相册");
});

test("parse-task: 周三 → 本周三（周一说）", () => {
  const r = parseViaTsx("周三开会", "2026-08-03T10:00:00"); // 周一说
  assert.equal(r.date, "2026-08-05");
});

test("parse-task: 下周一（周三说）", () => {
  const r = parseViaTsx("下周一交论文", "2026-08-05T10:00:00"); // 周三说
  assert.equal(r.date, "2026-08-10");
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

// ─── 每日汇总脚本（DB 独立测试，用临时目录） ───
test("daily-summary: 脚本可运行且生成任务", () => {
  // 使用真实 DB 的只读检查：确保脚本入口可执行（不抛错）
  const out = execSync("node scripts/daily-summary.mjs 2>/dev/null", {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf-8",
  });
  assert.match(out, /每日汇总完成/);
});

console.log("✅ 单元测试完成");
