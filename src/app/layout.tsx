import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "筑巢人生 NestLife",
  description: "把人生当作一家公司来经营：人生态度 · 分支目标 · 规划 · 执行 · 复盘",
};

// 显式 viewport：保证 iOS Safari / 安卓 Chrome 缩放与固定宽度一致，并支持 PWA 安装栏配色
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#18181B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
