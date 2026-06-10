"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { ui } from "../admin/ui-styles";

type Phase = "loading" | "choose_role" | "requested" | "error";

export default function TmaPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [msg, setMsg] = useState("Авторизация через Telegram…");

  function getInitData(): string | null {
    // @ts-expect-error — SDK Telegram подгружается скриптом
    const wa = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
    if (!wa || !wa.initData) return null;
    wa.ready();
    wa.expand?.();
    return wa.initData as string;
  }

  async function authenticate() {
    const initData = getInitData();
    if (!initData) {
      setPhase("error");
      setMsg("Открой это приложение внутри Telegram.");
      return;
    }
    try {
      const res = await fetch("/api/tma/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.replace("/admin");
      } else if (data.needRole) {
        setPhase("choose_role");
      } else {
        setPhase("error");
        setMsg(data.error || "Не удалось авторизоваться.");
      }
    } catch {
      setPhase("error");
      setMsg("Ошибка сети при авторизации.");
    }
  }

  async function requestRole(role: "client" | "contributor") {
    const initData = getInitData();
    if (!initData) return;
    setPhase("loading");
    setMsg("Отправляю заявку…");
    try {
      const res = await fetch("/api/tma/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, role }),
      });
      if (res.ok) setPhase("requested");
      else {
        setPhase("error");
        setMsg("Не удалось отправить заявку.");
      }
    } catch {
      setPhase("error");
      setMsg("Ошибка сети.");
    }
  }

  useEffect(() => {
    // @ts-expect-error — SDK Telegram
    if (typeof window !== "undefined" && window.Telegram?.WebApp) authenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ ...ui.page, display: "grid", placeItems: "center", padding: 24 }}>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={authenticate} />
      <div style={{ ...ui.card, maxWidth: 360, textAlign: "center" }}>
        <div style={ui.monoLabel}>Lambertain PM</div>

        {phase === "choose_role" ? (
          <>
            <h1 style={{ ...ui.h1, fontSize: 24, marginTop: 14 }}>Кто вы?</h1>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
              Выберите роль — после подтверждения откроется доступ.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              <button onClick={() => requestRole("client")} style={ui.btnAccent}>
                Клиент
              </button>
              <button onClick={() => requestRole("contributor")} style={ui.btn}>
                Разработчик
              </button>
            </div>
          </>
        ) : phase === "requested" ? (
          <>
            <h1 style={{ ...ui.h1, fontSize: 22, marginTop: 14 }}>Заявка отправлена</h1>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12 }}>
              Для активации доступа напишите в личные сообщения:
            </p>
            <a
              href="https://t.me/soloveynik"
              target="_blank"
              rel="noreferrer"
              style={{ ...ui.btnAccent, display: "inline-block", marginTop: 14, textDecoration: "none" }}
            >
              Написать @soloveynik
            </a>
          </>
        ) : (
          <>
            <p style={{ marginTop: 16, fontSize: 14, color: phase === "loading" ? "var(--text)" : "var(--muted)" }}>
              {msg}
            </p>
            {phase === "loading" && <div style={{ ...ui.monoLabel, color: "var(--accent)", marginTop: 12 }}>···</div>}
          </>
        )}
      </div>
    </div>
  );
}
