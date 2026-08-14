import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { KB_DIR } from "../../../lib/config.ts";

type KBEntry = {
  name: string;
  relPath: string;
  ext: string;
  size: number;
  mtime: number;
  type: "file" | "dir";
};

function ensureKbDir() {
  fs.mkdirSync(KB_DIR, { recursive: true });
}

function listEntries(dir: string, depth: number): KBEntry[] {
  if (depth > 3) return [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: KBEntry[] = [];
  for (const e of entries) {
    if (e.name === ".DS_Store") continue;
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) {
        out.push({
          name: e.name,
          relPath: full.slice(KB_DIR.length + 1),
          ext: "",
          size: 0,
          mtime: fs.statSync(full).mtimeMs,
          type: "dir",
        });
        out.push(...listEntries(full, depth + 1));
      } else if (e.isFile()) {
        const stat = fs.statSync(full);
        out.push({
          name: e.name,
          relPath: full.slice(KB_DIR.length + 1),
          ext: path.extname(e.name).toLowerCase(),
          size: stat.size,
          mtime: stat.mtimeMs,
          type: "file",
        });
      }
    } catch {
      // skip
    }
  }
  return out;
}

/** GET：列出知识库全部文件（按修改时间倒序） */
export async function GET() {
  ensureKbDir();
  const files = listEntries(KB_DIR, 0).sort((a, b) => b.mtime - a.mtime);
  return NextResponse.json({
    kbPath: KB_DIR,
    total: files.length,
    files,
  });
}

/** POST：两种动作
 *  1. 上传文件（multipart，字段 file + 可选 dir）
 *  2. 新建文件夹（JSON body: { action: "mkdir", dir: "文件夹名" }）
 */
export async function POST(req: Request) {
  ensureKbDir();
  const ct = req.headers.get("content-type") || "";

  // ── 新建文件夹（JSON） ──
  if (ct.includes("application/json")) {
    try {
      const body = await req.json();
      if (body.action === "mkdir") {
        const dir = String(body.dir || "").trim().replace(/^\/+|\/+$/g, "");
        if (!dir || !/^[\w\u4e00-\u9fa5\-\s]+$/.test(dir)) {
          return NextResponse.json({ error: "无效的文件夹名" }, { status: 400 });
        }
        const target = path.join(KB_DIR, dir);
        if (target !== KB_DIR && !target.startsWith(KB_DIR + path.sep)) {
          return NextResponse.json({ error: "not allowed" }, { status: 403 });
        }
        if (fs.existsSync(target)) {
          return NextResponse.json({ error: "文件夹已存在" }, { status: 409 });
        }
        fs.mkdirSync(target, { recursive: true });
        return NextResponse.json({ ok: true, dir });
      }
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── 上传文件（multipart） ──
  try {
    const form = await req.formData();
    const file = form.get("file");
    // 可选子目录：dir=我的文档
    const dir = String(form.get("dir") || "").replace(/^\/+|\/+$/g, "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    // 过滤隐藏文件
    if (file.name.startsWith(".")) {
      return NextResponse.json({ error: "hidden files not allowed" }, { status: 400 });
    }

    // 大小限制 50MB
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "file too large (>50MB)" }, { status: 400 });
    }

    // 防重名：加时间戳后缀
    let filename = file.name;
    const targetDir = dir ? path.join(KB_DIR, dir) : KB_DIR;
    fs.mkdirSync(targetDir, { recursive: true });

    let abs = path.resolve(targetDir, filename);
    // 安全校验
    if (abs !== targetDir && !abs.startsWith(targetDir + path.sep)) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }
    if (fs.existsSync(abs)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      filename = `${base}-${Date.now().toString(36)}${ext}`;
      abs = path.join(targetDir, filename);
    }

    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(abs, buf);

    return NextResponse.json({
      ok: true,
      name: filename,
      relPath: abs.slice(KB_DIR.length + 1),
      size: buf.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** 统计目录内文件数（含子目录） */
function countFilesIn(dir: string): number {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) n += countFilesIn(path.join(dir, e.name));
      else n += 1;
    }
  } catch {
    /* 忽略 */
  }
  return n;
}

/** DELETE：删除文件夹（?path=相对目录&force=1 递归删除） */
export async function DELETE(req: Request) {
  ensureKbDir();
  const { searchParams } = new URL(req.url);
  const rel = (searchParams.get("path") || "").trim().replace(/^\/+|\/+$/g, "");
  if (!rel) return NextResponse.json({ error: "path required" }, { status: 400 });

  const target = path.resolve(KB_DIR, rel);
  if (target !== KB_DIR && !target.startsWith(KB_DIR + path.sep)) {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const count = countFilesIn(target);
  if (count > 0 && searchParams.get("force") !== "1") {
    return NextResponse.json({ error: `目录包含 ${count} 个文件，需确认后删除`, count }, { status: 409 });
  }

  fs.rmSync(target, { recursive: true, force: true });
  return NextResponse.json({ ok: true, removed: count });
}
