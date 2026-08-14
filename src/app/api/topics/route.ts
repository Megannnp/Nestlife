import { NextResponse } from "next/server";
import { DatabaseSync } from "node:sqlite";
import { todayLocal } from "../../../lib/date-local.ts";
import { DB_FILE } from "../../../lib/config.ts";

/**
 * /api/topics — 内容选题库
 *  GET    列出全部选题（可按 status 过滤）
 *  POST   { title, category?, platform?, status?, note?, date? } 新增
 *  PATCH  { id, patch } 更新状态/平台等
 *  DELETE ?id=
 */

function getDb() {
  const db = new DatabaseSync(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'AI × 教育观察',
      platform TEXT NOT NULL DEFAULT '公众号',
      status TEXT NOT NULL DEFAULT 'idea',
      note TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  try {
    const db = getDb();
    const rows = status
      ? db.prepare("SELECT * FROM topics WHERE status = ? ORDER BY created_at DESC").all(status)
      : db.prepare("SELECT * FROM topics ORDER BY created_at DESC").all();
    db.close();
    return NextResponse.json({
      topics: (rows as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        title: String(r.title),
        category: String(r.category),
        platform: String(r.platform),
        status: String(r.status),
        note: String(r.note ?? ""),
        date: String(r.date),
        createdAt: String(r.created_at),
      })),
    });
  } catch (e) {
    return NextResponse.json({ topics: [], error: e instanceof Error ? e.message : String(e) });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    const now = new Date();
    const id = `tp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const db = getDb();
    db.prepare(
      `INSERT INTO topics (id, title, category, platform, status, note, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      title,
      String(body.category ?? "AI × 教育观察"),
      String(body.platform ?? "公众号"),
      String(body.status ?? "idea"),
      String(body.note ?? ""),
      String(body.date ?? todayLocal()),
      now.toISOString(),
    );
    db.close();
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, patch } = await req.json();
    if (!id || !patch || typeof patch !== "object") {
      return NextResponse.json({ error: "id and patch required" }, { status: 400 });
    }
    const db = getDb();
    const fieldMap: Record<string, string> = {
      title: "title", category: "category", platform: "platform", status: "status", note: "note", date: "date",
    };
    const sets: string[] = [];
    const params: Record<string, string | number> = { id: String(id) };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (patch[key] !== undefined) {
        sets.push(`${col} = @${key}`);
        params[key] = String(patch[key]);
      }
    }
    if (sets.length === 0) return NextResponse.json({ error: "no fields" }, { status: 400 });
    const result = db.prepare(`UPDATE topics SET ${sets.join(", ")} WHERE id = @id`).run(params);
    db.close();
    return NextResponse.json({ ok: Number(result.changes) > 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  db.prepare("DELETE FROM topics WHERE id = ?").run(id);
  db.close();
  return NextResponse.json({ ok: true });
}
