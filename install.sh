#!/usr/bin/env bash
# ═══ NestLife 一键安装脚本（Linux systemd / macOS 手动启动） ═══
# 用法：bash install.sh [安装目录，默认 /opt/nestlife]
set -euo pipefail

APP_DIR="${1:-/opt/nestlife}"
DATA_DIR="${NESTLIFE_DATA:-/var/lib/nestlife/data}"

echo "── NestLife 安装 ───────────────────────────"
echo "安装目录: $APP_DIR"

# 1. Node 版本检查（node:sqlite 需要 >=22.5）
NODE_OK=$(node -e "const [m,mn]=process.versions.node.split('.').map(Number); process.exit((m>22||(m===22&&mn>=5))?0:1)" 2>/dev/null && echo 1 || echo 0)
if [ "$NODE_OK" != "1" ]; then
  echo "❌ 需要 Node.js >= 22.5（node:sqlite 内置模块要求）。当前: $(node -v 2>/dev/null || echo 未安装)"
  echo "   安装：curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi
echo "✅ Node $(node -v)"

# 2. 安装目录
if [ "$(id -u)" -eq 0 ]; then
  install -d -o nobody -g nogroup "$APP_DIR" 2>/dev/null || install -d "$APP_DIR"
else
  install -d "$APP_DIR"
fi
cd "$APP_DIR"

# 3. 拷贝源码（如果当前目录不是安装目录，则复制）
if [ "$(pwd)" != "$APP_DIR" ] || [ ! -f package.json ]; then
  echo "── 拷贝源码到 $APP_DIR"
  rsync -a --exclude node_modules --exclude .next --exclude data --exclude .git ./ "$APP_DIR/" 2>/dev/null || cp -R ./* "$APP_DIR/"
  cd "$APP_DIR"
fi

# 4. 安装依赖 + 构建（build 需要 devDependencies，须全量安装）
echo "── 安装依赖并构建（约 1-3 分钟）"
npm ci 2>/dev/null || npm install
npm run build
echo "✅ 构建完成"

# 5. 数据目录
echo "── 数据目录 $DATA_DIR"
install -d "$DATA_DIR"
touch "$DATA_DIR/.keep"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ 已生成 .env（请编辑 NESTLIFE_ADMIN_PASSWORD 等配置）"
fi

# 6. 启动方式
if [ -d /run/systemd/system ]; then
  echo "── 安装 systemd 服务"
  cp deploy/nestlife.service /etc/systemd/system/nestlife.service
  sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" /etc/systemd/system/nestlife.service
  sed -i "s|^EnvironmentFile=.*|EnvironmentFile=$APP_DIR/.env|" /etc/systemd/system/nestlife.service
  systemctl daemon-reload
  systemctl enable --now nestlife
  echo "✅ 已启动：systemctl status nestlife"
  echo "   访问 http://localhost:3100"
else
  echo "── 未检测到 systemd，请手动启动："
  echo "   cd $APP_DIR && NESTLIFE_DATA=$DATA_DIR npm run start -- -p 3100"
  echo "   （建议用 pm2 / launchd / nohup 常驻）"
fi

echo "── 完成 ─────────────────────────────────────"
echo "配置：$APP_DIR/.env"
echo "数据：$DATA_DIR"
