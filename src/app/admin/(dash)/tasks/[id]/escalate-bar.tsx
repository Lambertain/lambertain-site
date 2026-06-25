"use client";

import { useState, useTransition } from "react";
import { delegateToAdmin } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/** DEV-30: разработчик передаёт задачу выбранному админу/супер-админу (нужны права вне его доступа). */
export function EscalateBar({ taskId, admins, locale }: { taskId: string; admins: { login: string; fullName: string }[]; locale: Locale }) {
  const [sel, setSel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div style={{ ...ui.card, padding: 14, marginTop: 16 }}>
      <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "escalate.label")}</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>{t(locale, "escalate.hint")}</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <select value={sel} onChange={(e) => { setSel(e.target.value); setMsg(null); }} style={{ ...ui.input, width: "auto", minWidth: 200 }}>
          <option value="">{t(locale, "common.choose")}</option>
          {admins.map((a) => <option key={a.login} value={a.login}>{a.fullName}</option>)}
        </select>
        <button onClick={() => start(async () => { const r = await delegateToAdmin(taskId, sel); setMsg(r.error || "✓"); })}
          disabled={!sel || pending} style={{ ...ui.btnAccent, opacity: !sel || pending ? 0.5 : 1 }}>
          {pending ? "…" : t(locale, "escalate.cta")}
        </button>
        {msg && <span style={{ ...ui.monoLabel, textTransform: "none", color: msg === "✓" ? "var(--accent)" : "#ff5b5b" }}>{msg === "✓" ? t(locale, "escalate.done") : msg}</span>}
      </div>
    </div>
  );
}
