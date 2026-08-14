import { NextResponse } from "next/server";
import { loadWorkspaceSnapshot, saveWorkspaceSnapshot } from "../../../lib/db.ts";
import { mergeNavConfig, sanitizeNavConfig, DEFAULT_NAV } from "../../../lib/nav-config.ts";

/**
 * /api/nav-config — 菜单个性化配置（AI 助手对话配置 + 前端读取）
 *  GET    返回合并后的完整菜单（用户配置 + 默认值）
 *  PUT    { items: [{ key, label?, icon?, visible? }] } 保存用户配置
 *  DELETE 恢复默认菜单
 * 存储：workspace 快照的 navConfig 字段
 */

export async function GET() {
  const snapshot = loadWorkspaceSnapshot() ?? {};
  const items = mergeNavConfig(snapshot.navConfig);
  return NextResponse.json({ items, hasCustom: Array.isArray(snapshot.navConfig) });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { items?: unknown };
    const clean = sanitizeNavConfig(body.items);
    if (!clean) return NextResponse.json({ error: "items array required" }, { status: 400 });

    const snapshot = loadWorkspaceSnapshot() ?? {};
    snapshot.navConfig = clean;
    saveWorkspaceSnapshot(snapshot);
    return NextResponse.json({ ok: true, items: mergeNavConfig(clean) });
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }
}

export async function DELETE() {
  const snapshot = loadWorkspaceSnapshot() ?? {};
  delete snapshot.navConfig;
  saveWorkspaceSnapshot(snapshot);
  return NextResponse.json({ ok: true, items: mergeNavConfig(DEFAULT_NAV) });
}
