#!/bin/bash
# ═══════════════════════════════════════════════════
#  NestLife 一键安装（macOS）
#  用法：双击这个文件运行（或终端执行 bash install.command）
#  自动完成：检查/安装 Node → 装依赖 → 构建 → 生成密码 → 启动 → 打开浏览器
# ═══════════════════════════════════════════════════

set -e
cd "$(dirname "$0")"

echo ""
echo "  📦 NestLife 一键安装开始（全程约 3~5 分钟，请勿关闭此窗口）"
echo "  ──────────────────────────────────────────────"

# ── 1. 检查 Node.js ─────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "  ⚠️  未检测到 Node.js，正在用 Homebrew 安装…"
  if ! command -v brew >/dev/null 2>&1; then
    echo "  ⏳ 需要先装 Homebrew（Mac 的软件管家）。可能会提示你输入开机密码。"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || true
    # Apple Silicon / Intel 的 PATH
    export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  fi
  brew install node@24 || brew install node || true
  export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
fi

NODE_V=$(node -v 2>/dev/null || echo "none")
echo "  ✅ Node.js 版本：$NODE_V"

# ── 2. 安装依赖 + 构建 ──────────────────────────────
if [ ! -d node_modules ]; then
  echo "  ⏳ 安装依赖（约 1~2 分钟）…"
  npm ci
fi
echo "  ⏳ 构建（约 1 分钟）…"
npm run build

# ── 3. 生成 .env（自动强密码，无需手动改）──────────
if [ ! -f .env ]; then
  cp .env.example .env
  PASSWORD=$(openssl rand -hex 8)
  # 启用认证 + 写入密码（处理 .env.example 里注释状态）
  sed -i '' "s|^# *NESTLIFE_AUTH=.*|NESTLIFE_AUTH=1|" .env
  sed -i '' "s|^# *NESTLIFE_ADMIN_PASSWORD=.*|NESTLIFE_ADMIN_PASSWORD=$PASSWORD|" .env
  sed -i '' "s|^NESTLIFE_ADMIN_PASSWORD=.*|NESTLIFE_ADMIN_PASSWORD=$PASSWORD|" .env
  echo "$PASSWORD" > ~/.nestlife-password.txt
  chmod 600 ~/.nestlife-password.txt
  echo "  ✅ 已自动生成登录密码：$PASSWORD（同时保存在 ~/.nestlife-password.txt）"
  echo "     （登录密码用于手机/其他设备访问，本机不需要）"
fi

# ── 4. 启动 ─────────────────────────────────────────
PORT=${NESTLIFE_PORT:-3100}
if lsof -ti :$PORT >/dev/null 2>&1; then
  echo "  ℹ️  端口 $PORT 已在运行（可能是之前启动过），跳过启动。"
else
  nohup npm run start -- -p $PORT > nestlife.log 2>&1 &
  echo "  ⏳ 启动中…"
  sleep 3
fi

# ── 5. 打开浏览器 + 手机访问地址 ────────────────────
open "http://localhost:$PORT" 2>/dev/null || true
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "本机IP")
echo ""
echo "  🎉 安装完成！"
echo "  ──────────────────────────────────────────────"
echo "  💻 本机使用：  http://localhost:$PORT"
echo "  📱 手机访问：  http://$IP:$PORT"
echo "  🔑 登录密码：  $(cat ~/.nestlife-password.txt 2>/dev/null || echo '见 ~/.nestlife-password.txt')"
echo "  （手机连同一网络，浏览器打开手机访问地址，输密码即可）"
echo ""
echo "  💡 数据都在本机 data/ 目录；备份：系统 → 设置 → 数据管理"
echo ""
