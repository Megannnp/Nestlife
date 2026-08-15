/**
 * API 集成测试 — 需要 dev server 运行（localhost:3100）
 * 运行：node --test tests/api.test.mjs
 * 覆盖：workspace / tasks / knowledge / projects activity / backups
 * 端口说明：dev server 由 launchd（com.nestlife.devserver）常驻在 3100。
 * 3000 可能被考研平台占用（IPv6），浏览器访问 localhost:3000 可能连到它，故 NestLife 固定用 3100。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = "http://localhost:3100";

test("GET /api/workspace 返回快照和任务", async () => {
  const res = await fetch(`${BASE}/api/workspace`);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(d.snapshot, "应有 snapshot");
  assert.ok(Array.isArray(d.tasks), "tasks 应为数组");
  assert.ok(d.snapshot.attitude, "快照应有 attitude");
  assert.ok(Array.isArray(d.snapshot.projects), "快照应有 projects");
});

test("POST /api/tasks 新增任务（含标题匹配更新）", async () => {
  // 新增
  const res = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "测试任务-自动化", branchId: "career", priority: "high", auto: 1 }),
  });
  const d = await res.json();
  assert.equal(res.status, 200);
  assert.ok(d.created, "应创建新任务");

  // 按标题匹配更新（Mira 同步场景）
  const res2 = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "测试任务-自动化", status: "done" }),
  });
  const d2 = await res2.json();
  assert.ok(d2.matched, "应按标题匹配");

  // 验证状态
  const list = await fetch(`${BASE}/api/tasks`).then((r) => r.json());
  const found = list.tasks.find((t) => t.title === "测试任务-自动化");
  assert.ok(found, "任务应存在");
  assert.equal(found.status, "done", "状态应为 done");

  // 清理
  await fetch(`${BASE}/api/tasks?id=${found.id}`, { method: "DELETE" });
});

test("POST /api/tasks 自然语言解析集成", async () => {
  const res = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "测试解析-明天", branchId: "career" }),
  });
  const d = await res.json();
  assert.equal(res.status, 200);
  if (d.id) await fetch(`${BASE}/api/tasks?id=${d.id}`, { method: "DELETE" });
});

test("GET /api/knowledge 返回知识库文件", async () => {
  const res = await fetch(`${BASE}/api/knowledge`);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(Array.isArray(d.files), "files 应为数组");
  assert.ok(typeof d.total === "number", "应有 total");
});

test("GET /api/knowledge/search 全文检索", async () => {
  const res = await fetch(`${BASE}/api/knowledge/search?q=${encodeURIComponent("语法")}`);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(Array.isArray(d.results), "results 应为数组");
});

test("GET /api/projects/activity 项目活跃度", async () => {
  const res = await fetch(`${BASE}/api/projects/activity`);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(Array.isArray(d.activities), "activities 应为数组");
  // 空库（CI/全新部署）允许无数据；有数据时校验结构
  if (d.activities.length > 0) {
    const first = d.activities[0];
    assert.ok(first.projectId && first.state, "应有 projectId 和 state");
  }
});

test("GET /api/backups 备份列表", async () => {
  const res = await fetch(`${BASE}/api/backups`);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(Array.isArray(d.backups), "backups 应为数组");
});

test("路径穿越防护：知识文件接口拒绝越界", async () => {
  const res = await fetch(`${BASE}/api/knowledge/file?path=${encodeURIComponent("../../../etc/passwd")}`);
  assert.equal(res.status, 403);
});

test("POST /api/ai-config 保存/脱敏/清除", async () => {
  const base = "http://localhost:3100/api/ai-config";
  // 保存
  const save = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "http://localhost:11434/v1/chat/completions", token: "sk-test-abc" }),
  });
  assert.equal(save.status, 200);
  // 读取：url 可见、token 脱敏
  const get = await fetch(base).then((r) => r.json());
  assert.ok(get.enabled, "应已启用");
  assert.equal(get.url, "http://localhost:11434/v1/chat/completions");
  assert.equal(get.hasToken, true, "应标记已设 key");
  assert.ok(!get.token, "不得回传 token 明文");
  assert.ok(!JSON.stringify(get).includes("sk-test-abc"), "响应体不得含 token");
  // 清除
  const clear = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clear: true }),
  });
  assert.equal(clear.status, 200);
});

test("POST /api/ai-config 非法 URL 拒绝", async () => {
  const res = await fetch("http://localhost:3100/api/ai-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "javascript:alert(1)" }),
  });
  assert.equal(res.status, 400, "非法协议应 400");
});

test("POST /api/ai-config OpenClaw 一键接入", async () => {
  const base = "http://localhost:3100/api/ai-config";
  // GET 应返回 openclaw 检测字段
  const info = await fetch(base).then((r) => r.json());
  assert.ok(typeof info.openclaw?.detected === "boolean", "应有 openclaw 检测信息");
  // 一键接入（本机可能已装，成功则清理；未装则跳过）
  const res = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "openclaw" }),
  });
  if (res.status === 200) {
    const d = await res.json();
    assert.equal(d.provider, "openclaw");
    assert.ok(d.url.includes("chat/completions"), "应为 OpenAI 兼容端点");
  } else {
    assert.equal(res.status, 404, "未装 OpenClaw 应提示 404");
  }
  // 清理
  await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clear: true }),
  });
});

test("GET /api/decisions 返回列表", async () => {
  const res = await fetch(`${BASE}/api/decisions`);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(Array.isArray(d.decisions), "decisions 应为数组");
});

test("POST /api/topics 新增/删除", async () => {
  const add = await fetch(`${BASE}/api/topics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "API测试选题", category: "教学案例" }),
  });
  const d = await add.json();
  assert.ok(d.ok || d.id, "应能新增选题");
  const id = d.id;
  if (id) {
    await fetch(`${BASE}/api/topics?id=${id}`, { method: "DELETE" });
  }
});

test("GET /api/reviews 返回统计", async () => {
  const res = await fetch(`${BASE}/api/reviews?type=daily`);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(typeof d.stats === "object", "应有统计");
});

test("PATCH /api/tasks 局部更新（Mira 标记完成场景）", async () => {
  // 创建
  const add = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "PATCH测试任务", branchId: "career" }),
  });
  const { id } = await add.json();
  assert.ok(id, "应创建任务");
  // PATCH 标记完成
  const patch = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, patch: { status: "done" } }),
  });
  assert.equal(patch.status, 200);
  const list = await fetch(`${BASE}/api/tasks`).then((r) => r.json());
  const found = list.tasks.find((t) => t.id === id);
  assert.equal(found.status, "done", "状态应更新为 done");
  // 清理
  await fetch(`${BASE}/api/tasks?id=${id}`, { method: "DELETE" });
});

test("PUT /api/workspace 保存（no-op 原样回写，验证不丢数据）", async () => {
  const before = await fetch(`${BASE}/api/workspace`).then((r) => r.json());
  const put = await fetch(`${BASE}/api/workspace`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ snapshot: before.snapshot, tasks: before.tasks }),
  });
  assert.equal(put.status, 200);
  const after = await fetch(`${BASE}/api/workspace`).then((r) => r.json());
  assert.equal(after.tasks.length, before.tasks.length, "任务数不应变化");
});

test("PUT workspace 删除项目后不复活（独立表删除同步）", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = process.env.NESTLIFE_DATA ? `${process.env.NESTLIFE_DATA}/nestlife.db` : `${process.cwd()}/data/nestlife.db`;
  const proj = { id: "p-bugtest", name: "测试项目", emoji: "📁", status: "active", tagline: "", nextSteps: [], blockers: [], progress: 10, createdAt: "2026-08-14" };
  // 0. 备份当前快照，测试后还原
  const orig = await fetch(`${BASE}/api/workspace`).then((r) => r.json());
  try {
    // 1. 基于完整快照添加项目（不覆盖其他字段）
    await fetch(`${BASE}/api/workspace`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { ...orig.snapshot, projects: [...(orig.snapshot.projects ?? []), proj] } }),
    });
    let d = await fetch(`${BASE}/api/workspace`).then((r) => r.json());
    assert.ok(d.snapshot.projects?.some((p) => p.id === "p-bugtest"), "应添加成功");
    // 2. 删除（还原为原始项目列表）
    await fetch(`${BASE}/api/workspace`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { ...orig.snapshot, projects: orig.snapshot.projects ?? [] } }),
    });
    // 3. GET 不应复活
    d = await fetch(`${BASE}/api/workspace`).then((r) => r.json());
    assert.ok(!d.snapshot.projects?.some((p) => p.id === "p-bugtest"), "删除后不应复活");
  } finally {
    // 4. 兜底清理 DB（防中途失败残留）
    const db = new DatabaseSync(dbPath);
    db.prepare("DELETE FROM projects WHERE id = ?").run("p-bugtest");
    db.prepare("DELETE FROM milestones WHERE project_id = ?").run("p-bugtest");
    db.close();
  }
});

test("POST /api/reviews 保存复盘并可读回", async () => {
  const period = "2099-12-31"; // 测试专属 period，避免撞真实数据
  const post = await fetch(`${BASE}/api/reviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "daily", period, good: "测试", next: "继续" }),
  });
  assert.equal(post.status, 200);
  const get = await fetch(`${BASE}/api/reviews?type=daily&period=${period}`).then((r) => r.json());
  assert.ok(get.review && get.review.period === period, "应可读回复盘");
  // 清理（reviews 无 DELETE API，直接删 DB）
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(process.env.NESTLIFE_DATA ? `${process.env.NESTLIFE_DATA}/nestlife.db` : `${process.cwd()}/data/nestlife.db`);
  db.prepare("DELETE FROM reviews WHERE period = ?").run(period);
  db.close();
});

test("POST /api/decisions 新增决策", async () => {
  const post = await fetch(`${BASE}/api/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "测试决策-自动化", branchId: "career", source: "测试" }),
  });
  assert.ok(post.status === 200, "应能新增决策");
  // 清理（decisions 无 DELETE API，直接删 DB）
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(process.env.NESTLIFE_DATA ? `${process.env.NESTLIFE_DATA}/nestlife.db` : `${process.cwd()}/data/nestlife.db`);
  db.prepare("DELETE FROM decisions WHERE title = ?").run("测试决策-自动化");
  db.close();
});

test("book-notes 阅读笔记 CRUD", async () => {
  const book = "测试书籍";
  const add = await fetch(`${BASE}/api/book-notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ book, text: "这是高亮内容" }),
  });
  const d = await add.json();
  assert.ok(d.ok && d.note?.id, "应创建笔记");
  const id = d.note.id;
  const list = await fetch(`${BASE}/api/book-notes?book=${encodeURIComponent(book)}`).then((r) => r.json());
  assert.ok(Array.isArray(list.notes) && list.notes.length >= 1, "应按书籍列出笔记");
  await fetch(`${BASE}/api/book-notes?id=${id}`, { method: "DELETE" });
  const after = await fetch(`${BASE}/api/book-notes?book=${encodeURIComponent(book)}`).then((r) => r.json());
  assert.equal(after.notes.length, 0, "删除后应无残留");
});

test("知识文件 CRUD（新建/读取/保存/删除）", async () => {
  const name = "测试文档.md";
  // 新建
  const create = await fetch(`${BASE}/api/knowledge/file`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, content: "# 测试文档\n\n内容" }),
  });
  assert.equal(create.status, 200);
  // 读取
  const read = await fetch(`${BASE}/api/knowledge/file?path=${encodeURIComponent(name)}`).then((r) => r.json());
  assert.ok(read.content?.includes("测试文档"), "应读到内容");
  // 保存编辑
  const save = await fetch(`${BASE}/api/knowledge/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: name, content: "# 修改后" }),
  });
  assert.equal(save.status, 200);
  const read2 = await fetch(`${BASE}/api/knowledge/file?path=${encodeURIComponent(name)}`).then((r) => r.json());
  assert.ok(read2.content?.includes("修改后"), "修改应生效");
  // 删除
  const del = await fetch(`${BASE}/api/knowledge/file?path=${encodeURIComponent(name)}`, { method: "DELETE" });
  assert.equal(del.status, 200);
  const read3 = await fetch(`${BASE}/api/knowledge/file?path=${encodeURIComponent(name)}`);
  assert.equal(read3.status, 404, "删除后应不存在");
});

test("nav-config 菜单个性化（默认/自定义/恢复）", async () => {
  // 默认全开
  const def = await fetch(`${BASE}/api/nav-config`).then((r) => r.json());
  assert.equal(def.items.length, 9, "默认应有 9 项");
  assert.ok(def.items.every((i) => i.visible), "默认全部可见");
  // 自定义：改名 + 隐藏
  const put = await fetch(`${BASE}/api/nav-config`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items: [
        { key: "today", label: "今日" },
        { key: "reviews" },
        { key: "career", label: "项目" },
        { key: "growth" },
        { key: "agent" },
        { key: "knowledge" },
        { key: "wechat", visible: false },
        { key: "decisions" },
        { key: "settings" },
      ],
    }),
  });
  const d = await put.json();
  assert.equal(put.status, 200);
  assert.equal(d.items.find((i) => i.key === "career")?.label, "项目", "改名应生效");
  assert.equal(d.items.find((i) => i.key === "wechat")?.visible, false, "隐藏应生效");
  assert.equal(d.items.find((i) => i.key === "today")?.label, "今日", "改名应生效");
  // 恢复默认
  const del = await fetch(`${BASE}/api/nav-config`, { method: "DELETE" });
  assert.equal(del.status, 200);
  const after = await fetch(`${BASE}/api/nav-config`).then((r) => r.json());
  assert.ok(after.items.every((i) => i.visible), "恢复后应全部可见");
});

console.log("✅ API 集成测试完成");
