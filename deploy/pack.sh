#!/usr/bin/env bash
# ═══ NestLife 交付打包脚本 ═══
# 产出：./dist/nestlife-v1.0.tar.gz（不含源码构建产物、内部文档、个人数据）
# 用法：bash deploy/pack.sh [版本号，默认 1.0]
set -euo pipefail

VERSION="${1:-1.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/nestlife-v$VERSION.tar.gz"

mkdir -p "$ROOT/dist"
tar --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.git' \
    --exclude='data' \
    --exclude='dist' \
    --exclude='.env' \
    --exclude='*.tsbuildinfo' \
    --exclude='.DS_Store' \
    --exclude='AGENTS.md' \
    --exclude='CLAUDE.md' \
    --exclude='docs' \
    --exclude='scripts/sync_nestlife_projects.py' \
    --exclude='scripts/migrate-inferred.mjs' \
    -czf "$OUT" -C "$ROOT" .

echo "✅ 交付包：$OUT"
echo "   内容不含：data/（个人数据）、node_modules、.next、.git、内部文档"
