"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "./Toast.tsx";
import { BookReader } from "./BookReader.tsx";

type KBEntry = { name: string; relPath: string; ext: string; size: number; mtime: number; type: "file" | "dir" };

const EXT_ICON: Record<string, string> = {
  ".md": "📝", ".markdown": "📝", ".txt": "📄", ".pdf": "📕", ".docx": "📘",
  ".ppt": "📊", ".pptx": "📊", ".epub": "📖", ".xlsx": "📗", ".csv": "📊",
  ".json": "📋", ".yml": "📋", ".html": "🌐", ".js": "⚡", ".jsx": "⚡",
  ".ts": "⚡", ".tsx": "⚡", ".py": "🐍", ".sql": "🗄️", ".png": "🖼️", ".jpg": "🖼️",
  ".gif": "🖼️", ".webp": "🖼️", ".svg": "🖼️",
};

/** 目录显示名：从"存储分类"变成"阅读入口" */
const DIR_LABEL: Record<string, string> = {
  "创业与商业": "📈 创业与商业",
  "个人成长": "🌱 个人成长",
  "心理学经典": "🧠 心理学经典",
  "英语学习": "📖 英语学习",
};

/** 阅读进度（localStorage，与 BookReader 共用） */
type ReadProgress = { percent: number; lastReadAt: number };
const PROGRESS_KEY = "nestli…s_v1";

function loadProgress(): Record<string, ReadProgress> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

/** 上次阅读的相对时间 */
function relTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (diffDays === 0) return `今天 ${hm}`;
  if (diffDays === 1) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const READABLE_EXT = new Set([".md", ".markdown", ".txt"]);

