/**
 * 菜单个性化配置（买家可自定义：改名/图标/隐藏/排序）
 * 存储：workspace 快照的 navConfig 字段（Mira 可经 API 读写）
 * 兼容：无 navConfig 的旧数据 → 使用默认全开菜单
 */

export type NavItemConfig = { key: string; label: string; icon: string; visible: boolean };

/** 主区/工具区的菜单 key（区内顺序可由用户配置调整） */
export const MAIN_KEYS = ["today", "reviews", "career", "growth", "agent"];
export const TOOLS_KEYS = ["knowledge", "wechat", "decisions", "settings"];

/** 默认菜单（全部可见，按此顺序） */
export const DEFAULT_NAV: NavItemConfig[] = [
  { key: "today", label: "今天", icon: "📋", visible: true },
  { key: "reviews", label: "复盘", icon: "🔄", visible: true },
  { key: "career", label: "事业", icon: "🏗️", visible: true },
  { key: "growth", label: "成长", icon: "🌱", visible: true },
  { key: "agent", label: "AI 助手", icon: "🤖", visible: true },
  { key: "knowledge", label: "知识中心", icon: "📚", visible: true },
  { key: "wechat", label: "内容室", icon: "📦", visible: true },
  { key: "decisions", label: "决策室", icon: "🧭", visible: true },
  { key: "settings", label: "设置", icon: "⚙️", visible: true },
];

const DEFAULT_MAP = new Map(DEFAULT_NAV.map((n) => [n.key, n]));

/**
 * 合并用户配置与默认值：
 * - 用户配置里的项：改名/图标/可见性生效，顺序按用户排列
 * - 用户未提及的项：按默认配置追加（全开）
 * - 非法/未知项：忽略
 */
export function mergeNavConfig(user?: unknown): NavItemConfig[] {
  const raw = Array.isArray(user) ? user : [];
  const result: NavItemConfig[] = [];
  const seen = new Set<string>();

  for (const u of raw) {
    if (!u || typeof u !== "object") continue;
    const key = String((u as { key?: unknown }).key ?? "");
    if (!key || seen.has(key)) continue;
    const def = DEFAULT_MAP.get(key);
    if (!def) continue; // 未知 key 忽略
    seen.add(key);
    result.push({
      key,
      label: typeof (u as { label?: unknown }).label === "string" && (u as { label?: string }).label
        ? (u as { label: string }).label
        : def.label,
      icon: typeof (u as { icon?: unknown }).icon === "string" && (u as { icon?: string }).icon
        ? (u as { icon: string }).icon
        : def.icon,
      visible: (u as { visible?: unknown }).visible !== false,
    });
  }

  // 未提及的默认项追加（全开）
  for (const d of DEFAULT_NAV) {
    if (!seen.has(d.key)) result.push(d);
  }
  return result;
}

/** 校验用户配置：返回可直接入库的干净数组（保留未知项供 AI 灵活扩展） */
export function sanitizeNavConfig(user?: unknown): { key: string; label?: string; icon?: string; visible?: boolean }[] | null {
  if (!Array.isArray(user)) return null;
  const out: { key: string; label?: string; icon?: string; visible?: boolean }[] = [];
  for (const u of user) {
    if (!u || typeof u !== "object") continue;
    const key = String((u as { key?: unknown }).key ?? "").trim();
    if (!key) continue;
    const item: { key: string; label?: string; icon?: string; visible?: boolean } = { key };
    const label = (u as { label?: unknown }).label;
    const icon = (u as { icon?: unknown }).icon;
    const visible = (u as { visible?: unknown }).visible;
    if (typeof label === "string" && label.trim()) item.label = label.trim().slice(0, 20);
    if (typeof icon === "string" && icon.trim()) item.icon = icon.trim().slice(0, 4);
    if (typeof visible === "boolean") item.visible = visible;
    out.push(item);
  }
  return out;
}
