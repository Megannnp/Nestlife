import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { WECHAT_ARTICLES_DIR } from "../../../lib/config.ts";

/**
 * /api/wechat-articles — 已发布内容文章（自动扫描本地目录）
 * 目录由 NESTLIFE_WECHAT_DIR 指定（未配置则返回空）
 */

/** 从文件名推断系列（无固定系列名时返回「其他」） */
function inferSeries(name: string): string {
  const m = name.match(/^【([^】]+)】/);
  if (m) return m[1];
  if (/Vol\.?\s*\d+/i.test(name)) return "系列文章";
  return "其他";
}

/** 从文件名推断期数 Vol */
function inferVol(name: string): string | null {
  const m = name.match(/Vol\.?\s*(\d+)/i) || name.match(/第(\d+)期/);
  return m ? `Vol.${m[1]}` : null;
}

/** 从文件名推断日期（YYYY-MM-DD 或 20260802 格式） */
function inferDate(name: string): string | null {
  const m = name.match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // 从文件 mtime 兜底
  return null;
}

export async function GET() {
  if (!fs.existsSync(WECHAT_ARTICLES_DIR)) {
    return NextResponse.json({ exists: false, articles: [] });
  }

  const entries = fs.readdirSync(WECHAT_ARTICLES_DIR, { withFileTypes: true });
  const articles = entries
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => {
      const name = e.name.replace(/\.(md|html|docx?|pdf)$/i, "");
      const full = path.join(WECHAT_ARTICLES_DIR, e.name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        stat = { mtimeMs: Date.now(), size: 0 } as fs.Stats;
      }
      return {
        name,
        file: e.name,
        series: inferSeries(name),
        vol: inferVol(name),
        date: inferDate(name) ?? new Date(stat.mtimeMs).toISOString().slice(0, 10),
        ext: path.extname(e.name).toLowerCase(),
        mtime: stat.mtimeMs,
        size: stat.size,
      };
    })
    .sort((a, b) => (a.date > b.date ? -1 : 1));

  return NextResponse.json({ exists: true, total: articles.length, articles });
}
