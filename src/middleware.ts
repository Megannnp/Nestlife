import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionTokenFor, safeEqual, SESSION_COOKIE_NAME } from "./lib/auth.ts";

/**
 * 访问控制（私有部署版）
 * NESTLIFE_AUTH=1 时：
 *  - /api/* （除登录/登出）→ 无有效 session 返回 401
 *  - 页面 （除 /login、静态资源）→ 重定向到 /login
 * 未启用认证时全部放行（保持零配置开箱即用）。
 */

export async function middleware(req: NextRequest) {
  // 统一禁止缓存：页面/API 均为私有动态数据（含个人数据），防中间代理缓存泄露
  const noStore = (res: NextResponse) => {
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  };

  if (process.env.NESTLIFE_AUTH !== "1") return noStore(NextResponse.next());

  const { pathname } = req.nextUrl;

  // 放行：认证接口、登录页、静态资源
  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout") return noStore(NextResponse.next());
  if (pathname === "/login") return noStore(NextResponse.next());
  if (pathname.startsWith("/_next/") || pathname === "/icon.svg" || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const expected = process.env.NESTLIFE_ADMIN_PASSWORD || "";
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value || "";
  const valid = expected && token
    ? safeEqual(token, await sessionTokenFor(expected))
    : false;

  if (valid) return noStore(NextResponse.next());

  // API → 401 JSON；页面 → 重定向登录页
  if (pathname.startsWith("/api/")) {
    return noStore(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return noStore(NextResponse.redirect(url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
