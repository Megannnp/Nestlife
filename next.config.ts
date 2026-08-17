import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-XSS-Protection", value: "0" },
  {
    key: "Content-Security-Policy",
    // 保守 CSP：默认仅本域；允许内联样式/脚本（Next RSC + 组件内联样式需要）；
    // img/font 允许 data/blob；连接仅本域 + dev HMR websocket；禁止 iframe 嵌套
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Route Handler 请求体限制：知识中心支持最大 50MB 上传（Next.js 默认 10MB 会导致大图/大文件上传被截断）
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
