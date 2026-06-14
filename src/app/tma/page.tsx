"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { t, detectClientLocale, persistLocale, type Locale } from "@/lib/i18n";
import { ui } from "../admin/ui-styles";

type Phase = "loading" | "choose_role" | "requested" | "error";

export default function TmaPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [errKey, setErrKey] = useState("tma.authing");
  const [locale, setLocale] = useState<Locale>("uk");

  /** Диплинк из web_app-кнопки уведомления (?task=GP-3) → сразу на страницу задачи; иначе на дашборд. */
  function targetAfterAuth(): string {
    if (typeof window === "undefined") return "/admin";
    const task = new URLSearchParams(window.location.search).get("task");
    return task && /^[A-Za-z0-9]+-\d+$/.test(task) ? `/admin/tasks/${task}` : "/admin";
  }

  function getInitData(): string | null {
    // @ts-expect-error — SDK Telegram подгружается скриптом
    const wa = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
    if (!wa || !wa.initData) return null;
    wa.ready();
    wa.expand?.();
    { const l = detectClientLocale(); setLocale(l); persistLocale(l); }
    return wa.initData as string;
  }

  /**
   * Запросить у пользователя разрешение боту писать ему (requestWriteAccess).
   * Нужно, т.к. инвайтнутые открывают Mini App мимо Start у бота — без этого бот
   * не может слать им уведомления. Если уже разрешено — колбэк сработает сразу без попапа.
   */
  function ensureWriteAccess(done: () => void) {
    // @ts-expect-error — Telegram WebApp SDK
    const wa = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
    if (wa?.requestWriteAccess) {
      try { wa.requestWriteAccess(() => done()); return; } catch { /* fallthrough */ }
    }
    done();
  }

  async function authenticate() {
    const initData = getInitData();
    if (!initData) {
      setPhase("error");
      setErrKey("tma.openInTelegram");
      return;
    }
    try {
      const res = await fetch("/api/tma/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) ensureWriteAccess(() => router.replace(targetAfterAuth()));
      else if (data.needRole) setPhase("choose_role");
      else {
        setPhase("error");
        setErrKey("tma.authFailed");
      }
    } catch {
      setPhase("error");
      setErrKey("tma.netError");
    }
  }

  async function requestRole(role: "client" | "contributor" | "employee") {
    const initData = getInitData();
    if (!initData) return;
    setPhase("loading");
    setErrKey("common.sending");
    try {
      const res = await fetch("/api/tma/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, role }),
      });
      if (res.ok) ensureWriteAccess(() => setPhase("requested"));
      else {
        setPhase("error");
        setErrKey("tma.requestFailed");
      }
    } catch {
      setPhase("error");
      setErrKey("tma.netError");
    }
  }

  useEffect(() => {
    { const l = detectClientLocale(); setLocale(l); persistLocale(l); }
    // @ts-expect-error — SDK Telegram
    if (typeof window !== "undefined" && window.Telegram?.WebApp) authenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ ...ui.page, display: "grid", placeItems: "center", padding: 24 }}>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={authenticate} />
      <div style={{ ...ui.card, maxWidth: 360, textAlign: "center" }}>
        <div style={ui.monoLabel}>Lambertain Dev</div>

        {phase === "choose_role" ? (
          <>
            <h1 style={{ ...ui.h1, fontSize: 24, marginTop: 14 }}>{t(locale, "tma.whoAreYou")}</h1>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>{t(locale, "tma.chooseRoleHint")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              <button onClick={() => requestRole("client")} style={ui.btnAccent}>
                {t(locale, "role.client")}
              </button>
              <button onClick={() => requestRole("employee")} style={ui.btn}>
                {t(locale, "role.employee")}
              </button>
              <button onClick={() => requestRole("contributor")} style={ui.btn}>
                {t(locale, "role.contributor")}
              </button>
            </div>
          </>
        ) : phase === "requested" ? (
          <>
            <h1 style={{ ...ui.h1, fontSize: 22, marginTop: 14 }}>{t(locale, "tma.requestSent")}</h1>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12 }}>{t(locale, "tma.requestSentHint")}</p>
            <a
              href="https://t.me/soloveynik"
              target="_blank"
              rel="noreferrer"
              style={{ ...ui.btnAccent, display: "inline-block", marginTop: 14, textDecoration: "none" }}
            >
              {t(locale, "tma.writeAdmin")}
            </a>
          </>
        ) : (
          <>
            <p style={{ marginTop: 16, fontSize: 14, color: phase === "loading" ? "var(--text)" : "var(--muted)" }}>
              {t(locale, errKey)}
            </p>
            {phase === "loading" && <div style={{ ...ui.monoLabel, color: "var(--accent)", marginTop: 12 }}>···</div>}
          </>
        )}
      </div>
    </div>
  );
}
