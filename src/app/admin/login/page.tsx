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

  useEffect(() => {
    setLocale(detectClientLocale());
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

        <a href={BOT_LINK} target="_blank" rel="noreferrer" style={{ ...ui.btnAccent, textAlign: "center", textDecoration: "none" }}>
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
