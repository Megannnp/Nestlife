import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { KB_DIR } from "../../../../lib/config.ts";

const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".json", ".csv", ".yml", ".yaml", ".html", ".js", ".ts", ".py", ".sql"]);

/** 主题词扩展：查询词 → 相关词（简易语义） */
const TOPIC_EXPANSION: Record<string, string[]> = {
  语法: ["语法", "从句", "时态", "句型", "grammar", "句法"],
  写作: ["写作", "作文", "批改", "writing", "essay"],
  语音: ["语音", "发音", "音标", "口语", "连读"],
  阅读: ["阅读", "reading", "精读"],
  词汇: ["词汇", "单词", "vocabulary"],
  听力: ["听力", "listening"],
  考研: ["考研", "真题", "数学", "英语一", "政治"],
  论文: ["论文", "研究", "literature", "写作", "开题", "文献"],
  读博: ["博士", "申请", "导师", "phd"],
  AI: ["ai", "人工智能", "agent", "大模型", "llm", "学习"],
  教育: ["教育", "教学", "教师", "课程", "课堂"],
  课程: ["课程", "讲义", "训练营", "语法课", "lesson"],
  品牌: ["品牌", "公众号", "内容", "获客", "营销"],
};

function expandQuery(q: string): string[] {
  const terms = new Set<string>([q]);
  for (const [key, list] of Object.entries(TOPIC_EXPANSION)) {
    if (q.includes(key) || key.includes(q) || list.some((t) => q.includes(t))) {
      list.forEach((t) => terms.add(t));
    }
  }
  return Array.from(terms);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  if (!q) return NextResponse.json({ results: [] });
  if (!fs.existsSync(KB_DIR)) return NextResponse.json({ results: [] });

  const terms = expandQuery(q);

  const results: { file: string; snippet: string; score: number; matched: string[] }[] = [];

  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === ".DS_Store") continue;
      const full = path.join(dir, e.name);
      try {
        if (e.isDirectory()) {
          walk(full);
        } else if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (!TEXT_EXT.has(ext)) continue;
          const stat = fs.statSync(full);
          if (stat.size > 3_000_000) continue; // 整本书上限 3MB（2026-08-04 书籍入库后放宽，原 200KB 会漏掉所有书）
          const content = fs.readFileSync(full, "utf-8");
          const lower = content.toLowerCase();
          const filenameLower = e.name.toLowerCase();

          let score = 0;
          const matched: string[] = [];
          for (const term of terms) {
            // 标题/文件名命中 → 高权重
            if (filenameLower.includes(term)) score += 5;
            // 精确词频
            let pos = 0;
            let count = 0;
            while ((pos = lower.indexOf(term, pos)) !== -1) {
              count++;
              pos += term.length;
            }
            if (count > 0) {
              score += count * (term === q ? 2 : 1);
              matched.push(term);
            }
          }
          // 首段命中加分（正文前 500 字）
          if (lower.slice(0, 500).includes(q)) score += 3;

          if (score <= 0) continue;
          const idx = lower.indexOf(q);
          const start = Math.max(0, idx - 60);
          const snippet = content.slice(start, (idx === -1 ? 0 : idx) + q.length + 120).replace(/\s+/g, " ").trim();
          results.push({
            file: full.slice(KB_DIR.length + 1),
            snippet: `…${snippet}…`,
            score,
            matched,
          });
        }
      } catch {
        // skip
      }
    }
  };

  walk(KB_DIR);
  results.sort((a, b) => b.score - a.score);
  return NextResponse.json({
    q,
    terms,
    count: results.length,
    results: results.slice(0, 20).map(({ matched, ...rest }) => {
      void matched; // matched 仅内部计算用，响应中剔除
      return rest;
    }),
  });
}
