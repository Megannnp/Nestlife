"use client";

import { useEffect, useRef, useState } from "react";

export type ChatMsg = { role: "user" | "assistant"; content: string };

interface AgentViewProps {
  messages: ChatMsg[];
  busy: boolean;
  onSend: (content: string) => void;
  onClear: () => void;
}

const QUICK_PROMPTS = [
  "今天我应该做什么？",
  "帮我汇总一下本周待办",
  "读一下我的 DASHBOARD，看看今天状态",
  "把明天的任务整理成清单",
];

/** 渲染 AI 助手 回复：识别「🔍→✅」式步骤行，渲染为步骤列表 */
/** 行内 markdown 轻量渲染：转义 HTML 后处理粗体、斜体、行内代码 */
function inlineMd(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\s][^*]*)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function AssistantContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const hasSteps = lines.some((l) => /^(→|✅|🔍|📖|💾|📋|⏰|🧭)/.test(l.trim()));
  if (!hasSteps) return <span dangerouslySetInnerHTML={{ __html: inlineMd(content).replace(/\n/g, "<br/>") }} />;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, i) => {
        const t = line.trim();
        if (/^(→|✅|🔍|📖|💾|📋|⏰|🧭)/.test(t)) {
          return (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span>{t.startsWith("→") ? "↳" : t[0]}</span>
              <span
                className={t.startsWith("✅") ? "text-[#059669]" : ""}
                dangerouslySetInnerHTML={{ __html: inlineMd(t.slice(1).trim()) }}
              />
            </div>
          );
        }
        return <span key={i} dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />;
      })}
    </div>
  );
}

/** AI 助手：对话即执行（状态由 Home 持有，切换页面不丢）；AI 网关未接入时优雅降级 */
export function AgentView({ messages, busy, onSend, onClear }: AgentViewProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  // 检测 AI 网关是否已接入（GET /api/agent）
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setAiEnabled(!!d?.enabled);
      })
      .catch(() => {
        if (!cancelled) setAiEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || busy || aiEnabled === false) return;
    onSend(content);
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-48px)]">
      {/* 头部 */}
      <section className="workspace-pane !py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[9px] bg-[#18181B] text-white flex items-center justify-center text-[16px]">🤖</div>
          <div>
            <div className="text-[15px] font-bold text-[#18181B]">AI 助手</div>
            <div className="text-[11px] text-[#A1A1AA] mt-0.5">对话即执行：读文件 / 设提醒 / 写台账 / 整理知识</div>
          </div>
          <span className={`ml-auto text-[11px] px-2 py-1 rounded-full font-semibold ${
            busy ? "bg-[#FEF3C7] text-[#D97706]" : aiEnabled === false ? "bg-[#F1F1F3] text-[#A1A1AA]" : "bg-[#F1F1F3] text-[#52525B]"
          }`}>
            {busy ? "● 执行中…" : aiEnabled === false ? "未接入" : "已连接"}
          </span>
          {messages.length > 0 && (
            <button
              className="text-[11px] text-[#A1A1AA] hover:text-[#DC2626] px-2 py-1 rounded-[6px] hover:bg-[#F4F4F5] transition-colors"
              onClick={() => {
                if (confirm("清空全部聊天记录？")) onClear();
              }}
            >
              清空
            </button>
          )}
        </div>
      </section>

      {/* 消息区 */}
      <section className="workspace-pane flex-1 flex flex-col min-h-0 !py-0 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-10">
              <div className="text-[40px]">🤖</div>
              {aiEnabled === false ? (
                <>
                  <div className="text-[14px] font-semibold text-[#18181B]">AI 助手未接入</div>
                  <div className="text-[12px] text-[#A1A1AA] leading-[1.7] max-w-[380px]">
                    在 <span className="font-semibold text-[#52525B]">设置 → AI 助手接入</span> 填入网关地址和
                    Key 即可启用，无需重启。支持 DeepSeek / 通义 / Ollama 等任意 OpenAI 兼容端点。
                    <br />
                    其余功能（任务 / 复盘 / 知识 / 决策）不受影响。
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[14px] font-semibold text-[#18181B]">想让我做什么？</div>
                  <div className="text-[12px] text-[#A1A1AA] leading-[1.7] max-w-[380px]">
                    我可以读你的文件、设提醒、写台账、整理知识库。
                    <br />
                    比如：「把明天的任务整理成清单」「读一下 DASHBOARD」
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 max-w-[420px]">
                    {QUICK_PROMPTS.map((p) => (
                      <button
                        key={p}
                        className="text-[12px] px-3 py-1.5 rounded-full bg-[#F4F4F5] text-[#52525B] hover:bg-[#EDEDED] hover:text-[#18181B] transition-colors"
                        onClick={() => send(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] px-4 py-2.5 rounded-[14px] text-[13px] leading-[1.7] whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-[#18181B] text-white rounded-br-[4px]"
                    : "bg-[#F4F4F5] text-[#3F3F46] rounded-bl-[4px]"
                }`}
              >
                <AssistantContent content={m.content} />
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <div className="bg-[#F4F4F5] text-[#71717A] px-4 py-2.5 rounded-[14px] rounded-bl-[4px] text-[13px]">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce [animation-delay:120ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce [animation-delay:240ms]" />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t border-[#F1F1F3] px-4 py-3">
          <div className="flex items-center gap-2">
            <textarea
              className="input-field flex-1 resize-none leading-[1.6]"
              placeholder={aiEnabled === false ? "AI 未接入，无法发送" : "给 AI 下指令…（Enter 发送，Shift+Enter 换行）"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                  setInput("");
                  e.currentTarget.style.height = "auto";
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
              disabled={busy || aiEnabled === false}
              rows={1}
            />
            <button
              className="primary-button"
              onClick={() => {
                send(input);
                setInput("");
              }}
              disabled={busy || aiEnabled === false}
            >
              发送
            </button>
          </div>
          <div className="text-[10px] text-[#A1A1AA] mt-1.5">
            AI 可执行真实操作（读/写本地文件、设置提醒）。有风险的操作会先征询你确认。
          </div>
        </div>
      </section>
    </div>
  );
}
