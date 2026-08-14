import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_URL, OPENCLAW_TOKEN } from "../../../lib/config.ts";
import { readAiConfig } from "../../../lib/ai-config.ts";

/**
 * AI 助手接口：NestLife → AI 执行器网关（OpenAI 兼容端点 /v1/chat/completions）
 * 可插拔：未配置网关时返回「未接入」，核心功能不受影响。
 * 配置优先级：设置页（ai-config.json）→ 环境变量 NESTLIFE_OPENCLAW_URL → ~/.openclaw/openclaw.json（开发兼容）
 */

function readGatewayConfig(): { url: string; token: string } | null {
  // 1. 设置页配置（用户最新设置，无需重启）
  const pageCfg = readAiConfig();
  if (pageCfg) return { url: pageCfg.url, token: pageCfg.token };
  // 2. 环境变量（部署者配置）
  if (OPENCLAW_URL) return { url: OPENCLAW_URL, token: OPENCLAW_TOKEN };
  // 3. openclaw.json（开发环境兼容）
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

/** GET：AI 是否已接入（前端据此提示/隐藏 AI 功能） */
export async function GET() {
  return NextResponse.json({ enabled: readGatewayConfig() !== null });
}

export async function POST(req: Request) {
  try {
    const gw = readGatewayConfig();
    if (!gw) {
      return NextResponse.json(
        { error: "AI 助手未接入：请在设置页填入网关地址（OpenAI 兼容端点）后重试" },
        { status: 503 }
      );
    }
    const { messages, stream } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const res = await fetch(gw.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(gw.token ? { authorization: `Bearer ${gw.token}` } : {}),
      },
      body: JSON.stringify({
        model: "openclaw",
        messages,
        max_tokens: 4096,
        stream: !!stream,
      }),
      // 长任务（AI 可能读文件/执行）给足时间
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `gateway ${res.status}: ${text.slice(0, 300)}` }, { status: 502 });
    }

    // 流式：直接透传 gateway 的 SSE 流
    if (stream) {
      return new Response(res.body, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
