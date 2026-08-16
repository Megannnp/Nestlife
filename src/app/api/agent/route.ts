import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OPENCLAW_URL, OPENCLAW_TOKEN } from "../../../lib/config.ts";
import { readAiConfig } from "../../../lib/ai-config.ts";
import { BUILTIN_TOOLS, BUILTIN_SYSTEM, execTool } from "../../../lib/agent-exec.ts";

/**
 * AI 助手接口：NestLife → AI 执行器网关（OpenAI 兼容端点 /v1/chat/completions）
 * 可插拔：未配置网关时返回「未接入」，核心功能不受影响。
 * 配置优先级：设置页（ai-config.json）→ 环境变量 NESTLIFE_OPENCLAW_URL → ~/.openclaw/openclaw.json（开发兼容）
 */

function readGatewayConfig(): { url: string; token: string; provider: string } | null {
  // 1. 设置页配置（用户最新设置，无需重启）
  const pageCfg = readAiConfig();
  if (pageCfg) return { url: pageCfg.url, token: pageCfg.token, provider: pageCfg.provider ?? "page" };
  // 2. 环境变量（部署者配置）
  if (OPENCLAW_URL) return { url: OPENCLAW_URL, token: OPENCLAW_TOKEN, provider: "env" };
  // 3. openclaw.json（本机已安装 OpenClaw）
  try {
    const p = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    const cfg = JSON.parse(raw);
    const port = cfg.gateway?.port ?? 18789;
    const token = cfg.gateway?.auth?.token ?? cfg.gateway?.auth?.password ?? "";
    return { url: `http://localhost:${port}/v1/chat/completions`, token, provider: "openclaw" };
  } catch {
    return null;
  }
}

/** 判断是否 OpenClaw 网关：配置来源是 openclaw，或 URL 指向默认端口 18789 */
function isOpenClawGateway(gw: { url: string; provider: string }): boolean {
  return gw.provider === "openclaw" || /18789/.test(gw.url);
}

/** GET：AI 是否已接入（前端据此提示/隐藏 AI 功能） */
export async function GET() {
  return NextResponse.json({ enabled: readGatewayConfig() !== null });
}

/** 内置执行器：function calling 循环，让 DeepSeek/Ollama 等网关也能"对话即执行" */
async function runBuiltin(
  gw: { url: string; token: string },
  messages: { role: string; content: string }[]
): Promise<string> {
  const msgs: Record<string, unknown>[] = [
    { role: "system", content: BUILTIN_SYSTEM },
    ...messages.filter((m) => m.role !== "system"),
  ];
  let finalText = "";
  for (let i = 0; i < 3; i++) {
    const res = await fetch(gw.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(gw.token ? { authorization: `Bearer ${gw.token}` } : {}),
      },
      body: JSON.stringify({ model: "openclaw", messages: msgs, tools: BUILTIN_TOOLS, max_tokens: 4096, stream: false }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const text = await res.text();
      // 部分模型/网关不支持 tools（function calling）——降级为纯对话，至少能聊天
      if (i === 0 && /tools?/i.test(text)) {
        const plain = await fetch(gw.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(gw.token ? { authorization: `Bearer ${gw.token}` } : {}),
          },
          body: JSON.stringify({ model: "openclaw", messages: msgs, max_tokens: 4096, stream: false }),
          signal: AbortSignal.timeout(180_000),
        });
        if (!plain.ok) throw new Error(`gateway ${plain.status}: ${(await plain.text()).slice(0, 300)}`);
        const pdata = await plain.json();
        return pdata?.choices?.[0]?.message?.content ?? "(无回复)";
      }
      throw new Error(`gateway ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) return "(无回复)";
    if (msg.content) finalText = msg.content;
    const calls = msg?.tool_calls ?? [];
    if (!calls || calls.length === 0) break;

    // 执行白名单工具，结果回传给 AI
    msgs.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        /* 参数解析失败用空 */
      }
      const result = await execTool(String(call.function?.name ?? ""), args);
      msgs.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  return finalText || "(已完成)";
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

    // OpenClaw → 透传（完整执行能力）；其他网关（DeepSeek / Ollama 等）→ 内置执行器
    if (isOpenClawGateway(gw)) {
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
    }

    // 内置执行器（非 OpenClaw）
    try {
      const content = await runBuiltin(gw, messages);
      if (stream) {
        const sse = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(sse, {
          headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
        });
      }
      return NextResponse.json({ content });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
