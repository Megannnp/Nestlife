/**
 * 认证工具（私有部署版）
 * 启用：NESTLIFE_AUTH=1 + NESTLIFE_ADMIN_PASSWORD=xxx
 * 方案：无状态 session token = SHA-256(固定盐 + 密码)，登录后写入 httpOnly cookie，
 *       middleware 校验。仅 Node/Edge 都支持的 Web Crypto，不依赖 node:crypto。
 */

const SESSION_SALT = "nestlife-session-v1";
const SESSION_COOKIE = "nestlife_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

/** 无状态 token（登录时发放 / 校验时重算） */
export async function sessionTokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${SESSION_SALT}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 常量时间字符串比较（防时序侧信道） */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE_SEC = SESSION_MAX_AGE;

/** ═══ 登录限流（防暴力破解，内存实现，重启重置） ═══ */

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

export function checkLoginLock(ip: string): { locked: boolean; retryAfterSec?: number } {
  const rec = loginAttempts.get(ip);
  if (!rec) return { locked: false };
  if (rec.lockedUntil > Date.now()) {
    return { locked: true, retryAfterSec: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
  }
  if (rec.lockedUntil > 0 && rec.lockedUntil <= Date.now()) {
    loginAttempts.delete(ip); // 锁过期自动重置
  }
  return { locked: false };
}

export function recordLoginFailure(ip: string) {
  const rec = loginAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_LOGIN_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCK_MS;
    rec.count = 0;
  }
  loginAttempts.set(ip, rec);
}

export function clearLoginFailures(ip: string) {
  loginAttempts.delete(ip);
}
