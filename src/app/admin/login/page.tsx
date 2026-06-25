"use client";

import { useActionState, useEffect, useState } from "react";
import { login } from "../auth-actions";
import { t, detectClientLocale, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

const BOT_LINK = "https://t.me/LambDev_bot?startapp=auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  const [showPass, setShowPass] = useState(false);
  const [locale, setLocale] = useState<Locale>("uk");
  const [botLink, setBotLink] = useState(BOT_LINK);

  useEffect(() => {
    // Локаль читаем из браузера ТОЛЬКО после монтирования: lazy-init в useState дал бы hydration mismatch
    // (сервер не знает navigator/localStorage и отрендерил бы дефолт).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(detectClientLocale());
    // DEV-22: если пришли на логин с ?next=<путь> (напр. по уведомлению на задачу), проносим путь через Telegram
    // (startapp=auth_<base64url>), чтобы после входа апка открыла браузер именно на этой странице, а не на дашборде.
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/admin") && !next.startsWith("//")) {
      const enc = btoa(next).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      setBotLink(`https://t.me/LambDev_bot?startapp=auth_${enc}`);
    }
  }, []);

  return (
    <div style={{ ...ui.page, display: "grid", placeItems: "center" }}>
      <div style={{ ...ui.card, width: 340, display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={ui.monoLabel}>Lambertain</div>
          <h1 style={{ ...ui.h1, fontSize: 30, marginTop: 8 }}>
            Dev<span style={{ color: "var(--accent)" }}>.</span>
          </h1>
        </div>

        <a href={botLink} target="_blank" rel="noreferrer" style={{ ...ui.btnAccent, textAlign: "center", textDecoration: "none" }}>
          {t(locale, "login.viaTelegram")}
        </a>
        <p style={{ ...ui.monoLabel, textTransform: "none", lineHeight: 1.5 }}>{t(locale, "login.hint")}</p>

        {showPass ? (
          <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <label style={ui.fieldLabel}>{t(locale, "login.adminPassword")}</label>
            <input type="password" name="password" autoFocus style={ui.input} />
            {state?.error && (
              <span style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none" }}>{t(locale, "login.wrongPassword")}</span>
            )}
            <button type="submit" disabled={pending} style={{ ...ui.btn, opacity: pending ? 0.6 : 1 }}>
              {pending ? t(locale, "common.loggingIn") : t(locale, "login.loginWithPassword")}
            </button>
          </form>
        ) : (
          <button onClick={() => setShowPass(true)} style={{ ...ui.monoLabel, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
            {t(locale, "login.passwordLink")}
          </button>
        )}
      </div>
    </div>
  );
}
