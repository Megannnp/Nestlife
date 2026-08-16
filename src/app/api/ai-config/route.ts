import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { readAiConfig, saveAiConfig, clearAiConfig } from "../../../lib/ai-config.ts";
import { OPENCLAW_URL } from "../../../lib/config.ts";

/**
 * /api/ai-config — AI 网关配置（设置页读写）
 *  GET    返回当前配置（脱敏：不回传 token 明文）+ OpenClaw 检测信息
 *  POST   { url?, token?, clear?, provider? } 保存；
 *         provider:"openclaw" = 一键接入本机 OpenClaw（自动读取配置与 token）
 */

/** 检测本机 OpenClaw：读取 ~/.openclaw/openclaw.json（存在且有 gateway 配置） */
function detectOpenClaw(): { detected: boolean; url: string; token: string; port: number } {
  try {
    const p = path.join(os.homedir(), ".openclaw", "openclaw.json");
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, "utf-8"));
      const port = Number(cfg.gateway?.port ?? 18789);
      const token = String(cfg.gateway?.auth?.token ?? cfg.gateway?.auth?.password ?? "");
      return { detected: true, url: `http://localhost:${port}/v1/chat/completions`, token, port };
    }
  } catch {
    /* 忽略 */
  }
  return { detected: false, url: "http://localhost:18789/v1/chat/completions", token: "", port: 18789 };
}

/** 是否已有生效网关（设置页配置 / 环境变量 / openclaw.json 开发兼容） */
function hasActiveGateway(): boolean {
  if (readAiConfig()) return true;
  if (OPENCLAW_URL) return true;
  return detectOpenClaw().detected;
}

export async function GET() {
  const cfg = readAiConfig();
  const envConfigured = !!OPENCLAW_URL;
  const oc = detectOpenClaw();
  return NextResponse.json({
    enabled: hasActiveGateway(),
    source: cfg ? "settings" : envConfigured ? "env" : hasActiveGateway() ? "dev" : "none",
    url: cfg?.url ?? "",
    hasToken: !!(cfg?.token),
    updatedAt: cfg?.updatedAt ?? "",
    envUrl: envConfigured ? OPENCLAW_URL : "",
    openclaw: { detected: oc.detected, url: oc.url, port: oc.port },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; token?: string; clear?: boolean; provider?: string };

    // 一键接入 OpenClaw（自动读配置与 token）
    if (body.provider === "openclaw") {
      const oc = detectOpenClaw();
      if (!oc.detected) {
        return NextResponse.json(
          { error: "未在本机检测到 OpenClaw（缺少 ~/.openclaw/openclaw.json）" },
          { status: 404 }
        );
      }
      saveAiConfig(oc.url, oc.token, "openclaw");
      return NextResponse.json({ ok: true, saved: true, provider: "openclaw", url: oc.url });
    }

    const url = String(body.url ?? "").trim();

    // 显式清除
    if (body.clear === true || !url) {
      clearAiConfig();
      return NextResponse.json({ ok: true, cleared: true });
    }

    // 校验：必须是 http(s) 地址，且指向 chat/completions 端点
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "网关地址需以 http:// 或 https:// 开头" }, { status: 400 });
    }

    // token：未传时保留已有值（只改 URL 不清 key）；显式传字符串则更新
    let token = "";
    if (typeof body.token === "string") {
      token = body.token.trim();
    } else {
      token = readAiConfig()?.token ?? "";
    }

    saveAiConfig(url, token);
    return NextResponse.json({ ok: true, saved: true });
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }
}
