import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../lib/auth.ts";

/** POST /api/auth/logout — 清除 session cookie */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
