import { NextResponse } from "next/server";
import os from "os";

/**
 * /api/network-info — 手机/局域网访问信息（设置页展示，替代"问管理员"）
 * 返回：本机局域网 IPv4 列表、端口、认证状态、登录密码（认证启用时，供设置页明文展示）
 */
export async function GET() {
  const ifaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) ips.push(iface.address);
    }
  }
  const authEnabled = process.env.NESTLIFE_AUTH === "1";
  return NextResponse.json({
    ips: [...new Set(ips)],
    port: Number(process.env.NESTLIFE_PORT || 3100),
    authEnabled,
    password: authEnabled ? process.env.NESTLIFE_ADMIN_PASSWORD || "" : "",
  });
}
