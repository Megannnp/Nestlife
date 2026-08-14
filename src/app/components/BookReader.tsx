"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  relPath: string;
  name: string;
  onClose: () => void;
};

type Note = {
  id: string;
  book: string;
  text: string;
  note: string;
  occurrence: number;
  paraIndex?: number;
  startOffset?: number;
  endOffset?: number;
  created_at: string;
};

/** 与 KnowledgeView 共用的阅读进度 key */
const PROGRESS_KEY = "nestli…s_v1";

function loadProgress(): Record<string, { percent: number; lastReadAt: number }> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 轻量 markdown → HTML（标题/段落/列表/加粗/分隔线/代码块/笔记高亮） */
function mdToHtml(md: string, notes: Note[]): { html: string; headings: { id: string; text: string; level: number }[] } {
  const headings: { id: string; text: string; level: number }[] = [];
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listBuf: string[] = [];
  let listOpen = false;

  // 噪音标题：epub 转换产生的空/封面/目录标题，不渲染不收录
  const noiseHeading = (s: string) => {
    const t = s.replace(/[#\s]/g, "").toLowerCase();
    if (!t || t === "未知" || /^\d+$/.test(t)) return true;
    return /^(cover|contents?|目录|扉页|版权页|书名页|版权|landmarks?)$/.test(t) || /^目录\s*contents?$/.test(t) || t.includes("landmark");
  };
  // 章节模式：第X章/节/回/卷（无句读的短行）→ 作为三级目录
  const chapterPattern = /^第[一二三四五六七八九十百零0-9]{1,6}[章节回卷部篇][\s　]*(.*)$/;

  // 超长段落按句读切分（epub 常把整节压成一段）
  const splitPara = (t: string): string[] => {
    if (t.length <= 500) return [t];
    const parts = t.split(/([。！？；.!?;])/);
    const chunks: string[] = [];
    let cur = "";
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i] + (parts[i + 1] && /^[。！？；.!?;]$/.test(parts[i + 1]) ? parts[++i] : "");
      if (!seg) continue;
      if ((cur + seg).length > 200 && cur) {
        chunks.push(cur);
        cur = seg;
      } else {
        cur += seg;
      }
    }
    if (cur) chunks.push(cur);
    return chunks.length > 0 ? chunks : [t];
  };

  // 短行合并：OCR/排版书常见整行断行 → 连续短行合并成一段（遇空行/长行/标题/列表时断段）
  const SHORT_LINE = 40;
  let paraBuf: string[] = [];
  // 段落计数器：与保存笔记时的 DOM <p> 顺序一一对应（精确定位用）
  let paraIdx = 0;
  let tableBuf: string[] | null = null;
  let quoteBuf: string[] | null = null;
  const flushTable = () => {
    if (!tableBuf) return;
    const rows: string[] = [];
    for (const rawRow of tableBuf) {
      const cells = rawRow
        .split("|")
        .map((c) => c.trim())
        .filter((c, i, arr) => !(i === 0 && c === "") && !(i === arr.length - 1 && c === ""));
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // 分隔行
      rows.push(`<tr>${cells.map((c) => `<td style="padding:6px 10px;border:1px solid #E4E4E7;font-size:13px;line-height:1.6;">${inline(c)}</td>`).join("")}</tr>`);
    }
    if (rows.length > 0) {
      out.push(`<div style="overflow-x:auto;margin:0 0 14px;"><table style="border-collapse:collapse;width:100%;">${rows.join("")}</table></div>`);
    }
    tableBuf = null;
  };
  const flushQuote = () => {
    if (!quoteBuf) return;
    out.push(`<blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #D4D4D8;background:#FAFAFA;border-radius:0 8px 8px 0;color:#52525B;font-size:13.5px;line-height:1.8;">${quoteBuf.map((q) => inline(q)).join("<br/>")}</blockquote>`);
    quoteBuf = null;
  };
  const flushPara = () => {
    if (paraBuf.length > 0) {
      out.push(`<p style="margin:0 0 14px;line-height:1.9;">${inline(paraBuf.join(""), paraIdx)}</p>`);
      paraBuf = [];
      paraIdx++;
    }
  };
  const emitPara = (t: string) => {
    for (const chunk of splitPara(t)) {
      out.push(`<p style="margin:0 0 14px;line-height:1.9;">${inline(chunk, paraIdx)}</p>`);
      paraIdx++;
    }
  };

  // 笔记高亮：行内文本中命中笔记原文 → <mark>
  // 新数据：按「段落索引 + 段内偏移」精确定位（保存时刻缓存，不依赖事后匹配）
  // 旧数据：按"第几次出现"匹配（无 paraIndex 时回退）
  const noteList = notes.map((n) => ({
    id: n.id,
    text: escapeHtml(n.text.replace(/\s+/g, " ").trim().slice(0, 200)),
    occurrence: Number(n.occurrence) || 1,
    paraIndex: n.paraIndex,
    startOffset: n.startOffset,
    endOffset: n.endOffset,
  }));
  const noteCounters = new Map<string, number>();

  const closeList = () => {
    if (listOpen) {
      out.push(`<ul style="margin:0 0 14px;padding-left:22px;">${listBuf.map((i) => `<li style="margin-bottom:4px;">${i}</li>`).join("")}</ul>`);
      listBuf = [];
      listOpen = false;
    }
  };

  /** 在已转换的 HTML 字符串上，按「纯文本偏移」插入 <mark>（跳过已有标签，从后往前避免偏移错乱） */
  const applyNoteMark = (s: string, startOff: number, endOff: number): string => {
    const insertAt = (textOff: number): number => {
      let textCount = 0;
      let i = 0;
      const n = s.length;
      while (i < n) {
        if (s[i] === "<") {
          const gt = s.indexOf(">", i);
          i = gt === -1 ? n : gt + 1;
          continue;
        }
        if (textCount === textOff) return i;
        textCount++;
        i++;
      }
      return -1;
    };
    const openPos = insertAt(startOff);
    if (openPos === -1) return s;
    let closePos = insertAt(endOff);
    if (closePos === -1) closePos = s.length;
    return s.slice(0, openPos) + '<mark style="background:#FEF3C7;border-radius:2px;padding:0 1px;">' + s.slice(openPos, closePos) + "</mark>" + s.slice(closePos);
  };

  const inline = (t: string, paraIdx?: number) => {
    let s = escapeHtml(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_m, alt: string) => `📷 ${alt || "图片"}`)
      .replace(/\[([^\]]+)\]\(([^)]*)\)/g, (_m, label: string, url: string) => {
        // URL 协议白名单：仅 http/https/mailto/锚点/相对路径，防止 javascript: 等注入
        const u = url.trim();
        const safe = /^(https?:|mailto:|#|\/|\.)/i.test(u)
          ? u.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
          : "#";
        return `<a href="${safe}" target="_blank" rel="noreferrer" style="color:#2563EB;text-decoration:underline;">${label}</a>`;
      });
    if (paraIdx != null) {
      // 新数据：按段落索引 + 段内偏移精确定位（多笔记从后往前插入）
      const marks = noteList
        .filter((n) => n.paraIndex === paraIdx && n.startOffset != null && n.endOffset != null && n.startOffset < n.endOffset)
        .sort((a, b) => (b.startOffset ?? 0) - (a.startOffset ?? 0));
      for (const n of marks) {
        s = applyNoteMark(s, n.startOffset!, n.endOffset!);
      }
      return s;
    }
    // 旧数据回退：occurrence 匹配
    for (const n of noteList) {
      if (!n.text) continue;
      const before = noteCounters.get(n.id) ?? 0;
      let countInLine = 0;
      let hit = s.indexOf(n.text);
      while (hit !== -1) {
        countInLine++;
        hit = s.indexOf(n.text, hit + n.text.length);
      }
      noteCounters.set(n.id, before + countInLine);
      if (before < n.occurrence && n.occurrence <= before + countInLine) {
        let j = -1;
        for (let k = 0; k < n.occurrence - before; k++) {
          j = s.indexOf(n.text, j + 1);
        }
        if (j !== -1) {
          s = s.slice(0, j) + `<mark style="background:#FEF3C7;border-radius:2px;padding:0 1px;">${n.text}</mark>` + s.slice(j + n.text.length);
        }
      }
    }
    return s;
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }
    if (t.startsWith("```")) {
      if (inCode) {
        flushPara();
        out.push(`<pre style="background:#F8F8F9;border-radius:8px;padding:12px 14px;font-size:12px;overflow-x:auto;margin:0 0 14px;">${escapeHtml(codeBuf.join("\n"))}</pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        flushPara();
        closeList();
        inCode = true;
      }
      continue;
    }
    // 表格：连续 | 行（含分隔行）收集为 <table>
    if (tableBuf && !/\|/.test(t)) flushTable();
    if (/^\|.*\|\s*$/.test(t)) {
      flushPara();
      closeList();
      if (!tableBuf) tableBuf = [];
      tableBuf.push(t);
      continue;
    }
    // 引用：> 开头连续行收集为 <blockquote>
    if (quoteBuf && !/^>\s?/.test(t)) flushQuote();
    if (/^>\s?/.test(t)) {
      flushPara();
      closeList();
      if (!quoteBuf) quoteBuf = [];
      quoteBuf.push(t.replace(/^>\s?/, ""));
      continue;
    }
    if (!t) {
      closeList();
      flushPara();
      continue;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      flushPara();
      const level = h[1].length;
      const textRaw = h[2].trim();
      if (!noiseHeading(textRaw)) {
        const id = `sec-${headings.length}`;
        const text = inline(textRaw);
        headings.push({ id, text: textRaw, level });
        const size = level === 1 ? "22px" : level === 2 ? "18px" : "15px";
        out.push(
          `<h${level} id="${id}" style="font-size:${size};font-weight:700;color:#18181B;margin:26px 0 12px;line-height:1.5;">${text}</h${level}>`
        );
      }
      continue;
    }
    // 章节模式标题（第X章…），无句读的短行才认
    const ch = t.match(chapterPattern);
    if (ch && t.length <= 40 && !/[。！？；.!?;]/.test(t)) {
      closeList();
      flushPara();
      const id = `sec-${headings.length}`;
      const textRaw = (ch[1] ? ch[1] : t).trim();
      headings.push({ id, text: textRaw, level: 3 });
      out.push(`<h3 id="${id}" style="font-size:15px;font-weight:700;color:#18181B;margin:24px 0 10px;line-height:1.5;">${inline(t)}</h3>`);
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      flushPara();
      listOpen = true;
      listBuf.push(inline(t.replace(/^[-*]\s+/, "")));
      continue;
    }
    if (/^\d+[.、]\s+/.test(t)) {
      flushPara();
      listOpen = true;
      listBuf.push(inline(t.replace(/^\d+[.、]\s+/, "")));
      continue;
    }
    if (/^-{3,}$/.test(t)) {
      flushPara();
      closeList();
      out.push('<hr style="border:none;border-top:1px solid #E4E4E7;margin:22px 0;" />');
      continue;
    }
    closeList();
    // 短行累积合并；长行直接成段
    if (t.length < SHORT_LINE) {
      paraBuf.push(t);
    } else {
      flushPara();
      emitPara(t);
    }
  }
  flushPara();
  closeList();
  flushTable();
  flushQuote();
  if (inCode) out.push(`<pre style="background:#F8F8F9;border-radius:8px;padding:12px 14px;font-size:12px;overflow-x:auto;">${escapeHtml(codeBuf.join("\n"))}</pre>`);
  return { html: out.join("\n"), headings };
}

const QUICK_QS = ["这本书的核心观点是什么？", "结合我的项目，这个理论怎么应用？", "帮我生成一个行动计划"];

/** 全屏阅读器：左目录 / 中正文 / 右 AI 助手 + 笔记高亮 + 移动端 */
export function BookReader({ relPath, name, onClose }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [percent, setPercent] = useState(0);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [aiError, setAiError] = useState("");

  const [notes, setNotes] = useState<Note[]>([]);
  const [selMenu, setSelMenu] = useState<{
    x: number;
    y: number;
    text: string;
    below?: boolean;
    t?: number;
    loc?: { paraIndex: number; startOffset: number; endOffset: number };
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ text: string; note: string; loc?: { paraIndex: number; startOffset: number; endOffset: number } } | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"toc" | "ai" | null>(null);
  const [rightTab, setRightTab] = useState<"ai" | "notes">("ai");

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastSave = useRef(0);

  const { html, headings } = useMemo(() => mdToHtml(content, notes), [content, notes]);
  // 稳定引用：防止任何一次重渲染都重设 innerHTML（会整体重建正文 DOM → 清空选区 → 选中背景消失）
  const articleHtml = useMemo(() => ({ __html: html }), [html]);
  /** AI 回答：markdown → 渲染（粗体/列表/段落，去掉源码符号） */
  const answerHtml = useMemo(() => (answer ? mdToHtml(answer, []).html : ""), [answer]);
  const bookName = name.replace(/\.md$/, "").replace(/_OCR$/, "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/knowledge/file?path=${encodeURIComponent(relPath)}&full=1`);
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(d.error || "加载失败");
        else setContent(d.content ?? "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relPath]);

  // 加载笔记
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/book-notes?book=${encodeURIComponent(relPath)}`);
        const d = await res.json();
        if (!cancelled && Array.isArray(d.notes)) setNotes(d.notes);
      } catch {
        /* 忽略 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relPath]);

  // 恢复阅读进度（DOM 操作）
  const restored = useRef(false);
  useEffect(() => {
    if (loading || !html || restored.current) return;
    restored.current = true;
    const el = bodyRef.current;
    const saved = loadProgress()[name];
    if (el && saved && saved.percent > 0) {
      el.scrollTop = saved.percent * (el.scrollHeight - el.clientHeight);
      setPercent(Math.round(saved.percent * 100));
    }
  }, [loading, html, name]);

  /** 选中工具条位置计算：视口坐标（fixed 定位，顶部空间不足时放到选中文字下方） */
  /** 计算选区在正文中的精确位置（段落索引 + 段内字符偏移），供保存时缓存定位 */
  const calcParaLoc = (): { paraIndex: number; startOffset: number; endOffset: number } | null => {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const article = document.querySelector("main article");
      if (!article) return null;
      const range = sel.getRangeAt(0);
      const startEl = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : (range.startContainer as Element);
      const endEl = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : (range.endContainer as Element);
      const startP = startEl?.closest?.("p");
      const endP = endEl?.closest?.("p");
      if (!startP || !endP) return null;
      const paras = Array.from(article.querySelectorAll("p"));
      const paraIndex = paras.indexOf(startP);
      if (paraIndex === -1) return null;
      const textOffsetIn = (p: HTMLElement, container: Node, offset: number): number => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        let count = 0;
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (node === container) return count + offset;
          count += (node.textContent || "").length;
        }
        return count;
      };
      const startOffset = textOffsetIn(startP, range.startContainer, range.startOffset);
      const endOffset =
        startP === endP ? textOffsetIn(startP, range.endContainer, range.endOffset) : (startP.textContent || "").length;
      if (endOffset <= startOffset) return null;
      return { paraIndex, startOffset, endOffset };
    } catch {
      return null;
    }
  };

  const computeSelMenu = (): { x: number; y: number; text: string; below?: boolean; loc?: { paraIndex: number; startOffset: number; endOffset: number } } | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const text = sel.toString().trim();
    if (text.length < 2) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    const above = rect.top - 44;
    return {
      x: rect.left + rect.width / 2,
      y: above > 8 ? above : rect.bottom + 10,
      below: above <= 8,
      text: text.slice(0, 2000),
      loc: calcParaLoc() ?? undefined,
    };
  };

  /** 统一刷新选中工具条（selectionchange / document mouseup / article mouseup 共用）
   *  注意：必须在事件栈内同步计算位置（此时选区有效），不能把计算放进 setState 的 updater 里——
   *  updater 会被 React 延迟到渲染阶段执行，那时选区可能已被清空，位置就算不出来了。 */
  const refreshSelMenu = () => {
    const m = computeSelMenu(); // 同步计算：事件处理期间选区有效，loc 才能取到
    setSelMenu((prev) => {
      if (!m) {
        // 选择被清空：焦点在工具条内，或工具条刚出现（2s 内，防 DOM 重建清空选区导致来不及点击）→ 保留
        if (prev && document.activeElement?.closest?.("[data-note-ui]")) return prev;
        if (prev && Date.now() - (prev as { t?: number }).t! < 2000) return prev;
        return null;
      }
      if (prev && prev.text === m.text && Math.abs(prev.x - m.x) < 2 && Math.abs(prev.y - m.y) < 2) return prev;
      return { ...m, t: prev?.t ?? Date.now() };
    });
  };

  useEffect(() => {
    // 只在「松开鼠标」时计算一次工具条位置（事件栈内同步，选区已定型、依然有效）。
    // 不要监听 selectionchange：拖拽过程中它会高频触发，每次 setState 都引发重渲染，
    // 会打断拖拽甚至破坏选区（导致选中从段首开始/工具条消失）。
    const onUp = (e: MouseEvent) => {
      // 点击工具条本身不触发
      if ((e.target as HTMLElement).closest?.("[data-note-ui]")) return;
      refreshSelMenu();
    };
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    // 正文滚动时隐藏选中工具条（避免 fixed 定位悬浮在错误位置）
    if (selMenu) setSelMenu(null);
    const el = bodyRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    const pct = Math.min(1, Math.max(0, el.scrollTop / max));
    setPercent(Math.round(pct * 100));
    const now = Date.now();
    if (now - lastSave.current < 500) return;
    lastSave.current = now;
    try {
      const all = loadProgress();
      all[name] = { percent: pct, lastReadAt: now };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
    } catch {
      /* 忽略 */
    }
  };

  const scrollTo = (id: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const target = el.querySelector(`#${CSS.escape(id)}`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** 计算选中文本是全文中的第几次出现（精确高亮定位）：遍历文本节点到选区起点累计 */
  const calcOccurrence = (text: string): number => {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return 1;
      const article = document.querySelector("main article");
      if (!article) return 1;
      const range = sel.getRangeAt(0);
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      let count = 0;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const nodeText = (node as Text).textContent ?? "";
        if (node === range.startContainer) {
          const prefix = nodeText.slice(0, range.startOffset);
          let idx = prefix.indexOf(text);
          while (idx !== -1) {
            count++;
            idx = prefix.indexOf(text, idx + text.length);
          }
          break;
        }
        let idx = nodeText.indexOf(text);
        while (idx !== -1) {
          count++;
          idx = nodeText.indexOf(text, idx + text.length);
        }
      }
      return count + 1;
    } catch {
      return 1;
    }
  };

  /** 选中文本 → 显示"记笔记"浮动按钮 */
  const saveNote = async () => {
    if (!noteDraft || !noteDraft.text.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/book-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          book: relPath,
          text: noteDraft.text,
          note: noteDraft.note,
          occurrence: noteDraft.loc ? 1 : calcOccurrence(noteDraft.text),
          ...(noteDraft.loc ?? {}),
        }),
      });
      const d = await res.json();
      if (res.ok && d.note) {
        setNotes((prev) => [d.note, ...prev]);
        setNoteDraft(null);
      } else {
        alert(d.error || "保存失败");
      }
    } catch (e) {
      alert(String(e));
    } finally {
      setSavingNote(false);
    }
  };

  /** 直接划线高亮（不写笔记）：用工具条出现时缓存的文本 + 精确位置（不依赖点击瞬间的实时选区，防 DOM 重建/选区丢失导致错位） */
  const saveHighlight = async () => {
    if (!selMenu) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/book-notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          book: relPath,
          text: selMenu.text,
          note: "",
          occurrence: selMenu.loc ? 1 : calcOccurrence(selMenu.text),
          ...(selMenu.loc ?? {}),
        }),
      });
      const d = await res.json();
      if (res.ok && d.note) {
        setNotes((prev) => [d.note, ...prev]);
        window.getSelection()?.removeAllRanges();
        setSelMenu(null);
      } else {
        alert(d.error || "保存失败");
      }
    } catch (e) {
      alert(String(e));
    } finally {
      setSavingNote(false);
    }
  };

  const removeNote = async (id: string) => {
    if (!confirm("删除这条笔记？")) return;
    try {
      await fetch(`/api/book-notes?id=${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      /* 忽略 */
    }
  };

  const ask = async (question?: string, mode?: "summary") => {
    const text = (question ?? q).trim();
    if ((!text && mode !== "summary") || asking) return;
    setAsking(true);
    setAiError("");
    setAnswer("");
    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file: relPath, question: text, mode }),
      });
      const d = await res.json();
      if (!res.ok) setAiError(d.error || "问答失败");
      else setAnswer(d.content || "(没有返回内容)");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "问答失败");
    } finally {
      setAsking(false);
    }
  };

  const aiContent = (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-[#F1F1F3]">
        <button
          onClick={() => ask(undefined, "summary")}
          disabled={asking}
          className="w-full text-left text-[11.5px] font-semibold text-[#18181B] bg-[#F1F1F3] hover:bg-[#E4E4E7] rounded-[7px] px-2.5 py-2 mb-2 transition-colors disabled:opacity-50"
        >
          📋 一键全书总结
        </button>
        <div className="flex flex-col gap-1.5">
          {QUICK_QS.map((t) => (
            <button
              key={t}
              onClick={() => ask(t)}
              disabled={asking}
              className="text-left text-[11.5px] text-[#52525B] bg-[#FAFAFA] hover:bg-[#F1F1F3] border border-[#F0F0F1] rounded-[7px] px-2.5 py-1.5 transition-colors disabled:opacity-50"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {asking ? (
          <div className="text-[12px] text-[#A1A1AA]">思考中…</div>
        ) : aiError ? (
          <div className="text-[12px] text-[#DC2626]">⚠️ {aiError}</div>
        ) : answer ? (
          <div
            className="text-[13px] text-[#3F3F46] leading-[1.9]"
            dangerouslySetInnerHTML={{ __html: answerHtml }}
          />
        ) : (
          <div className="text-[12px] text-[#A1A1AA] leading-[1.8]">
            基于本书内容回答。可以问：核心观点、某个概念的解释、结合你的项目怎么应用。
          </div>
        )}
      </div>
      <div className="p-3 border-t border-[#F1F1F3] flex gap-2">
        <input
          className="input-field flex-1 !min-h-[34px] text-[12.5px]"
          placeholder="问这本书…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
        />
        <button className="primary-button !min-h-[34px] !text-[12px]" onClick={() => ask()} disabled={asking}>
          问
        </button>
      </div>
    </div>
  );

  const notesContent = (
    <div className="flex-1 overflow-y-auto p-3 min-h-0">
      <div className="text-[11px] font-bold text-[#71717A] mb-2">📝 我的笔记 · {notes.length}</div>
      {notes.length === 0 ? (
        <p className="text-[11px] text-[#A1A1AA]">选中正文文字，划线或记笔记</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {notes.map((n) => (
            <div key={n.id} className="bg-[#FAFAFA] border border-[#F0F0F1] rounded-[7px] px-2.5 py-2">
              <div className="text-[11.5px] text-[#18181B] leading-[1.6]">
                <mark style={{ background: "#FEF3C7" }}>{n.text.slice(0, 60)}{n.text.length > 60 ? "…" : ""}</mark>
              </div>
              {n.note && <div className="text-[11px] text-[#52525B] mt-1 leading-[1.6]">{n.note}</div>}
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9.5px] text-[#A1A1AA]">{n.created_at}</span>
                <button className="text-[10px] text-[#A1A1AA] hover:text-[#DC2626]" onClick={() => removeNote(n.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const rightTabs = (
    <div className="flex items-center gap-1 bg-[#F4F4F5] rounded-[8px] p-1 mx-3 mt-3 shrink-0">
      <button
        onClick={() => setRightTab("ai")}
        className={`flex-1 px-2.5 py-1.5 rounded-[6px] text-[12px] font-semibold transition-colors ${
          rightTab === "ai" ? "bg-white text-[#18181B] shadow-sm" : "text-[#71717A] hover:text-[#18181B]"
        }`}
      >
        🤖 AI 助手
      </button>
      <button
        onClick={() => setRightTab("notes")}
        className={`flex-1 px-2.5 py-1.5 rounded-[6px] text-[12px] font-semibold transition-colors ${
          rightTab === "notes" ? "bg-white text-[#18181B] shadow-sm" : "text-[#71717A] hover:text-[#18181B]"
        }`}
      >
        📝 笔记（{notes.length}）
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* 顶栏 */}
      <header className="shrink-0 h-[52px] border-b border-[#E4E4E7] flex items-center gap-3 px-4 bg-white/95 backdrop-blur">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-[13px] font-semibold text-[#71717A] hover:text-[#18181B] transition-colors px-2 py-1.5 rounded-[6px] hover:bg-[#F4F4F5]"
        >
          ← 我的书架
        </button>
        <div className="w-px h-4 bg-[#E4E4E7]" />
        <div className="text-[14px] font-bold text-[#18181B] truncate">{bookName}</div>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-[120px] h-1 rounded-full bg-[#F1F1F3] overflow-hidden">
            <div className="h-full rounded-full bg-[#27272A] transition-all" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-[11px] text-[#A1A1AA]">{percent}%</span>
        </div>
      </header>

      {/* 三栏 */}
      <div className="flex-1 flex min-h-0">
        {/* 左：目录（桌面） */}
        <aside className="w-[200px] shrink-0 border-r border-[#F1F1F3] overflow-y-auto p-3 hidden md:block">
          <div className="text-[10px] font-bold tracking-wide text-[#A1A1AA] mb-2 px-1">目录</div>
          {headings.length === 0 ? (
            <p className="text-[11px] text-[#A1A1AA] px-1">无章节结构</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {headings.map((h) => (
                <button
                  key={h.id}
                  onClick={() => scrollTo(h.id)}
                  className="text-left text-[12px] py-1 px-1.5 rounded-[5px] text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5] transition-colors leading-[1.5]"
                  style={{ paddingLeft: `${6 + (h.level - 1) * 12}px` }}
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* 中：正文 */}
        <main className="flex-1 min-w-0 overflow-y-auto relative" ref={bodyRef} onScroll={onScroll}>
          {loading ? (
            <div className="py-20 text-center text-[12px] text-[#A1A1AA]">加载中…</div>
          ) : error ? (
            <div className="py-20 text-center text-[13px] text-[#DC2626]">⚠️ {error}</div>
          ) : (
            <article
              className="max-w-[720px] mx-auto px-6 py-8 text-[15px] text-[#3F3F46] leading-[1.9]"
              dangerouslySetInnerHTML={articleHtml}
              onMouseUp={(e) => {
                if ((e.target as HTMLElement).closest?.("[data-note-ui]")) return;
                requestAnimationFrame(refreshSelMenu);
              }}
              onTouchEnd={() => {
                requestAnimationFrame(refreshSelMenu);
              }}
            />
          )}

          {/* 选中文本 → 工具条（划线 / 记笔记），fixed 视口定位不被滚动容器裁剪 */}
          {selMenu && (
            <div
              data-note-ui
              className="fixed z-[60] flex items-center gap-0.5 bg-white rounded-[10px] shadow-[0_6px_20px_rgba(0,0,0,0.18)] border border-[#E4E4E7] px-1.5 py-1"
              style={{
                left: selMenu.x,
                top: selMenu.y,
                transform: selMenu.below ? "translateX(-50%)" : "translate(-50%, -100%)",
              }}
            >
              <button
                className="flex items-center gap-1 text-[12px] font-semibold text-[#18181B] px-2.5 py-1.5 rounded-[7px] hover:bg-[#F4F4F5] transition-colors whitespace-nowrap"
                onMouseDown={(e) => e.preventDefault()}
                onClick={saveHighlight}
              >
                📌 划线
              </button>
              <div className="w-px h-4 bg-[#E4E4E7]" />
              <button
                className="flex items-center gap-1 text-[12px] font-semibold text-[#18181B] px-2.5 py-1.5 rounded-[7px] hover:bg-[#F4F4F5] transition-colors whitespace-nowrap"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setNoteDraft({ text: selMenu.text, note: "", loc: selMenu.loc });
                  setSelMenu(null);
                  window.getSelection()?.removeAllRanges();
                }}
              >
                ✍️ 记笔记
              </button>
            </div>
          )}
        </main>

        {/* 右：AI 助手 / 笔记（Tab 切换） */}
        <aside className="w-[300px] shrink-0 border-l border-[#F1F1F3] flex flex-col min-h-0 hidden lg:flex">
          {rightTabs}
          {rightTab === "ai" ? aiContent : notesContent}
        </aside>
      </div>

      {/* 移动端底部工具栏 */}
      <div className="lg:hidden shrink-0 h-[48px] border-t border-[#E4E4E7] flex items-center justify-around px-4 bg-white/95 backdrop-blur">
        <button className="text-[12px] font-semibold text-[#71717A] hover:text-[#18181B]" onClick={() => setMobilePanel("toc")}>
          ☰ 目录
        </button>
        <button className="text-[12px] font-semibold text-[#71717A] hover:text-[#18181B]" onClick={() => setMobilePanel("ai")}>
          🤖 AI 助手
        </button>
        <span className="text-[11px] text-[#A1A1AA]">📝 笔记 {notes.length}</span>
      </div>

      {/* 移动端面板（目录 / AI） */}
      {mobilePanel && (
        <div className="lg:hidden fixed inset-0 z-[60] bg-white flex flex-col">
          <div className="h-[48px] border-b border-[#E4E4E7] flex items-center justify-between px-4 shrink-0">
            <span className="text-[13px] font-bold text-[#18181B]">{mobilePanel === "toc" ? "目录" : "AI 助手"}</span>
            <button className="text-[12px] text-[#71717A]" onClick={() => setMobilePanel(null)}>关闭</button>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col">
            {mobilePanel === "toc" ? (
              <div className="p-3 flex flex-col gap-0.5">
                {headings.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      scrollTo(h.id);
                      setMobilePanel(null);
                    }}
                    className="text-left text-[13px] py-2 px-2 rounded-[6px] text-[#3F3F46] hover:bg-[#F4F4F5] leading-[1.6]"
                    style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
                  >
                    {h.text}
                  </button>
                ))}
              </div>
            ) : (
              <>
                {rightTabs}
                <div className="flex-1 flex flex-col min-h-0">
                  {rightTab === "ai" ? aiContent : notesContent}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 笔记弹窗 */}
      {noteDraft && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-5" onClick={() => setNoteDraft(null)}>
          <div className="bg-white rounded-[14px] w-full max-w-[480px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-[#F1F1F3] text-[13px] font-semibold text-[#18181B]">✍️ 添加笔记</div>
            <div className="p-5 flex flex-col gap-3">
              <div className="bg-[#FEF9EC] border border-[#F3E8C8] rounded-[8px] px-3 py-2.5 text-[12.5px] text-[#6B5B2A] leading-[1.7] max-h-[120px] overflow-y-auto">
                {noteDraft.text}
              </div>
              <textarea
                className="input-field w-full !min-h-[100px] resize-none text-[13px]"
                placeholder="写下你的想法…（可留空，仅高亮）"
                value={noteDraft.note}
                onChange={(e) => setNoteDraft({ ...noteDraft, note: e.target.value })}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button className="secondary-button !min-h-[32px]" onClick={() => setNoteDraft(null)}>取消</button>
                <button className="primary-button !min-h-[32px]" onClick={saveNote} disabled={savingNote}>
                  {savingNote ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
