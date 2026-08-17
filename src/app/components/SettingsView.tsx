"use client";

import { useState, useEffect } from "react";
import type { Workspace, ScheduleItem } from "../../lib/types.ts";
import { MAIN_KEYS } from "../../lib/nav-config.ts";

interface SettingsViewProps {
  workspace: Workspace;
  updateSchedule: (items: ScheduleItem[]) => void;
  resetAll: () => void;
}

type BackupInfo = { name: string; size: number; mtime: number };

export function SettingsView({ workspace, updateSchedule, resetAll }: SettingsViewProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupNotice, setBackupNotice] = useState("");

  // 手机/局域网访问信息（自动检测 IP + 登录密码，替代"问管理员"）
  const [netInfo, setNetInfo] = useState<{ ips: string[]; port: number; authEnabled: boolean; password: string } | null>(null);

  // AI 网关配置（设置页直接填写，无需改 .env）
  const [aiInfo, setAiInfo] = useState<{ enabled: boolean; source: string; url: string; hasToken: boolean; openclaw?: { detected: boolean; url: string; port: number } } | null>(null);
  const [aiUrl, setAiUrl] = useState("");
  const [aiToken, setAiToken] = useState("");
  const [aiNotice, setAiNotice] = useState("");

  const refreshAiConfig = () => {
    fetch("/api/ai-config")
      .then((r) => r.json())
      .then((d) => {
        setAiInfo(d);
        setAiUrl(d?.url ?? "");
        setAiToken("");
      })
      .catch(() => {});
  };

  const refreshBackups = () => {
    fetch("/api/backups")
      .then((r) => r.json())
      .then((d) => setBackups(Array.isArray(d.backups) ? d.backups : []))
      .catch(() => {});
  };

  // 菜单设置（改名/图标/隐藏/区内排序，保存即生效）
  const [navItems, setNavItems] = useState<{ key: string; label: string; icon: string; visible: boolean }[] | null>(null);
  const [navNotice, setNavNotice] = useState("");

  const refreshNav = () => {
    fetch("/api/nav-config")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) setNavItems(d.items);
      })
      .catch(() => {});
  };

  const refreshNetInfo = () => {
    fetch("/api/network-info")
      .then((r) => r.json())
      .then((d) => setNetInfo(d))
      .catch(() => {});
  };

  useEffect(() => {
    refreshBackups();
    refreshAiConfig();
    refreshNav();
    refreshNetInfo();
  }, []);

  const saveAiConfig = async () => {
    const res = await fetch("/api/ai-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // token 为空则不传 → 服务端保留已有 key（只改地址不清 key）
      body: JSON.stringify({ url: aiUrl, ...(aiToken.trim() ? { token: aiToken.trim() } : {}) }),
    });
    const d = await res.json();
    if (res.ok) {
      setAiNotice(d.cleared ? "✅ 已清除 AI 网关配置" : "✅ 已保存，AI 助手立即可用");
      refreshAiConfig();
    } else {
      setAiNotice(`⚠️ ${d.error || "保存失败"}`);
    }
    setTimeout(() => setAiNotice(""), 4000);
  };

  const clearAiConfig = async () => {
    if (!confirm("清除 AI 网关配置？AI 助手将回到未接入状态。")) return;
    const res = await fetch("/api/ai-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });
    if (res.ok) {
      setAiNotice("✅ 已清除 AI 网关配置");
      refreshAiConfig();
      setTimeout(() => setAiNotice(""), 4000);
    }
  };

  // 一键接入本机 OpenClaw（检测配置 + token 自动读取）
  const connectOpenClaw = async () => {
    const res = await fetch("/api/ai-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openclaw" }),
    });
    const d = await res.json();
    if (res.ok) {
      setAiNotice("✅ 已接入 OpenClaw（AI 执行能力已启用）");
      refreshAiConfig();
    } else {
      setAiNotice(`⚠️ ${d.error || "接入失败"}`);
    }
    setTimeout(() => setAiNotice(""), 5000);
  };

  const updateNav = (idx: number, patch: Partial<{ label: string; icon: string; visible: boolean }>) => {
    setNavItems((prev) => (prev ? prev.map((n, i) => (i === idx ? { ...n, ...patch } : n)) : prev));
  };

  const moveNav = (idx: number, dir: -1 | 1) => {
    setNavItems((prev) => {
      if (!prev) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const inMain = (k: string) => MAIN_KEYS.includes(k);
      if (inMain(prev[idx].key) !== inMain(prev[j].key)) return prev; // 跨区禁止（主区/工具区分组固定）
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const saveNav = async () => {
    if (!navItems) return;
    const res = await fetch("/api/nav-config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: navItems }),
    });
    const d = await res.json();
    setNavNotice(d.ok ? "✅ 菜单已保存，立即生效" : `⚠️ ${d.error || "保存失败"}`);
    setTimeout(() => setNavNotice(""), 3000);
  };

  const resetNav = async () => {
    if (!confirm("恢复默认菜单？")) return;
    await fetch("/api/nav-config", { method: "DELETE" });
    refreshNav();
    setNavNotice("✅ 已恢复默认菜单");
    setTimeout(() => setNavNotice(""), 3000);
  };

  const doBackup = async () => {
    const res = await fetch("/api/backups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "backup" }),
    });
    const d = await res.json();
    setBackupNotice(d.ok ? `✅ 已备份 ${d.name}` : `⚠️ ${d.error || "备份失败"}`);
    refreshBackups();
    setTimeout(() => setBackupNotice(""), 3000);
  };

  /** 导出 JSON：优先复制剪贴板（HTTPS/localhost 可用）；非安全环境（手机经局域网 http 访问）回退为下载文件 */
  const exportJson = () => {
    const json = JSON.stringify(workspace, null, 2);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(json)
        .then(() => {
          setBackupNotice("✅ 已复制 JSON 到剪贴板");
          setTimeout(() => setBackupNotice(""), 3000);
        })
        .catch(() => downloadJson(json, stamp));
    } else {
      downloadJson(json, stamp);
    }
  };

  const downloadJson = (json: string, stamp: string) => {
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nestlife-export-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupNotice(`✅ 已导出 nestlife-export-${stamp}.json`);
      setTimeout(() => setBackupNotice(""), 3000);
    } catch {
      setBackupNotice("⚠️ 导出失败，请用备份功能");
    }
  };

  const doRestore = async (name: string) => {
    if (!confirm(`恢复备份 ${name}？\n当前数据会先自动备份。`)) return;
    const res = await fetch("/api/backups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "restore", file: name }),
    });
    const d = await res.json();
    if (d.ok) {
      setBackupNotice(`✅ 已恢复 ${name}，正在刷新…`);
      // 自动刷新：恢复后前端旧数据会覆盖新数据，必须重载
      setTimeout(() => window.location.reload(), 800);
    } else {
      setBackupNotice(`⚠️ ${d.error || "恢复失败"}`);
    }
    setTimeout(() => setBackupNotice(""), 4000);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="workspace-pane">
        <div className="section-label">设置</div>
        <h1 className="text-[22px] font-bold text-[#18181B] mt-1">设置</h1>
        <p className="text-[13px] text-[#71717A] mt-2">系统信息与数据管理。数据存储于 SQLite，AI 助手 可读写全部数据。</p>
      </section>

      {/* 手机/局域网访问信息（自动检测，替代"问管理员"） */}
      <section className="workspace-pane">
        <div className="section-label mb-3">📱 手机访问</div>
        {netInfo && netInfo.ips.length > 0 ? (
          <div className="flex flex-col gap-2">
            {netInfo.ips.map((ip) => (
              <div key={ip} className="flex items-center gap-2 text-[13px] flex-wrap">
                <span className="text-[#71717A] shrink-0">访问地址</span>
                <code className="bg-[#F4F4F5] rounded-[8px] px-2.5 py-1 font-mono text-[12px] text-[#18181B]">
                  http://{ip}:{netInfo.port}
                </code>
              </div>
            ))}
            {netInfo.authEnabled ? (
              <div className="flex items-center gap-2 text-[13px] flex-wrap">
                <span className="text-[#71717A] shrink-0">登录密码</span>
                <code className="bg-[#F4F4F5] rounded-[8px] px-2.5 py-1 font-mono text-[12px] text-[#18181B]">
                  {netInfo.password || "（未设置）"}
                </code>
              </div>
            ) : (
              <p className="text-[12px] text-[#DC2626]">⚠️ 当前未启用登录认证，局域网内任何设备都能访问你的数据</p>
            )}
            <p className="text-[11px] text-[#A1A1AA] leading-[1.6]">
              手机连和这台电脑同一个网络，在浏览器打开上面的地址，输入密码即可使用。
              本机（localhost）访问免登录。改密码/换端口见 <code className="font-mono">CONFIG.md</code>。
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-[#A1A1AA]">未检测到局域网地址（可能不在线或没有网络连接）</p>
        )}
      </section>

      {/* 时刻表管理 */}
      <section className="workspace-pane">
        <div className="section-label mb-3">时刻表（人生执行计划）</div>
        <div className="flex flex-col gap-2">
          {workspace.schedule.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-2">
              <input
                type="time"
                className="input-field w-[110px]"
                value={item.time}
                onChange={(e) => {
                  const next = [...workspace.schedule];
                  next[idx] = { ...item, time: e.target.value };
                  updateSchedule(next);
                }}
              />
              <input
                className="input-field flex-1"
                value={item.title}
                onChange={(e) => {
                  const next = [...workspace.schedule];
                  next[idx] = { ...item, title: e.target.value };
                  updateSchedule(next);
                }}
              />
              <button
                className="text-[12px] px-2 py-1.5 rounded text-[#A1A1AA] hover:bg-[#F1F1F3] hover:text-[#DC2626]"
                onClick={() => updateSchedule(workspace.schedule.filter((s) => s.id !== item.id))}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* AI 助手接入 */}
      <section className="workspace-pane">
        <div className="section-label mb-3">AI 助手接入</div>
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${
            aiInfo?.enabled ? "bg-[#F0FDF4] text-[#059669]" : "bg-[#F1F1F3] text-[#A1A1AA]"
          }`}>
            {aiInfo?.enabled ? "● 已接入" : "○ 未接入"}
          </span>
          {aiInfo?.source === "settings" && <span className="text-[11px] text-[#A1A1AA]">配置来源：设置页</span>}
          {aiInfo?.source === "env" && <span className="text-[11px] text-[#A1A1AA]">配置来源：环境变量</span>}
          {aiInfo?.hasToken && <span className="text-[11px] text-[#059669]">✓ 已设置密钥</span>}
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <div className="text-[12px] font-semibold text-[#52525B] mb-1">网关地址（OpenAI 兼容端点）</div>
            <input
              className="input-field w-full font-mono !text-[12px]"
              placeholder="https://api.deepseek.com/v1/chat/completions"
              value={aiUrl}
              onChange={(e) => setAiUrl(e.target.value)}
            />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-[#52525B] mb-1">API Key（可选，本地 Ollama 可留空）</div>
            <input
              type="password"
              className="input-field w-full font-mono !text-[12px]"
              placeholder="sk-…（保存在服务器，不会回显）"
              value={aiToken}
              onChange={(e) => setAiToken(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button className="primary-button" onClick={saveAiConfig}>保存并启用</button>
            {aiInfo?.source === "settings" && (
              <button className="secondary-button" onClick={clearAiConfig}>清除配置</button>
            )}
          </div>
          {aiNotice && <div className="text-[12px] text-[#059669] mt-1">{aiNotice}</div>}
        </div>

        {/* OpenClaw 快速接入（本机 AI 执行网关） */}
        <div className="mt-3 pt-3 border-t border-[#F1F1F3]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[12px] font-semibold text-[#52525B]">OpenClaw 本机接入</span>
            {aiInfo?.openclaw?.detected ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[#F0FDF4] text-[#059669]">
                已检测到（localhost:{aiInfo.openclaw.port}）
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[#F1F1F3] text-[#A1A1AA]">
                未检测到
              </span>
            )}
          </div>
          {aiInfo?.openclaw?.detected ? (
            <button className="secondary-button !min-h-[30px] !text-[12px]" onClick={connectOpenClaw}>
              ⚡ 一键接入 OpenClaw（AI 真执行）
            </button>
          ) : (
            <p className="text-[11px] text-[#A1A1AA] leading-[1.7]">
              未在本机检测到 OpenClaw。如需「对话即执行」能力，请先安装
              （<code className="bg-[#F1F1F3] px-1 rounded">npm install -g openclaw</code>
              ，见 openclaw 官方文档），安装后回到这里一键接入。
            </p>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-[#F1F1F3] text-[11px] text-[#A1A1AA] leading-[1.7]">
          支持任意 OpenAI 兼容网关：DeepSeek / 通义千问 / Kimi / Ollama 本地模型等。
          保存后立即生效，无需重启。密钥仅保存在本机数据目录，不会回显。
        </div>
      </section>

      {/* 菜单设置 */}
      <section className="workspace-pane">
        <div className="section-label mb-3">菜单设置</div>
        <p className="text-[12px] text-[#A1A1AA] mb-3">
          自定义左侧菜单：改名 / 换图标 / 隐藏 / 排序，保存后立即生效。也可以直接对 AI 助手说「隐藏内容室」。
        </p>
        {navItems === null ? (
          <p className="text-[12px] text-[#A1A1AA]">加载中…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-col gap-1.5">
              {navItems.map((item, idx) => {
                const isMain = MAIN_KEYS.includes(item.key);
                const showDivider = isMain && idx > 0 && !MAIN_KEYS.includes(navItems[idx - 1]?.key);
                return (
                  <div key={item.key}>
                    {showDivider && <div className="mt-3 mb-1.5 text-[10px] font-semibold tracking-[0.08em] text-[#A1A1AA] select-none">工具</div>}
                    <div className="flex items-center gap-2">
                      <input
                        className="input-field !min-h-[30px] !w-[48px] !px-1 text-center !text-[14px]"
                        value={item.icon}
                        maxLength={2}
                        title="图标（emoji）"
                        onChange={(e) => updateNav(idx, { icon: e.target.value })}
                      />
                      <input
                        className="input-field flex-1 !min-h-[30px] !text-[13px]"
                        value={item.label}
                        maxLength={20}
                        onChange={(e) => updateNav(idx, { label: e.target.value })}
                      />
                      <button
                        className={`shrink-0 text-[11px] px-2 py-1 rounded-full font-semibold transition-colors ${
                          item.visible ? "text-[#059669] bg-[#F0FDF4]" : "text-[#A1A1AA] bg-[#F1F1F3]"
                        }`}
                        onClick={() => updateNav(idx, { visible: !item.visible })}
                      >
                        {item.visible ? "显示中" : "已隐藏"}
                      </button>
                      <button
                        className="shrink-0 w-7 h-7 rounded-[6px] text-[#71717A] hover:bg-[#F4F4F5] disabled:opacity-30 disabled:hover:bg-transparent"
                        disabled={idx === 0}
                        onClick={() => moveNav(idx, -1)}
                        title="上移"
                      >
                        ↑
                      </button>
                      <button
                        className="shrink-0 w-7 h-7 rounded-[6px] text-[#71717A] hover:bg-[#F4F4F5] disabled:opacity-30 disabled:hover:bg-transparent"
                        disabled={idx === navItems.length - 1}
                        onClick={() => moveNav(idx, 1)}
                        title="下移"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button className="primary-button" onClick={saveNav}>保存菜单</button>
              <button className="secondary-button" onClick={resetNav}>恢复默认</button>
              {navNotice && <span className="text-[12px] text-[#059669] font-semibold">{navNotice}</span>}
            </div>
          </div>
        )}
      </section>

      {/* 数据管理 */}
      <section className="workspace-pane">
        <div className="section-label mb-3">数据管理</div>
        <div className="flex items-center gap-3">
          <button className="secondary-button" onClick={doBackup}>💾 立即备份</button>
          <button className="secondary-button" onClick={exportJson}>
            导出数据（复制 JSON / 下载）
          </button>
          {confirmReset ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#DC2626]">确定重置全部数据？</span>
              <button
                className="primary-button !bg-[#DC2626] !hover:bg-[#B91C1C]"
                onClick={() => {
                  resetAll();
                  setConfirmReset(false);
                }}
              >
                确认重置
              </button>
              <button className="secondary-button" onClick={() => setConfirmReset(false)}>取消</button>
            </div>
          ) : (
            <button className="secondary-button !text-[#DC2626]" onClick={() => setConfirmReset(true)}>重置全部数据</button>
          )}
        </div>

        {backupNotice && <div className="mt-2.5 text-[12px] text-[#059669] bg-[#F0FDF4] rounded-[8px] px-3 py-2">{backupNotice}</div>}

        {/* 备份列表 */}
        {backups.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#F1F1F3]">
            <div className="text-[12px] font-bold text-[#71717A] mb-2">备份记录（点击恢复）</div>
            <div className="flex flex-col">
              {backups.slice(0, 8).map((b) => (
                <button
                  key={b.name}
                  className="flex items-center gap-3 py-1.5 border-b border-[#F8F8F9] last:border-0 text-left hover:bg-[#F8F8F9] px-2 rounded-[6px] transition-colors"
                  onClick={() => doRestore(b.name)}
                >
                  <span className="text-[12px]">🗄️</span>
                  <span className="text-[12px] text-[#3F3F46] flex-1 font-mono">{b.name}</span>
                  <span className="text-[10px] text-[#A1A1AA]">{fmtSize(b.size)}</span>
                  <span className="text-[10px] text-[#A1A1AA]">{new Date(b.mtime).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-[#F1F1F3] text-[11px] text-[#A1A1AA] leading-[1.6]">
          数据存储于 SQLite（data/nestlife.db）· 每日 23:30 自动备份 · 恢复前自动备份当前数据
        </div>
      </section>
    </div>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
