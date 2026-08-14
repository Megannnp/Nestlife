import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { KB_DIR, OPENCLAW_URL, OPENCLAW_TOKEN } from "../../../../lib/config.ts";
import { readAiConfig } from "../../../../lib/ai-config.ts";

/**
 * /api/knowledge/ask — 书籍阅读问答（阅读页 AI 助手）
 * POST { file, question }
 * 流程：读书 → 章节/关键词定位相关内容 → 组装上下文 → 转发 AI 网关（可选）
 */

/** 常见停用词（中文提问里的虚词，不参与定位） */
const STOPWORDS = new Set([
  "什么", "怎么", "如何", "为什么", "这个", "那个", "我们", "你们", "他们", "自己", "一个",
  "就是", "可以", "应该", "认为", "觉得", "知道", "没有", "还是", "或者", "然后", "以及",
  "这本书", "这本书里", "结合", "一下", "帮我", "我", "你", "的", "了", "吗", "呢", "呀",
]);

/** AI 网关配置：设置页（ai-config.json）→ 环境变量 NESTLIFE_OPENCLAW_URL → ~/.openclaw/openclaw.json（开发兼容） */
function readGatewayConfig() {
  // 1. 设置页配置优先（用户最新设置）
  const pageCfg = readAiConfig();
  if (pageCfg) return { url: pageCfg.url, token: pageCfg.token };
  // 2. 环境变量
  if (OPENCLAW_URL) {
    return { url: OPENCLAW_URL, token: OPENCLAW_TOKEN };
  }
  // 3. openclaw.json（开发兼容）
  try {
    const p = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    const cfg = JSON.parse(raw);
    const port = cfg.gateway?.port ?? 18789;
    const token = cfg.gateway?.auth?.token ?? cfg.gateway?.auth?.password ?? "";
    return { url: `http://localhost:${port}/v1/chat/completions`, token };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { file?: string; question?: string; mode?: string };
    const file = body.file ?? "";
    const question = body.question ?? "";
    const mode = body.mode ?? "ask";
    if (!file || (!question && mode !== "summary")) {
      return NextResponse.json({ error: "file and question required" }, { status: 400 });
    }

    // 安全解析路径
    const abs = path.resolve(KB_DIR, file);
    if (abs !== KB_DIR && !abs.startsWith(KB_DIR + path.sep)) {
      return NextResponse.json({ error: "not allowed" }, { status: 403 });
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return NextResponse.json({ error: "file not found" }, { status: 404 });
    }
    const stat = fs.statSync(abs);
    if (stat.size > 5_000_000) {
      return NextResponse.json({ error: "file too large for ask" }, { status: 400 });
    }

    const bookContent = fs.readFileSync(abs, "utf-8");
    const bookName = path.basename(abs, path.extname(abs)).replace(/_OCR$/, "");

    // ── 全书总结模式：目录 + 均匀抽样（开头/1/4/1/2/3/4 处） ──
    if (mode === "summary") {
      const headings = bookContent
        .split("\n")
        .filter((l) => /^#{1,4}\s+/.test(l))
        .slice(0, 40)
        .map((h) => h.replace(/^#{1,4}\s*/, "· "))
        .join("\n");
      const len = bookContent.length;
      const samples = [0, 0.25, 0.5, 0.75]
        .map((f) => bookContent.slice(Math.floor(len * f), Math.floor(len * f) + 4000))
        .join("\n\n……\n\n");
      const sys = [
        `你是「筑巢人生 NestLife」的书籍阅读助手。请为《${bookName}》写一份全书总结。`,
        `要求：1) 300-500 字；2) 包含：书的主题、核心观点、全书结构、对读者最有用的 2-3 个要点；`,
        `3) 基于提供的目录和抽样内容，不要编造书里没有的内容；4) 平实中文，不用口号。`,
        `\n【目录】\n${headings || "（无章节结构）"}\n\n【抽样内容】\n${samples.slice(0, 18000)}`,
      ].join("\n");
      const gw = readGatewayConfig();
      if (!gw) return NextResponse.json({ error: "AI 网关未配置（请设置 NESTLIFE_OPENCLAW_URL）" }, { status: 503 });
      const { url, token } = gw;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model: "openclaw",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: "请总结这本书。" },
          ],
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `gateway ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
      }
      const data = await res.json();
      const answer = data?.choices?.[0]?.message?.content ?? "";
      return NextResponse.json({ content: answer, hits: 0, mode: "summary" });
    }

    // ── 定位相关内容：问题关键词 → 命中段落（含前后文） ──
    const qWords = question
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w));

    const paragraphs = bookContent.split(/\n{2,}/);
    const scored = paragraphs
      .map((p, i) => ({
        p,
        i,
        score: qWords.reduce((s, w) => s + (p.includes(w) ? 1 : 0), 0),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    let context: string;
    if (scored.length > 0) {
      // 取前 3 个命中段落及各自上下文（共约 15000 字内）
      const seen = new Set<number>();
      const picked: string[] = [];
      for (const hit of scored.slice(0, 5)) {
        for (let i = Math.max(0, hit.i - 1); i <= Math.min(paragraphs.length - 1, hit.i + 1); i++) {
          if (seen.has(i)) continue;
          seen.add(i);
          picked.push(paragraphs[i].slice(0, 3000));
          if (picked.join("\n").length > 15000) break;
        }
        if (picked.join("\n").length > 15000) break;
      }
      context = picked.join("\n\n");
    } else {
      // 无命中：书开头 + 目录
      const headings = bookContent
        .split("\n")
        .filter((l) => /^#{1,4}\s+/.test(l))
        .slice(0, 40)
        .map((h) => h.replace(/^#{1,4}\s*/, "· "))
        .join("\n");
      context = `【目录】\n${headings || "（无章节结构）"}\n\n【开头内容】\n${bookContent.slice(0, 6000)}`;
    }

    const sys = [
      `你是「筑巢人生 NestLife」的书籍阅读助手。用户正在读《${bookName}》。`,
      `请基于下面提供的书籍内容回答问题，尽量引用原文表述；内容里没有提到的，明确说明"这本书提供的内容里没有提到"，不要编造。`,
      `回答用中文，简洁、直接，300 字以内；如果问题适合给出行动建议（如"怎么应用"），可以在引用原文后给出简短建议。`,
      `\n【《${bookName}》内容片段】\n${context.slice(0, 18000)}`,
    ].join("\n");

    const gw = readGatewayConfig();
    if (!gw) return NextResponse.json({ error: "AI 网关未配置（请设置 NESTLIFE_OPENCLAW_URL）" }, { status: 503 });
    const { url, token } = gw;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: "openclaw",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: question },
        ],
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `gateway ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ content: answer, hits: scored.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
