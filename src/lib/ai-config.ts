/**
 * AI 网关配置存储（页面级，设置页可读写）
 * 保存到 NESTLIFE_DATA/ai-config.json，优先级高于环境变量（NESTLIFE_OPENCLAW_URL）。
 * 好处：买家在设置页直接填 URL + key，无需改 .env 或重启。
 */
import fs from "fs";
import path from "path";
import { DATA_DIR } from "./config.ts";

export type AiConfig = { url: string; token: string; updatedAt: string };

const AI_CONFIG_FILE = path.join(DATA_DIR, "ai-config.json");

export function readAiConfig(): AiConfig | null {
  try {
    if (!fs.existsSync(AI_CONFIG_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, "utf-8")) as Partial<AiConfig>;
    if (raw && typeof raw.url === "string" && raw.url.trim()) {
      return { url: raw.url.trim(), token: typeof raw.token === "string" ? raw.token : "", updatedAt: raw.updatedAt ?? "" };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAiConfig(url: string, token: string) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const cfg: AiConfig = { url: url.trim(), token: token.trim(), updatedAt: new Date().toISOString() };
  fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function clearAiConfig() {
  try {
    fs.rmSync(AI_CONFIG_FILE, { force: true });
  } catch {
    /* 忽略 */
  }
}
