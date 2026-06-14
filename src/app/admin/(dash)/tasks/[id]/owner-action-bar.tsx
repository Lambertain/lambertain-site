"use client";

import { useTransition } from "react";
import { markOwnerActionDone } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

/**
 * Полоса «нужно действие владельца» (деплой/регистрация/токен). Видна команде, НЕ клиенту.
 * Супер-админ жмёт «Выполнил» → задача продвигается дальше. Клиент всё это время видит «в работе».
 */
export function OwnerActionBar({ taskId, action, canResolve, locale }: { taskId: string; action: string; canResolve: boolean; locale: Locale }) {
  const [pending, start] = useTransition();
  return (
    <div style={{ ...ui.card, marginTop: 12, borderColor: "#e8b339", background: "rgba(232,179,57,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...ui.monoLabel, color: "#e8b339" }}>
        <span>🛠 {t(locale, "owner.needLabel")}</span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 8, whiteSpace: "pre-wrap" }}>{action}</p>
      {canResolve && (
        <button onClick={() => start(() => { markOwnerActionDone(taskId); })} disabled={pending} style={{ ...ui.btnAccent, marginTop: 10, opacity: pending ? 0.6 : 1 }}>
          {pending ? "…" : t(locale, "owner.done")}
        </button>
      )}
    </div>
  );
}
