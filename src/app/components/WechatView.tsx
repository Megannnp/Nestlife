"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast.tsx";

type Topic = {
  id: string;
  title: string;
  category: string;
  platform: string;
  status: "idea" | "writing" | "published" | "dropped";
  note: string;
  date: string;
  createdAt: string;
};

type Article = {
  name: string;
  file: string;
  series: string;
  vol: string | null;
  date: string;
  ext: string;
  mtime: number;
  size: number;
};

const STATUS_LABEL: Record<string, string> = { idea: "待写", writing: "写作中", published: "已发布", dropped: "弃用" };
const STATUS_COLOR: Record<string, string> = { idea: "#71717A", writing: "#D97706", published: "#059669", dropped: "#DC2626" };

const CATEGORIES = ["AI × 教育观察", "教师成长思考", "Workflow / SOP", "教学案例", "英语学习"];

type ChannelKey = "wp" | "wo" | "vp" | "vo";

const CHANNELS: { key: ChannelKey; label: string; icon: string; platform: string }[] = [
  { key: "wp", label: "公众号 · 个人号", icon: "📮", platform: "公众号·个人号" },
  { key: "wo", label: "公众号 · 官方号", icon: "🏛️", platform: "公众号·官方号" },
  { key: "vp", label: "短视频 · 个人号", icon: "🎬", platform: "短视频·个人号" },
  { key: "vo", label: "短视频 · 官方号", icon: "🎥", platform: "短视频·官方号" },
];

