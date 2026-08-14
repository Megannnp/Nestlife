import { todayLocal } from "../../../lib/date-local.ts";
import { NextResponse } from "next/server";
import {
  listTasks, upsertTask, patchTask, deleteTask, findTaskByTitle,
} from "../../../lib/db.ts";

/**
 * /api/tasks — 任务专用接口（AI 助手 同步用 + 前端通用）
 *  GET        按 ?date= 过滤查询
 *  POST       { id?, title, branchId?, priority?, minutes?, note?, date?, status?, source?, auto? }
 *             → 有 id 更新；无 id 按 title 匹配更新；都无则新增
 *  PATCH      { id 或 title, patch: {...} } → 局部更新（AI 助手 标记完成用）
 *  DELETE     ?id= 删除
 */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || undefined;
  return NextResponse.json({ tasks: listTasks(date) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, title } = body;
    if (!title && !id) return NextResponse.json({ error: "title or id required" }, { status: 400 });

    const now = todayLocal();

    // 有 id → 更新
    if (id) {
      const fields = ["branch_id", "title", "date", "minutes", "priority", "status", "note", "source", "auto", "start_time", "goal_id", "completed_at"] as const;
      const patch: Record<string, unknown> = {};
      for (const f of fields) {
        const key = f === "branch_id" ? "branchId" : f === "start_time" ? "startTime" : f === "completed_at" ? "completedAt" : f === "goal_id" ? "goalId" : f;
        if (body[key] !== undefined) patch[f] = body[key];
      }
      if (Object.keys(patch).length > 0) patchTask(id, patch);
      return NextResponse.json({ ok: true, id });
    }

    // 按标题匹配（AI 助手：说"任务完成了"→ 匹配标题含关键词的任务）
    if (title) {
      const existing = findTaskByTitle(String(title));
      if (existing) {
        const patch: Record<string, unknown> = {};
        if (body.status) patch.status = body.status;
        if (body.priority) patch.priority = body.priority;
        if (body.branchId) patch.branch_id = body.branchId;
        if (body.note !== undefined) patch.note = body.note;
        if (body.completedAt !== undefined) patch.completed_at = body.completedAt;
        patchTask(existing.id, patch);
        return NextResponse.json({ ok: true, id: existing.id, matched: true });
      }
    }

    // 新增
    const newId = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    upsertTask({
      id: newId,
      branch_id: String(body.branchId ?? "career"),
      title: String(title),
      date: String(body.date ?? now),
      start_time: body.startTime ? String(body.startTime) : null,
      minutes: Number(body.minutes ?? 60),
      priority: (body.priority as "high" | "mid" | "low") ?? "mid",
      status: (body.status as TaskRowStatus) ?? "todo",
      note: String(body.note ?? ""),
      source: String(body.source ?? "manual"),
      auto: Number(body.auto ?? 0),
      goal_id: body.goalId ? String(body.goalId) : null,
      created_at: now,
      completed_at: body.completedAt ? String(body.completedAt) : null,
    });
    return NextResponse.json({ ok: true, id: newId, created: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type TaskRowStatus = "todo" | "doing" | "done" | "deferred";

/** PATCH：按 id 或 title 局部更新 */
export async function PATCH(req: Request) {
  try {
    const { id, title, patch } = await req.json();
    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ error: "patch required" }, { status: 400 });
    }
    let ok = false;
    if (id) {
      ok = patchTask(String(id), patch);
    } else if (title) {
      const existing = findTaskByTitle(String(title));
      if (existing) ok = patchTask(existing.id, patch);
    }
    if (!ok) return NextResponse.json({ error: "task not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteTask(id);
  return NextResponse.json({ ok: true });
}
