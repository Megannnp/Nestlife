"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/**
 * 全局 Toast 反馈 — 顶部滑出，1.8s 自动消失
 * 用法：const { toast } = useToast(); toast("✅ 已保存");
 */

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; type: ToastType; text: string };

const ToastContext = createContext<{ toast: (text: string, type?: ToastType) => void }>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((text: string, type: ToastType = "success") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2000);
  }, []);

  const colorMap: Record<ToastType, string> = {
    success: "bg-[#27272A] text-white",
    error: "bg-[#DC2626] text-white",
    info: "bg-[#3F3F46] text-white",
  };
  const iconMap: Record<ToastType, string> = { success: "✓", error: "✕", info: "ℹ" };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast 容器 */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className={`${colorMap[t.type]} px-4 py-2 rounded-[10px] text-[13px] font-semibold shadow-lg flex items-center gap-2 animate-[toastIn_180ms_ease]`}
            style={{ animation: "toastIn 180ms ease" }}
          >
            <span className="text-[12px]">{iconMap[t.type]}</span>
            {t.text}
          </div>
        ))}
      </div>
      <style jsx global>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
