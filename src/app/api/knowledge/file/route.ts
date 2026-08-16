import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { KB_DIR } from "../../../../lib/config.ts";

/**
 * 知识文件接口：预览 / 新建文档 / 保存编辑 / 删除。
 * 全部限制在知识库目录（NESTLIFE_DATA/knowledge）内（防路径穿越）。
 */

function safeResolve(rel: string): string | null {
  // 拒绝路径穿越段：sub/.. 会被 resolve 到 KB_DIR 根，统一拦截
  if (rel.split("/").includes("..")) return null;
  const abs = path.resolve(KB_DIR, rel);
  if (abs !== KB_DIR && !abs.startsWith(KB_DIR + path.sep)) return null;
  return abs;
}

const TEXT_EXT = new Set([
  ".md", ".markdown", ".txt", ".js", ".jsx", ".ts", ".tsx", ".json", ".css",
  ".html", ".py", ".yml", ".yaml", ".csv", ".xml", ".sql", ".sh",
]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

/** GET：读取文件内容 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rel = (searchParams.get("path") || "").trim();
  if (!rel) return NextResponse.json({ error: "path required" }, { status: 400 });

  const abs = safeResolve(rel);
  if (!abs) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ext = path.extname(abs).toLowerCase();

  if (TEXT_EXT.has(ext)) {
    const stat = fs.statSync(abs);
    const isBig = stat.size > 100_000;
    const full = searchParams.get("full") === "1"; // 阅读器需要全文
    let content = "";
    if (!isBig || full) content = fs.readFileSync(abs, "utf-8");
    return NextResponse.json({ name: path.basename(abs), ext, size: stat.size, truncated: isBig && !full, content });
  }

  if (IMAGE_EXT.has(ext)) {
    const buf = fs.readFileSync(abs);
    const mime = ext === ".svg" ? "image/svg+xml" : ext === ".jpg" ? "image/jpeg" : `image/${ext.slice(1)}`;
    return NextResponse.json({ name: path.basename(abs), ext, size: buf.length, image: `data:${mime};base64,${buf.toString("base64")}` });
  }

  return NextResponse.json({ name: path.basename(abs), ext, size: fs.statSync(abs).size, unsupported: true });
}

/** POST：新建文档（body: { name, content }） */
export async function POST(req: Request) {
  const { name, content = "" } = await req.json();
  if (!name || !/^[\w\u4e00-\u9fa5-]+\.md$/.test(name)) {
    return NextResponse.json({ error: "name must be a .md filename" }, { status: 400 });
  }
  const abs = safeResolve(name);
  if (!abs) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  fs.mkdirSync(KB_DIR, { recursive: true });
  if (fs.existsSync(abs)) {
    return NextResponse.json({ error: "file already exists" }, { status: 409 });
  }
  fs.writeFileSync(abs, content, "utf-8");
  return NextResponse.json({ ok: true, name, size: Buffer.byteLength(content) });
}

/** PUT：保存编辑（body: { path, content }） */
export async function PUT(req: Request) {
  const { path: rel, content = "" } = await req.json();
  if (!rel) return NextResponse.json({ error: "path required" }, { status: 400 });
  const abs = safeResolve(rel);
  if (!abs) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const ext = path.extname(abs).toLowerCase();
  if (!TEXT_EXT.has(ext)) return NextResponse.json({ error: "not a text file" }, { status: 400 });
  if (!fs.existsSync(abs)) return NextResponse.json({ error: "not found" }, { status: 404 });
  fs.writeFileSync(abs, content, "utf-8");
  return NextResponse.json({ ok: true, size: Buffer.byteLength(content) });
}

/** DELETE：删除文件（query: path） */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const rel = (searchParams.get("path") || "").trim();
  if (!rel) return NextResponse.json({ error: "path required" }, { status: 400 });
  const abs = safeResolve(rel);
  if (!abs) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  fs.unlinkSync(abs);
  return NextResponse.json({ ok: true });
}
