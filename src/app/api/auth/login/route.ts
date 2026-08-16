import { NextResponse } from "next/server";
import {
  sessionTokenFor, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SEC,
  checkLoginLock, recordLoginFailure, clearLoginFailures,
} from "../../../../lib/auth.ts";

/** POST /api/auth/login — 密码校验通过后写入 session cookie（带暴力破解限流） */
export async function POST(req: Request) {
  // 未启用认证：直接放行
  if (process.env.NESTLIFE_AUTH !== "1") {
    return NextResponse.json({ ok: true, authEnabled: false });
  }
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // 限流：连续失败 5 次锁 10 分钟
    const lock = checkLoginLock(ip);
    if (lock.locked) {
      return NextResponse.json(
        { error: `尝试过于频繁，请 ${lock.retryAfterSec} 秒后再试` },
        { status: 429 }
      );
    }

    const body = (await req.json()) as { password?: string };
    const password = String(body.password ?? "");
    const expected = process.env.NESTLIFE_ADMIN_PASSWORD || "";
    if (!expected || !password || password !== expected) {
      recordLoginFailure(ip);
      return NextResponse.json({ error: "密码错误" }, { status: 401 });
    }
    clearLoginFailures(ip);

    const token = await sessionTokenFor(password);
    const res = NextResponse.json({ ok: true, authEnabled: true });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SEC,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }
}