/** 知识中心：书架 + 阅读器（无预览面板） */
export function KnowledgeView() {
  const { toast } = useToast();
  const [files, setFiles] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [showNewDir, setShowNewDir] = useState(false);
  const [newDirName, setNewDirName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [progress] = useState<Record<string, ReadProgress>>(() =>
    typeof window === "undefined" ? {} : loadProgress()
  );
  const [searchResults, setSearchResults] = useState<{ file: string; snippet: string; score: number }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [reading, setReading] = useState<{ relPath: string; name: string } | null>(null);
  const [imgView, setImgView] = useState<{ relPath: string; name: string; src: string } | null>(null);
  const [editFile, setEditFile] = useState<{ relPath: string; name: string; content: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge");
      const d = await res.json();
      setFiles(Array.isArray(d.files) ? d.files : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2500);
  };

  /** 打开文件：书 → 阅读器；图片 → 大图；其他 → 提示 */
  const openFile = async (relPath: string) => {
    const dot = relPath.lastIndexOf(".");
    const ext = dot >= 0 ? relPath.slice(dot).toLowerCase() : "";
    if (READABLE_EXT.has(ext)) {
      setReading({ relPath, name: relPath.split("/").pop() ?? relPath });
      return;
    }
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) {
      try {
        const res = await fetch(`/api/knowledge/file?path=${encodeURIComponent(relPath)}`);
        const d = await res.json();
        if (res.ok && d.image) setImgView({ relPath, name: d.name ?? relPath.split("/").pop() ?? relPath, src: d.image });
        else flash(`⚠️ ${d.error || "加载失败"}`);
      } catch {
        flash("⚠️ 图片加载失败");
      }
      return;
    }
    flash(`ℹ️ ${ext || "该类型"}暂不支持直接阅读`);
  };

  const startEdit = async (relPath: string) => {
    try {
      const res = await fetch(`/api/knowledge/file?path=${encodeURIComponent(relPath)}&full=1`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "加载失败");
      setEditFile({ relPath, name: relPath.split("/").pop() ?? relPath, content: d.content ?? "" });
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : "加载失败"}`);
    }
  };

  const saveEdit = async () => {
    if (!editFile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/knowledge/file", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: editFile.relPath, content: editFile.content }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存失败");
      setEditFile(null);
      flash("✅ 已保存"); toast("✅ 已保存");
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : "保存失败"}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async (relPath: string, name: string) => {
    if (!confirm(`删除 ${name}？此操作不可恢复`)) return;
    try {
      const res = await fetch(`/api/knowledge/file?path=${encodeURIComponent(relPath)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      flash("🗑️ 已删除"); toast("🗑️ 已删除");
      await refresh();
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : "删除失败"}`);
    }
  };

  /** 删除文件夹（含其中文件，二次确认） */
  const deleteDir = async (dir: KBEntry, count: number) => {
    if (!confirm(`删除文件夹「${dir.name}」及其中的 ${count} 个文件？此操作不可恢复`)) return;
    try {
      const res = await fetch(`/api/knowledge?path=${encodeURIComponent(dir.relPath)}&force=1`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "删除失败");
      flash("🗑️ 已删除"); toast("🗑️ 已删除");
      await refresh();
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : "删除失败"}`);
    }
  };

  const createDoc = async () => {
    const name = newDocName.trim();
    if (!name) return;
    const filename = name.endsWith(".md") ? name : `${name}.md`;
    try {
      const res = await fetch("/api/knowledge/file", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: filename, content: `# ${name.replace(/\.md$/, "")}\n\n` }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "创建失败");
      setShowNewDoc(false);
      setNewDocName("");
      flash(`✅ 已创建 ${filename}`); toast(`✅ 已创建 ${filename}`);
      await refresh();
      setReading({ relPath: filename, name: filename });
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : "创建失败"}`);
    }
  };

  const createDir = async () => {
    const name = newDirName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mkdir", dir: name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "创建失败");
      setShowNewDir(false);
      setNewDirName("");
      flash(`✅ 已创建文件夹 ${name}`); toast(`✅ 已创建文件夹 ${name}`);
      await refresh();
    } catch (e) {
      flash(`⚠️ ${e instanceof Error ? e.message : "创建失败"}`);
    }
  };

  const searchContent = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(q)}`);
      const d = await res.json();
      setSearchResults(Array.isArray(d.results) ? d.results : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const uploadFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    let ok = 0;
    for (const f of Array.from(list)) {
      const form = new FormData();
      form.append("file", f);
      try {
        const res = await fetch("/api/knowledge", { method: "POST", body: form });
        const d = await res.json();
        if (res.ok && d.ok) ok++;
        else flash(`⚠️ ${f.name}: ${d.error || "上传失败"}`);
      } catch {
        flash(`⚠️ ${f.name}: 上传失败`);
      }
    }
    if (ok > 0) flash(`✅ 已上传 ${ok} 个文件`); toast(`✅ 已上传 ${ok} 个文件`);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await refresh();
  };

  const filtered = query.trim()
    ? files.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()) || f.relPath.toLowerCase().includes(query.trim().toLowerCase()))
    : files;

  const dirs = filtered.filter((f) => f.type === "dir");
  const flatFiles = filtered.filter((f) => f.type !== "dir");

  return (
    <div className="flex flex-col gap-4">
      {/* 头部 */}
      <section className="workspace-pane">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="section-label">知识中心</div>
            <div className="text-[12px] text-[#A1A1AA] mt-1">我的书架 · {files.filter((f) => f.type === "file").length} 份资料</div>
          </div>
          <div className="flex gap-2">
            <button className="secondary-button !min-h-[32px]" onClick={() => setShowNewDir(!showNewDir)}>
              📁 新建文件夹
            </button>
            <button className="secondary-button !min-h-[32px]" onClick={() => setShowNewDoc(!showNewDoc)}>
              ✏️ 新建文档
            </button>
            <button className="primary-button !min-h-[32px]" onClick={() => fileInputRef.current?.click()}>
              ⬆️ 上传文件
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
          </div>
        </div>

        {showNewDir && (
          <div className="flex items-center gap-2 mb-3">
            <input
              className="input-field flex-1"
              placeholder="文件夹名（如：课程学习）"
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createDir()}
              autoFocus
            />
            <button className="primary-button !min-h-[32px]" onClick={createDir}>创建</button>
            <button className="secondary-button !min-h-[32px]" onClick={() => setShowNewDir(false)}>取消</button>
          </div>
        )}

        {showNewDoc && (
          <div className="flex items-center gap-2 mb-3">
            <input
              className="input-field flex-1"
              placeholder="文档名（如：我的学习笔记）"
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createDoc()}
              autoFocus
            />
            <button className="primary-button !min-h-[32px]" onClick={createDoc}>创建</button>
            <button className="secondary-button !min-h-[32px]" onClick={() => setShowNewDoc(false)}>取消</button>
          </div>
        )}

        <input
          className="input-field w-full"
          placeholder="搜索书架…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchResults(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && searchContent()}
        />
        <div className="flex items-center gap-2 mt-2">
          <button className="secondary-button !min-h-[30px] !text-[12px]" onClick={searchContent} disabled={searching}>
            {searching ? "检索中…" : "🔍 全文检索"}
          </button>
          <span className="text-[11px] text-[#A1A1AA]">搜索书名+内容（Enter 或点全文检索）</span>
        </div>

        {notice && (
          <div className="mt-2.5 text-[12px] text-[#059669] bg-[#F0FDF4] rounded-[8px] px-3 py-2">{notice}</div>
        )}

        {/* 继续阅读 */}
        {(() => {
          const recents = Object.entries(progress)
            .filter(([, v]) => v.lastReadAt > 0)
            .sort((a, b) => b[1].lastReadAt - a[1].lastReadAt)
            .slice(0, 4);
          if (recents.length === 0) return null;
          return (
            <div className="mt-3">
              <div className="text-[11px] font-bold text-[#71717A] mb-2">⏯ 继续阅读</div>
              <div className="flex flex-col gap-1.5">
                {recents.map(([name, v]) => (
                  <button
                    key={name}
                    onClick={() => {
                      const f = files.find((x) => x.name === name);
                      if (f) openFile(f.relPath);
                    }}
                    className="text-left bg-[#FAFAFA] hover:bg-[#F1F1F3] rounded-[8px] px-3 py-2 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-[#18181B] truncate">
                        📖 {name.replace(/\.md$/, "").replace(/_OCR$/, "")}
                      </span>
                      <span className="text-[10px] text-[#A1A1AA] shrink-0">上次 {relTime(v.lastReadAt)}</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-[#E4E4E7] overflow-hidden">
                      <div className="h-full rounded-full bg-[#27272A]" style={{ width: `${Math.round(v.percent * 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-[#A1A1AA] mt-0.5">阅读进度 {Math.round(v.percent * 100)}%</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
      </section>

      {/* 书架 */}
      <section className="workspace-pane">
        <div className="section-label mb-3">{query ? `搜索结果 ${filtered.length}` : "我的书架"}</div>
        {searchResults !== null && (
          <div className="mb-3 p-3 rounded-[8px] bg-[#F8F8F9]">
            <div className="text-[11px] font-bold text-[#71717A] mb-2">🔍 内容检索：{searchResults.length} 条匹配</div>
            {searchResults.length === 0 ? (
              <p className="text-[12px] text-[#A1A1AA]">没有文件内容匹配</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {searchResults.slice(0, 6).map((r, i) => (
                  <button
                    key={i}
                    className="text-left hover:bg-white rounded-[6px] px-2 py-1.5 transition-colors"
                    onClick={() => openFile(r.file)}
                  >
                    <div className="text-[12px] font-semibold text-[#18181B]">{r.file}</div>
                    <div className="text-[11px] text-[#71717A] truncate">{r.snippet}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {loading ? (
          <p className="text-[12px] text-[#A1A1AA] py-10 text-center">加载中…</p>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-[32px] mb-3">📚</div>
            <p className="text-[12px] text-[#A1A1AA] mb-4">{query ? "没有匹配的资料" : "书架还是空的"}</p>
            {!query && (
              <div className="flex justify-center gap-2">
                <button className="secondary-button !min-h-[30px] !text-[12px]" onClick={() => setShowNewDoc(true)}>✏️ 新建文档</button>
                <button className="secondary-button !min-h-[30px] !text-[12px]" onClick={() => fileInputRef.current?.click()}>⬆️ 上传文件</button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {dirs.map((dir) => {
              const isCollapsed = !!collapsed[dir.relPath];
              const dirFiles = flatFiles.filter((f) => f.relPath.startsWith(dir.relPath + "/"));
              return (
                <div key={dir.relPath} className="group">
                  <div className="flex items-center">
                    <button
                      className="flex-1 flex items-center gap-2.5 py-2 border-b border-[#F1F1F3] w-full text-left rounded-[6px] px-1.5 hover:bg-[#F8F8F9] transition-colors"
                      onClick={() => setCollapsed({ ...collapsed, [dir.relPath]: !isCollapsed })}
                    >
                      <span className="text-[10px] text-[#A1A1AA] w-[12px]">{isCollapsed ? "▸" : "▾"}</span>
                      <span className="text-[14px] shrink-0">📁</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium text-[#18181B]">{DIR_LABEL[dir.name] ?? `📁 ${dir.name}`}</span>
                        <span className="text-[10px] text-[#A1A1AA] ml-2">{dirFiles.length} 本</span>
                      </span>
                    </button>
                    <button
                      className="shrink-0 text-[11px] text-[#71717A] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-[5px] px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => deleteDir(dir, dirFiles.length)}
                      title="删除文件夹"
                    >
                      🗑️
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div className="ml-[22px]">
                      {dirFiles.map((f) => (
                        <FileRow
                          key={f.relPath}
                          f={f}
                          progress={progress}
                          onOpen={openFile}
                          onEdit={startEdit}
                          onDelete={deleteFile}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {flatFiles.filter((f) => !f.relPath.includes("/")).map((f) => (
              <FileRow
                key={f.relPath}
                f={f}
                progress={progress}
                onOpen={openFile}
                onEdit={startEdit}
                onDelete={deleteFile}
              />
            ))}
          </div>
        )}
      </section>

      {/* 全屏阅读器 */}
      {reading && (
        <BookReader relPath={reading.relPath} name={reading.name} onClose={() => setReading(null)} />
      )}

      {/* 图片大图 */}
      {imgView && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={() => setImgView(null)}>
          <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgView.src} alt={imgView.name} className="max-w-full max-h-[82vh] rounded-[10px]" />
            <div className="text-[12px] text-white/80">{imgView.name}（点击关闭）</div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editFile && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white rounded-[14px] w-full max-w-[720px] max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#F1F1F3]">
              <div className="text-[13px] font-semibold text-[#18181B] truncate">✏️ {editFile.name}</div>
              <button className="text-[12px] text-[#A1A1AA] hover:text-[#18181B]" onClick={() => setEditFile(null)}>关闭</button>
            </div>
            <textarea
              className="flex-1 min-h-[380px] p-4 font-mono text-[12.5px] leading-[1.7] resize-none outline-none"
              value={editFile.content}
              onChange={(e) => setEditFile({ ...editFile, content: e.target.value })}
            />
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#F1F1F3]">
              <button className="secondary-button !min-h-[32px]" onClick={() => setEditFile(null)}>取消</button>
              <button className="primary-button !min-h-[32px]" onClick={saveEdit} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileRow({
  f,
  progress,
  onOpen,
  onEdit,
  onDelete,
}: {
  f: KBEntry;
  progress: Record<string, ReadProgress>;
  onOpen: (p: string) => void;
  onEdit: (p: string) => void;
  onDelete: (p: string, n: string) => void;
}) {
  const p = progress[f.name];
  return (
    <div
      className="group flex items-center gap-2.5 py-2 border-b border-[#F1F1F3] last:border-0 w-full rounded-[6px] px-1.5 hover:bg-[#F8F8F9] transition-colors"
    >
      <button className="flex-1 min-w-0 flex items-center gap-2.5 text-left" onClick={() => onOpen(f.relPath)} title={f.relPath}>
        <span className="text-[14px] shrink-0">{EXT_ICON[f.ext] ?? "📄"}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-[#18181B] truncate">{f.name.replace(/\.md$/, "").replace(/_OCR$/, "")}</div>
          {p && p.lastReadAt > 0 ? (
            <div className="flex items-center gap-1.5">
              <div className="h-1 rounded-full bg-[#E4E4E7] overflow-hidden flex-1 max-w-[120px]">
                <div className="h-full rounded-full bg-[#A1A1AA]" style={{ width: `${Math.round(p.percent * 100)}%` }} />
              </div>
              <span className="text-[10px] text-[#A1A1AA]">
                {Math.round(p.percent * 100)}% · {relTime(p.lastReadAt)}
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-[#A1A1AA] truncate">{f.relPath}</div>
          )}
        </div>
      </button>
      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="text-[11px] text-[#71717A] hover:text-[#18181B] hover:bg-[#EDEDED] rounded-[5px] px-1.5 py-1"
          onClick={() => onEdit(f.relPath)}
          title="编辑"
        >
          ✏️
        </button>
        <button
          className="text-[11px] text-[#71717A] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-[5px] px-1.5 py-1"
          onClick={() => onDelete(f.relPath, f.name)}
          title="删除"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
