import { NextResponse } from "next/server";
import { listBookNotes, addBookNote, deleteBookNote } from "../../../lib/db.ts";

/**
 * /api/book-notes — 阅读笔记/高亮
 *  GET    ?book=书籍路径 → 该书全部笔记
 *  POST   { book, text, note } → 新增
 *  DELETE ?id= → 删除
 */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const book = searchParams.get("book") || "";
  if (!book) return NextResponse.json({ error: "book required" }, { status: 400 });
  return NextResponse.json({ notes: listBookNotes(book) });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      book?: string;
      text?: string;
      note?: string;
      occurrence?: number;
      paraIndex?: number;
      startOffset?: number;
      endOffset?: number;
    };
    const book = body.book ?? "";
    const text = body.text ?? "";
    if (!book || !text.trim()) {
      return NextResponse.json({ error: "book and text required" }, { status: 400 });
    }
    const loc =
      body.paraIndex != null && body.startOffset != null && body.endOffset != null
        ? { paraIndex: Number(body.paraIndex), startOffset: Number(body.startOffset), endOffset: Number(body.endOffset) }
        : undefined;
    const saved = addBookNote(book, text.trim().slice(0, 2000), (body.note ?? "").slice(0, 4000), Number(body.occurrence ?? 1), loc);
    return NextResponse.json({ ok: true, note: saved });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return NextResponse.json({ ok: deleteBookNote(id) });
}
