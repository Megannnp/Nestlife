/**
 * NestLife 运行配置（私有部署版）
 * 所有路径/端口/外部服务统一从环境变量读取，便于打包部署：
 *
 *   NESTLIFE_DATA       数据根目录（默认 ~/.nestlife/data；含 nestlife.db、knowledge/、backups/）
 *   NESTLIFE_PORT       监听端口（默认 3100）
 *   NESTLIFE_AUTH       设为 "1" 启用登录认证
 *   NESTLIFE_ADMIN_PASSWORD  认证密码（启用认证时必填）
 *   NESTLIFE_WECHAT_DIR 公众号文章扫描目录（可选，留空则内容室不扫描本地文章）
 *   NESTLIFE_OPENCLAW_URL    AI 网关地址（可选，如 http://localhost:18789/v1/chat/completions）
 *   NESTLIFE_OPENCLAW_TOKEN  AI 网关令牌（可选；未配置则 AI 助手提示未接入）
 */

import path from "path";
import os from "os";

const HOME = os.homedir();

/** 数据根目录（SQLite + 知识库 + 备份） */
export const DATA_DIR = process.env.NESTLIFE_DATA || path.join(HOME, ".nestlife", "data");
export const DB_FILE = path.join(DATA_DIR, "nestlife.db");
export const KB_DIR = path.join(DATA_DIR, "knowledge");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");
export const REPORTS_DIR = path.join(DATA_DIR, "reports");

/** 公众号文章扫描目录（可选） */
export const WECHAT_ARTICLES_DIR = process.env.NESTLIFE_WECHAT_DIR || "";

/** AI 网关（可选；未配置则 AI 功能降级为"未接入"） */
export const OPENCLAW_URL = process.env.NESTLIFE_OPENCLAW_URL || "";
export const OPENCLAW_TOKEN = process.env.NESTLIFE_OPENCLAW_TOKEN || "";

/** 认证（NESTLIFE_AUTH=1 启用） */
export const AUTH_ENABLED = process.env.NESTLIFE_AUTH === "1";
export const ADMIN_PASSWORD = process.env.NESTLIFE_ADMIN_PASSWORD || "";

export const PORT = Number(process.env.NESTLIFE_PORT || 3100);
