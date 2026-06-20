"use client";

import { useState, useTransition } from "react";
import { markOwnerActionDone, handStepToClient } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/**
 * Полоса «ручной шаг агентства» (деплой/регистрация/токен) — наш ops-шаг (его делает супер-админ/команда).
 * Видна только команде, НЕ стороне клиента. Супер-админ жмёт «Выполнил» → задача продвигается. Клиент видит «в работе».
 * canToClient — супер-админ может переназначить шаг КЛИЕНТУ (когда часть/всё — клиентское: зарегистрировать сервис/токен).
 */
export function OwnerActionBar({ taskId, action, canResolve, canToClient, locale }: { taskId: string; action: string; canResolve: boolean; canToClient?: boolean; locale: Locale }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div style={{ ...ui.card, marginTop: 12, borderColor: "#e8b339", background: "rgba(232,179,57,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...ui.monoLabel, color: "#e8b339" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
        <span>{t(locale, "owner.needLabel")}</span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 8, whiteSpace: "pre-wrap" }}>{action}</p>
      {canResolve && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => start(() => { markOwnerActionDone(taskId); })} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.6 : 1 }}>
            {pending ? "…" : t(locale, "owner.done")}
          </button>
          {canToClient && (
            <button
              onClick={() => { setErr(null); start(async () => { const r = await handStepToClient(taskId); if (r?.error) setErr(r.error); }); }}
              disabled={pending}
              title={t(locale, "owner.toClientHint")}
              style={{ ...ui.btn, opacity: pending ? 0.6 : 1 }}
            >
              {t(locale, "owner.toClient")}
            </button>
          )}
        </div>
      )}
      {err && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{err}</p>}
    </div>
  );
}
