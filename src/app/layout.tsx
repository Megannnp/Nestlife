import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "筑巢人生 NestLife",
  description: "把人生当作一家公司来经营：人生态度 · 分支目标 · 规划 · 执行 · 复盘",
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
