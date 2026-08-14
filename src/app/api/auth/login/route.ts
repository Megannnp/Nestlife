import { NextResponse } from "next/server";
import { sessionTokenFor, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SEC } from "../../../../lib/auth.ts";

/** POST /api/auth/login — 密码校验通过后写入 session cookie */
export async function POST(req: Request) {
  // 未启用认证：直接放行
  if (process.env.NESTLIFE_AUTH !== "1") {
    return NextResponse.json({ ok: true, authEnabled: false });
  }
  try {
    const body = (await req.json()) as { password?: string };
    const password = String(body.password ?? "");
    const expected = process.env.NESTLIFE_ADMIN_PASSWORD || "";
    if (!expected || !password || password !== expected) {
      return NextResponse.json({ error: "密码错误" }, { status: 401 });
    }
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
