"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { ui } from "../admin/ui-styles";

type Phase = "loading" | "need_invite" | "error";

export default function TmaPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [msg, setMsg] = useState("Авторизация через Telegram…");

  async function authenticate() {
    // @ts-expect-error — SDK Telegram подгружается скриптом
    const wa = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
    if (!wa || !wa.initData) {
      setPhase("error");
      setMsg("Открой это приложение внутри Telegram.");
      return;
    }
    wa.ready();
    wa.expand?.();
    try {
      const res = await fetch("/api/tma/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: wa.initData }),
      });
      if (res.ok) {
        router.replace("/admin");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.needInvite) {
        setPhase("need_invite");
        setMsg("Аккаунт не привязан. Попроси администратора прислать ссылку-приглашение.");
      } else {
        setPhase("error");
        setMsg(data.error || "Не удалось авторизоваться.");
      }
    } catch {
      setPhase("error");
      setMsg("Ошибка сети при авторизации.");
    }
  }

  useEffect(() => {
    // На случай, если скрипт уже загружен.
    // @ts-expect-error — SDK Telegram
    if (typeof window !== "undefined" && window.Telegram?.WebApp) authenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ ...ui.page, display: "grid", placeItems: "center", padding: 24 }}>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={authenticate}
      />
      <div style={{ ...ui.card, maxWidth: 360, textAlign: "center" }}>
        <div style={ui.monoLabel}>Lambertain PM</div>
        <p style={{ marginTop: 16, fontSize: 14, color: phase === "loading" ? "var(--text)" : "var(--muted)" }}>
          {msg}
        </p>
        {phase === "loading" && (
          <div style={{ ...ui.monoLabel, color: "var(--accent)", marginTop: 12 }}>···</div>
        )}
      </div>
    </div>
  );
}
