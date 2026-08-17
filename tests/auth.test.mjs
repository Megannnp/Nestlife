/**
 * 认证集成测试 — 自动启动 production server（NESTLIFE_AUTH=1，临时数据目录+临时端口），测完自动关闭
 * 运行：npm run test:auth（需先 npm run build）
 * 覆盖：middleware 401 / 页面重定向 / 登录成功失败 / 认证后 API 访问
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const PORT = 3299;
const BASE = `http://127.0.0.1:${PORT}`; // 用 127.0.0.1 而非 localhost：localhost 已配置为本机免登录
const LOCAL = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DATA = `/tmp/nestlife-auth-test-${Date.now()}`;

let server;

function waitReady(timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        // 有响应（任意状态码）即视为 server 就绪
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
    env: {
      ...process.env,
      NESTLIFE_AUTH: "1",
      NESTLIFE_ADMIN_PASSWORD: "test-pw-123",
      NESTLIFE_DATA: DATA,
    },
    stdio: "ignore",
  });
  await waitReady();
});

after(() => {
  server?.kill();
});

test("未登录访问 API 返回 401", async () => {
  const res = await fetch(`${BASE}/api/workspace`);
  assert.equal(res.status, 401);
});

test("未登录访问页面重定向到 /login", async () => {
  const res = await fetch(`${BASE}/`, { redirect: "manual" });
  assert.equal(res.status, 307);
  assert.ok(res.headers.get("location")?.includes("/login"), "应重定向到登录页");
});

test("错误密码登录返回 401", async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "wrong" }),
  });
  assert.equal(res.status, 401);
});

test("正确密码登录后 API 可访问", async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "test-pw-123" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "应下发 session cookie");

  const res = await fetch(`${BASE}/api/workspace`, { headers: { cookie } });
  assert.equal(res.status, 200, "带 cookie 应可访问 API");
});

test("登录限流：连续失败后锁定（429）", async () => {
  // 连续 5 次错误密码（累计触发锁）
  for (let i = 0; i < 5; i++) {
    await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
  }
  // 第 6 次应被限流
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "wrong" }),
  });
  assert.equal(res.status, 429, "连续失败后应 429");
});

test("全局限流：伪造 X-Forwarded-For 换 IP 无法绕过", async () => {
  // 攻击者每请求伪造不同 XFF IP，按 IP 限流无效 → 由全局兜底限流拦截
  let lastStatus = 0;
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `203.0.113.${i + 1}`,
      },
      body: JSON.stringify({ password: "wrong" }),
    });
    lastStatus = res.status;
  }
  assert.equal(lastStatus, 429, "换 IP 连续失败后仍应被全局限流 429");
});

test("敏感 API 响应不缓存（no-store）", async () => {
  const res = await fetch(`${BASE}/api/workspace`);
  assert.ok(
    (res.headers.get("cache-control") || "").includes("no-store"),
    "受保护 API 应返回 Cache-Control: no-store"
  );
});

test("本机 localhost 免登录（OpenClaw/Mira + 用户本机浏览器）", async () => {
  const res = await fetch(`${LOCAL}/api/workspace`);
  assert.equal(res.status, 200, "localhost 来源应免登录直接访问 API");
});
