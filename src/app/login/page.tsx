"use client";

import { useState } from "react";

/** 登录页（NESTLIFE_AUTH=1 时使用；未启用时访问会立即跳回首页） */
export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d?.error || "登录失败");
        setBusy(false);
        return;
      }
      // 登录成功 → 跳回来源页（或首页）
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next;
    } catch {
      setError("网络错误");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F7F7]">
      <div className="w-[340px] bg-white border border-[#E4E4E7] rounded-[14px] p-8 shadow-[0_18px_60px_rgba(34,42,38,0.11)]">
        <div className="text-[26px] mb-2">🪺</div>
        <div className="text-[16px] font-bold text-[#18181B] mb-1">筑巢人生 NestLife</div>
        <div className="text-[12px] text-[#71717A] mb-6">输入管理密码以继续</div>
        <input
          type="password"
          className="input-field w-full mb-3"
          placeholder="管理密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
        />
        {error && <div className="text-[12px] text-[#DC2626] mb-3">{error}</div>}
        <button
          className="primary-button w-full"
          onClick={submit}
          disabled={busy}
        >
          {busy ? "登录中…" : "登录"}
        </button>
      </div>
    </div>
  );
}
