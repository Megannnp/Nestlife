"use client";

import { useEffect, useRef } from "react";
import type { Reminder } from "./types.ts";
import { dateLocal } from "../lib/date-local.ts";

/**
 * 提醒通知 Hook — 到点弹浏览器通知
 * 首次使用请求权限；每分钟检查一次启用中的提醒。
 */

const CHECK_MS = 60_000;

export function useReminderNotifications(reminders: Reminder[]) {
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // 请求通知权限（用户手势后更好，但首次自动请求也行）
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const check = () => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = dateLocal(now);

      for (const r of reminders) {
        if (!r.enabled) continue;
        // 一次性（date=today）或每日（date=""）
        if (r.date !== "" && r.date !== today) continue;
        if (r.time !== timeStr) continue;
        const key = `${r.id}-${today}-${timeStr}`;
        if (firedRef.current.has(key)) continue;
        firedRef.current.add(key);

        try {
          new Notification(`⏰ ${r.title}`, {
            body: `${timeStr} · 来自筑巢人生 NestLife`,
            tag: key,
          });
        } catch {
          // 浏览器不支持
        }
      }
    };

    check();
    const timer = setInterval(check, CHECK_MS);
    return () => clearInterval(timer);
  }, [reminders]);
}