/** 内容室：公众号（个人号/官方号）+ 短视频（个人号/官方号）四个渠道的选题台账 */
export function WechatView() {
  const { toast } = useToast();
  const [channel, setChannel] = useState<ChannelKey>("wp");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("all");
  const [newTitle, setNewTitle] = useState("");
  const [newCat, setNewCat] = useState("AI × 教育观察");

  // 拉取选题
  const loadTopics = () =>
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => setTopics(Array.isArray(d.topics) ? d.topics : []))
      .catch(() => {});
  // 拉取已发布（自动扫描桌面公众号目录，用于公众号·个人号）
  const loadArticles = () =>
    fetch("/api/wechat-articles")
      .then((r) => r.json())
      .then((d) => setArticles(Array.isArray(d.articles) ? d.articles : []))
      .catch(() => {});

  useEffect(() => {
    let cancelled = false;
    // 数据到位后再关 loading（异步 setState，避免 effect 同步级联渲染）
    Promise.allSettled([loadTopics(), loadArticles()]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentChannel = CHANNELS.find((c) => c.key === channel)!;

  const addTopic = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const res = await fetch("/api/topics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, category: newCat, platform: currentChannel.platform }),
    });
    const d = await res.json();
    if (d.ok) {
      toast(`✅ 选题已加入 ${currentChannel.label}`);
      setNewTitle("");
      loadTopics();
    } else {
      toast(`⚠️ ${d.error || "添加失败"}`, "error");
    }
  };

  const updateTopic = async (id: string, patch: Partial<Topic>) => {
    await fetch("/api/topics", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, patch }),
    });
    loadTopics();
  };

  const deleteTopic = async (id: string) => {
    if (!confirm("删除这个选题？")) return;
    await fetch(`/api/topics?id=${id}`, { method: "DELETE" });
    toast("🗑️ 已删除");
    loadTopics();
  };

  // 当前渠道选题（旧数据 platform="公众号" 兼容归入个人号）
  const channelTopics = useMemo(() => {
    return topics.filter(
      (t) => t.platform === currentChannel.platform || (channel === "wp" && t.platform === "公众号")
    );
  }, [topics, channel, currentChannel.platform]);

  const filtered = useMemo(() => {
    if (catFilter === "all") return channelTopics;
    return channelTopics.filter((t) => t.category === catFilter);
  }, [channelTopics, catFilter]);

  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    channelTopics.forEach((t) => {
      m[t.category] = (m[t.category] || 0) + 1;
    });
    return m;
  }, [channelTopics]);

  return (
    <div className="flex flex-col gap-4">
      {/* 头部 + 渠道切换 */}
      <section className="workspace-pane">
        <div className="mb-3">
          <div className="section-label">内容室</div>
          <div className="text-[12px] text-[#A1A1AA] mt-1">
            公众号（个人号 / 官方号）· 短视频（个人号 / 官方号）
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-[#F4F4F5] rounded-[8px] p-1">
          {CHANNELS.map((c) => {
            const count = topics.filter(
              (t) => t.platform === c.platform || (c.key === "wp" && t.platform === "公众号")
            ).length;
            return (
              <button
                key={c.key}
                onClick={() => setChannel(c.key)}
                className={`px-2.5 py-1.5 rounded-[6px] text-[12px] font-semibold transition-colors ${
                  channel === c.key ? "bg-white text-[#18181B] shadow-sm" : "text-[#71717A] hover:text-[#18181B]"
                }`}
              >
                {c.icon} {c.label}
                <span className="ml-1 text-[10px] text-[#A1A1AA]">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 新增选题 */}
      <section className="workspace-pane">
        <div className="flex items-center gap-2">
          <select className="input-field !min-h-[32px]" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            className="input-field !min-h-[32px] flex-1"
            placeholder={`新增选题 → ${currentChannel.label}`}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTopic()}
          />
          <button className="primary-button !min-h-[32px]" onClick={addTopic}>添加</button>
        </div>
      </section>

      {/* 分类筛选 */}
      <section className="workspace-pane">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCatFilter("all")}
            className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold transition-colors ${
              catFilter === "all" ? "bg-[#EDEDED] text-[#18181B]" : "text-[#71717A] hover:bg-[#F4F4F5]"
            }`}
          >
            全部 {channelTopics.length}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold transition-colors ${
                catFilter === c ? "bg-[#EDEDED] text-[#18181B]" : "text-[#71717A] hover:bg-[#F4F4F5]"
              }`}
            >
              {c} {catCounts[c] ?? 0}
            </button>
          ))}
        </div>
      </section>

      {/* 选题列表 */}
      <section className="workspace-pane">
        <div className="section-label mb-3">{currentChannel.label} · {catFilter === "all" ? "全部选题" : catFilter}</div>
        {loading ? (
          <p className="text-[12px] text-[#A1A1AA] py-8 text-center">加载中…</p>
        ) : filtered.length === 0 ? (
          <p className="text-[12px] text-[#A1A1AA] py-8 text-center">该渠道暂无选题，加一个吧</p>
        ) : (
          <div className="flex flex-col">
            {filtered.map((t) => (
              <div key={t.id} className="flex items-center gap-2.5 py-2 border-b border-[#F1F1F3] last:border-0">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0" style={{ backgroundColor: `${STATUS_COLOR[t.status]}1A`, color: STATUS_COLOR[t.status] }}>
                  {STATUS_LABEL[t.status]}
                </span>
                <span className={`flex-1 min-w-0 text-[13px] truncate ${t.status === "published" ? "line-through text-[#A1A1AA]" : "text-[#18181B]"}`}>
                  {t.title}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F1F1F3] text-[#71717A] shrink-0">{t.platform}</span>
                <select
                  className="input-field !min-h-[26px] !text-[11px] w-[76px] shrink-0"
                  value={t.status}
                  onChange={(e) => {
                    updateTopic(t.id, { status: e.target.value as Topic["status"] });
                    if (e.target.value === "published") toast("✅ 已标记发布");
                  }}
                >
                  <option value="idea">待写</option>
                  <option value="writing">写作中</option>
                  <option value="published">已发布</option>
                  <option value="dropped">弃用</option>
                </select>
                <button className="text-[11px] text-[#A1A1AA] hover:text-[#DC2626] shrink-0" onClick={() => deleteTopic(t.id)}>删</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 公众号·个人号：自动扫描桌面目录 */}
      {channel === "wp" && (
        <section className="workspace-pane">
          <div className="flex items-center justify-between mb-3">
            <div className="section-label">已发布 · 自动扫描</div>
            <span className="text-[10px] text-[#A1A1AA]">来源：桌面 05_Content/公众号</span>
          </div>
          {loading ? (
            <p className="text-[12px] text-[#A1A1AA] py-6 text-center">加载中…</p>
          ) : articles.length === 0 ? (
            <p className="text-[12px] text-[#A1A1AA] py-6 text-center">暂未检测到已发布文章</p>
          ) : (
            <div className="flex flex-col">
              {articles.map((a) => (
                <div key={a.file} className="flex items-center gap-2.5 py-2 border-b border-[#F1F1F3] last:border-0">
                  <span className="text-[12px]">{a.ext === ".md" ? "📝" : "🌐"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-[#18181B] truncate">{a.name}</div>
                    <div className="text-[11px] text-[#A1A1AA]">
                      {a.series} {a.vol ?? ""} · {a.date}
                    </div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F1F1F3] text-[#71717A] shrink-0">{a.series}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
