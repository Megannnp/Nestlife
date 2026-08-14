/**
 * 首次启动初始化测试 — 空数据目录 + production server
 * 运行：npm run test:init（需先 npm run build）
 * 覆盖：首次访问自动创建数据目录、生成种子数据并落库（DB 非空）
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const PORT = 3298;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DATA = `/tmp/nestlife-init-test-${Date.now()}`;

let server;

function waitReady(timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        await fetch(`${BASE}/login`);
        resolve();
      } catch {
        if (Date.now() - start > timeoutMs) reject(new Error("server 启动超时"));
        else setTimeout(tick, 500);
      }
    };
    tick();
  });
}

before(async () => {
  server = spawn("npm", ["run", "start", "--", "-p", String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, NESTLIFE_DATA: DATA },
    stdio: "ignore",
  });
  await waitReady();
});

after(() => {
  server?.kill();
});

test("首次访问自动生成种子数据", async () => {
  const res = await fetch(`${BASE}/api/workspace`);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(d.snapshot, "应有 snapshot");
  assert.ok(Array.isArray(d.snapshot.branches) && d.snapshot.branches.length >= 3, "应有默认分支");
  assert.ok(Array.isArray(d.snapshot.schedule) && d.snapshot.schedule.length > 0, "应有默认时刻表");
  assert.ok(Array.isArray(d.tasks), "tasks 应为数组");
});

test("种子数据已落库（备份/每日脚本可读）", async () => {
  const db = new DatabaseSync(path.join(DATA, "nestlife.db"));
  const row = db.prepare("SELECT snapshot FROM workspace WHERE id = 1").get();
  assert.ok(row, "workspace 表应有数据");
  const snap = JSON.parse(row.snapshot);
  assert.ok(Object.keys(snap).length > 0, "snapshot 不应为空");
  assert.ok(snap.branches?.length >= 3, "分支应入库");
  const habits = db.prepare("SELECT COUNT(*) c FROM habits").get();
  assert.ok(habits.c >= 1, "习惯应入库");
  db.close();
  assert.ok(fs.existsSync(DATA), "数据根目录应自动创建");
});
