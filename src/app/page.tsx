"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { LifeView, Workspace, Task, ScheduleItem } from "../lib/types.ts";
import { hydrateWorkspaceAsync, saveWorkspaceAsync, resetWorkspaceAsync } from "../lib/storage.ts";
import { makeId, todayStr } from "../lib/utils.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { DashboardView } from "./components/DashboardView.tsx";
import { CareerView } from "./components/CareerView.tsx";
import { GrowthView } from "./components/GrowthView.tsx";
import { AgentView, type ChatMsg } from "./components/AgentView.tsx";
import { KnowledgeView } from "./components/KnowledgeView.tsx";
import { DecisionsView } from "./components/DecisionsView.tsx";
import { ReviewsView } from "./components/ReviewsView.tsx";
import { WechatView } from "./components/WechatView.tsx";
import { SettingsView } from "./components/SettingsView.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { useGlobalShortcuts } from "../lib/use-global-shortcuts.ts";
import { mergeNavConfig } from "../lib/nav-config.ts";

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeView, setActiveView] = useState<LifeView>("today");
  const [commandOpen, setCommandOpen] = useState(false);
  // 最近一次本地编辑时间戳：60s 轮询在编辑后短暂跳过，避免用服务器旧数据覆盖用户正在输入的改动
  const lastEditRef = useRef(0);

  // ─── AI 助手全局状态（提升到 Home：切换页面不丢，在途请求照常完成） ───
  // 恢复历史放 lazy initializer（SSR 首帧是「加载中…」，无 hydration 冲突）
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("nestlife-chat-history");
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) return data.filter((m) => m && typeof m.content === "string");
      }
    } catch {}
    return [];
  });
  const [chatBusy, setChatBusy] = useState(false);
  const chatRef = useRef<ChatMsg[]>([]); // 供 sendAgentMessage 读取最新消息
  // 渲染后同步 ref（不在渲染期间写 ref，避免 React 报错）
  useEffect(() => {
    chatRef.current = chatMessages;
  }, [chatMessages]);

  // 持久化（限最近 200 条）
  useEffect(() => {
    if (chatMessages.length === 0) return;
    try {
      window.localStorage.setItem("nestlife-chat-history", JSON.stringify(chatMessages.slice(-200)));
    } catch {}
  }, [chatMessages]);

  const sendAgentMessage = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text || chatBusy) return;
    const history = chatRef.current;
    setChatMessages((m) => [...m, { role: "user", content: text }]);
    setChatBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stream: true,
          messages: [
            {
              role: "system",
              content:
                "你是NestLife 的 AI 助手。你连接着执行网关，能真正执行：读文件、设提醒、写台账、整理知识、查询系统。回答简洁、直接、中文。如果需要执行动作就直接做，然后简要汇报结果。汇报时用步骤格式：每步一行，以→开头（如：→ 读取 DASHBOARD 完成 → 同步 2 条任务），最后一行以✅开头总结结果。\n\n【任务同步规则·重要】NestLife 的任务在 SQLite 里（/api/tasks），用户在对话里提到任务进展时必须同步：\n- 当用户说某件事“完成/搞定/提交了/做完了/结束了”时，调用 API：POST http://localhost:3100/api/tasks，body 为 { \"title\": \"任务标题关键词\", \"status\": \"done\" }（按标题匹配标记完成），用 exec 里的 curl 执行。\n- 当用户提到一件新的待办时，POST http://localhost:3100/api/tasks，body 为 { \"title\": \"任务标题\", \"branchId\": \"career|growth|life\", \"priority\": \"high|mid|low\", \"note\": \"来源说明\", \"auto\": 1 }，自动新增。\n- 同步完成后告诉用户“已同步到今日任务”。\n\n【知识检索】需要基于知识库回答时，调用 curl -s \"http://localhost:3100/api/knowledge/search?q=关键词\" 检索知识库内容，引用检索结果回答。\n\n【决策自动记录规则】当用户做出明确决定时（信号词：决定了/就定/就用/改成/选X方案/不做了/确定/拍板/最终选择），自动调用 API：POST http://localhost:3100/api/decisions，body 为 { \"title\": \"决策标题\", \"context\": \"背景（从对话上下文提炼）\", \"decision\": \"决策内容（选了哪个方案）\", \"rationale\": \"依据（用户给的理由）\", \"branchId\": \"career|growth|life\", \"source\": \"对话\" }，用 exec 里的 curl 执行。记录后告诉用户「已记录到决策室」。普通讨论/疑问不要记录，只有明确拍板才算。\n\n【公众号选题规则】用户提到新选题时（如「加个选题：XXX」），调用 POST http://localhost:3100/api/topics，body 为 { \"title\": \"选题标题\", \"category\": \"AI × 教育观察|教师成长思考|Workflow / SOP|教学案例|英语学习\" }；用户说某选题写完了/发布了，调用 PATCH http://localhost:3100/api/topics，body 为 { \"id\": \"选题id\", \"patch\": { \"status\": \"published\" } }（可先用 GET /api/topics 查 id）。完成后告诉用户已同步选题库。\n\n【项目更新规则】当用户报告某项目进展时（如\"项目A完成度到90%了\"\"项目B有新进展了\"），更新事业页数据：先 GET http://localhost:3100/api/workspace 拿到 snapshot.projects，改对应项目的 progress/nextSteps/blockers/milestones，再 PUT http://localhost:3100/api/workspace 整体提交（body 为 { snapshot: { ...原数据, projects: 更新后 } }）。同步完成后告诉用户已更新事业页。\n\n【菜单个性化规则】当用户要求调整左侧菜单时（如「隐藏内容室」「把事业改成项目」「AI助手放到最后」「改图标」），执行：1) GET http://localhost:3100/api/nav-config 拿当前菜单 items；2) 修改对应项：visible:false=隐藏、label=改名、icon=换图标、数组顺序=显示顺序（主区=今天/复盘/事业/成长/AI助手，工具区=知识中心/内容室/决策室/设置，跨区不支持）；3) PUT http://localhost:3100/api/nav-config，body 为 { \"items\": [...] } 整体提交；4) 完成后告诉用户已更新菜单。可用 key：today/reviews/career/growth/agent/knowledge/wechat/decisions/settings。",
            },
            ...history,
            { role: "user", content: text },
          ],
        }),
      });
      if (!res.ok) {
        let errMsg = `请求失败 ${res.status}`;
        try {
          const j = await res.json();
          errMsg = j.error || errMsg;
        } catch {
          /* 忽略 */
        }
        throw new Error(errMsg);
      }
      // 流式：SSE 逐块追加
      if (!res.body) throw new Error("浏览器不支持流式响应");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantText = "";
      setChatMessages((m) => [...m, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const delta = j?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              assistantText += delta;
              setChatMessages((m) => [...m.slice(0, -1), { role: "assistant", content: assistantText }]);
            }
          } catch {
            /* 跳过无法解析的 SSE 行 */
          }
        }
      }
      if (!assistantText.trim()) {
        setChatMessages((m) => [...m.slice(0, -1), { role: "assistant", content: "(无回复)" }]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setChatMessages((m) => {
        const last = m[m.length - 1];
        if (last?.role === "assistant" && !last.content) {
          return [...m.slice(0, -1), { role: "assistant", content: `⚠️ 出错了：${msg}` }];
        }
        return [...m, { role: "assistant", content: `⚠️ 出错了：${msg}` }];
      });
    } finally {
      setChatBusy(false);
    }
  }, [chatBusy]);

  const clearChat = useCallback(() => {
    setChatMessages([]);
    try {
      window.localStorage.removeItem("nestlife-chat-history");
    } catch {}
  }, []);

  // 首屏加载（API → SQLite）
  useEffect(() => {
    hydrateWorkspaceAsync().then(setWorkspace);
  }, []);

  // 动态刷新：每 60s 静默拉取最新数据（AI 助手 对话中改任务/项目后页面自动更新）
  // 保留本地优先：只在用户没有正在编辑时刷新（简单方案：拉取后合并）
  useEffect(() => {
    const timer = setInterval(async () => {
      // 用户最近 3 秒内编辑过 → 跳过本轮刷新（等自动保存落地后再同步，避免覆盖未保存输入）
      if (Date.now() - lastEditRef.current < 3000) return;
      try {
        const res = await fetch("/api/workspace");
        const data = await res.json();
        if (!data?.snapshot) return;
        setWorkspace((prev) => {
          if (!prev) return prev;
          // 合并：快照字段用服务器值，但保留本地未保存的 tasks 状态
          const serverTasks = Array.isArray(data.tasks)
            ? data.tasks.map((t: Record<string, unknown>) => ({
                id: String(t.id),
                branchId: (String(t.branch_id ?? "career") as "career" | "growth" | "life"),
                title: String(t.title),
                date: String(t.date),
                startTime: t.start_time ? String(t.start_time) : undefined,
                minutes: Number(t.minutes ?? 60),
                priority: (t.priority as "high" | "mid" | "low") ?? "mid",
                status: (t.status as "todo" | "doing" | "done" | "deferred") ?? "todo",
                note: String(t.note ?? ""),
                createdAt: String(t.created_at ?? ""),
                completedAt: t.completed_at ? String(t.completed_at) : undefined,
                source: t.source ? String(t.source) : undefined,
                auto: Number(t.auto ?? 0) === 1,
                goalId: t.goal_id ? String(t.goal_id) : undefined,
              }))
            : prev.tasks;
          return {
            ...prev,
            ...(data.snapshot as Record<string, unknown>),
            tasks: serverTasks,
          };
        });
      } catch {
        // 静默失败
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // 自动保存（防抖 800ms，避免频繁写库）
  useEffect(() => {
    if (!workspace) return;
    const t = setTimeout(() => {
      saveWorkspaceAsync(workspace);
    }, 800);
    return () => clearTimeout(t);
  }, [workspace]);

  // ⌘K 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const update = useCallback((fn: (w: Workspace) => Workspace) => {
    lastEditRef.current = Date.now();
    setWorkspace((prev) => (prev ? fn(prev) : prev));
  }, []);

  // ─── 任务操作 ───
  const addTask = useCallback((task: Omit<Task, "id" | "createdAt" | "status" | "completedAt">) => {
    update((w) => ({
      ...w,
      tasks: [...w.tasks, { ...task, id: makeId("t"), status: "todo", createdAt: todayStr() }],
    }));
  }, [update]);

  const toggleTask = useCallback((taskId: string) => {
    update((w) => ({
      ...w,
      tasks: w.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: t.status === "done" ? "todo" : "done", completedAt: t.status === "done" ? undefined : todayStr() }
          : t
      ),
    }));
  }, [update]);

  const removeTask = useCallback((taskId: string) => {
    update((w) => ({
      ...w,
      tasks: w.tasks.filter((t) => t.id !== taskId),
      todayTop3: w.todayTop3.filter((id) => id !== taskId),
    }));
  }, [update]);

  // ─── 里程碑 ───
  const toggleMilestone = useCallback((id: string) => {
    update((w) => ({
      ...w,
      milestones: w.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)),
    }));
  }, [update]);

  // ─── 成长：习惯 + 复盘（每日记录统一在复盘页日复盘） ───
  const toggleHabit = useCallback((habitId: string) => {
    update((w) => {
      const today = todayStr();
      return {
        ...w,
        habits: w.habits.map((h) => {
          if (h.id !== habitId) return h;
          const has = h.doneDates.includes(today);
          return {
            ...h,
            doneDates: has ? h.doneDates.filter((d) => d !== today) : [...h.doneDates, today],
          };
        }),
      };
    });
  }, [update]);

  // ─── 复盘（L4 已独立为 ReviewsView + reviews 表，快照内旧 reviews 由 migrateReviewsFromSnapshot 迁移） ───


  // ─── 设置 ───
  const updateSchedule = useCallback((items: ScheduleItem[]) => {
    update((w) => ({ ...w, schedule: items }));
  }, [update]);

  // 全局快捷键：空格勾选首个未完成任务 / n 聚焦输入 / 1-7 切页
  const todayTasksForShortcut = (workspace?.tasks ?? []).filter((t) => t.date === todayStr() && t.status !== "done");
  useGlobalShortcuts({
    activeView,
    setActiveView: (v) => setActiveView(v),
    enabled: !commandOpen,
    onToggleFirstTask: () => {
      const first = todayTasksForShortcut[0];
      if (first) toggleTask(first.id);
    },
    focusTaskInput: () => {
      // 切到今日页并聚焦
      setActiveView("today");
      setTimeout(() => document.querySelector<HTMLInputElement>("#task-input")?.focus(), 50);
    },
  });

  const resetAll = useCallback(async () => {
    const seed = await resetWorkspaceAsync();
    setWorkspace(seed);
    setActiveView("today");
  }, []);

  if (!workspace) {
    return <div className="min-h-screen flex items-center justify-center text-[13px] text-[#A1A1AA]">加载中…</div>;
  }

  const today = todayStr();
  const todayTasks = workspace.tasks.filter((t) => t.date === today);
  const todayDone = todayTasks.filter((t) => t.status === "done").length;
  // 菜单按用户配置（隐藏项不在导航显示）
  const navItems = mergeNavConfig(workspace.navConfig);

  return (
    <ToastProvider>
    <div className="min-h-screen">
      {/* 移动端顶部导航（小屏显示，lg 隐藏） */}
      <div className="lg:hidden sticky top-0 z-20 bg-white/92 backdrop-blur-[12px] border-b border-[#E4E4E7] px-4 py-2.5 flex items-center gap-2 overflow-x-auto">
        <span className="text-[14px] font-semibold text-[#18181B] shrink-0 mr-1">🪺 筑巢人生</span>
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveView(item.key as LifeView)}
            className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold transition-colors ${
              activeView === item.key ? "bg-[#EDEDED] text-[#18181B]" : "text-[#71717A] hover:bg-[#F4F4F5]"
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        workspace={workspace}
        todayTasksDone={todayDone}
        todayTasksTotal={todayTasks.length}
      />
      <main className="lg:ml-[240px] min-h-screen p-4 lg:p-6">
        <div className="max-w-[1100px] mx-auto">
          {activeView === "today" && (
            <DashboardView
              workspace={workspace}
              toggleTask={toggleTask}
              addTask={addTask}
              removeTask={removeTask}
            />
          )}
          {activeView === "career" && (
            <CareerView workspace={workspace} toggleMilestone={toggleMilestone} />
          )}
          {activeView === "growth" && (
            <GrowthView
              workspace={workspace}
              toggleHabit={toggleHabit}
            />
          )}
          {activeView === "agent" && (
            <AgentView
              messages={chatMessages}
              busy={chatBusy}
              onSend={sendAgentMessage}
              onClear={clearChat}
            />
          )}
          {activeView === "knowledge" && <KnowledgeView />}
          { activeView === "decisions" && (
            <DecisionsView setActiveView={setActiveView} />
          )}
          {activeView === "reviews" && <ReviewsView />}
          {activeView === "wechat" && <WechatView />}
          {activeView === "settings" && (
            <SettingsView workspace={workspace} updateSchedule={updateSchedule} resetAll={resetAll} />
          )}
        </div>
      </main>
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        workspace={workspace}
        setActiveView={setActiveView}
        onQuickAddTask={(title) => {
          if (title) addTask({ branchId: "career", title, date: today, minutes: 60, priority: "mid", note: "⌘K 快速添加" });
        }}
      />
    </div>
    </ToastProvider>
  );
}
