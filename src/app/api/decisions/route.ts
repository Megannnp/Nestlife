import { NextResponse } from "next/server";
import { DatabaseSync } from "node:sqlite";
import { dateLocal } from "../../../lib/date-local.ts";
import { DB_FILE } from "../../../lib/config.ts";

/**
 * /api/decisions — 决策自动生成接口（AI 助手自动记录 + 前端读取）
 *  GET    列出全部决策
 *  POST   { title, context?, decision?, rationale?, alternatives?, branchId?, status?, source? }
 *         自动记录
 */

function getDb() {
  const db = new DatabaseSync(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      decision TEXT NOT NULL DEFAULT '',
      rationale TEXT NOT NULL DEFAULT '',
      alternatives TEXT NOT NULL DEFAULT '',
      branch_id TEXT NOT NULL DEFAULT 'career',
      status TEXT NOT NULL DEFAULT 'accepted',
      date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '对话',
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM decisions ORDER BY date DESC, created_at DESC").all() as Record<string, unknown>[];
    db.close();
    const decisions = rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      context: String(r.context ?? ""),
      decision: String(r.decision ?? ""),
      rationale: String(r.rationale ?? ""),
      alternatives: String(r.alternatives ?? ""),
      branchId: String(r.branch_id ?? "career"),
      status: String(r.status ?? "accepted"),
      date: String(r.date),
      source: String(r.source ?? "对话"),
      createdAt: String(r.created_at),
    }));
    return NextResponse.json({ decisions });
  } catch (e) {
    return NextResponse.json({ decisions: [], error: e instanceof Error ? e.message : String(e) });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    const now = new Date();
    const dateStr = dateLocal(now);
    const id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const db = getDb();
    db.prepare(
      `INSERT INTO decisions (id, title, context, decision, rationale, alternatives, branch_id, status, date, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      title,
      String(body.context ?? ""),
      String(body.decision ?? ""),
      String(body.rationale ?? ""),
      String(body.alternatives ?? ""),
      String(body.branchId ?? "career"),
      String(body.status ?? "accepted"),
      String(body.date ?? dateStr),
      String(body.source ?? "对话"),
      now.toISOString(),
    );
    db.close();
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
