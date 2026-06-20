"use client";

import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

/**
 * Бейдж деплой-стадии задачи простыми словами (виден клиенту): «Готується» → «На тестовому сайті» → «Опубліковано».
 * Независим от статуса задачи. При ПЕРВОЙ встрече каждой стадии показывает разовый поясняющий бабл (с крестиком,
 * в стиле сайта) — чтобы любому пользователю было понятно, что значит статус. Запоминаем показ в localStorage.
 */
const STYLE: Record<string, { color: string; label: string; hint: string }> = {
  pr: { color: "#e8b339", label: "deploy.pr", hint: "deploy.hint.pr" },
  dev: { color: "#5b9cff", label: "deploy.dev", hint: "deploy.hint.dev" },
  prod: { color: "var(--accent)", label: "deploy.prod", hint: "deploy.hint.prod" },
};

// Чтобы на доске с кучей бейджей одной стадии не всплыло сразу много баблов — показываем один на стадию за сессию.
const shownThisSession = new Set<string>();

export function DeployBadge({ stage, locale }: { stage?: string | null; locale: Locale }) {
  const s = stage ? STYLE[stage] : undefined;
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!stage || !s) return;
    const key = `lamb:deploy-hint:${stage}`;
    try {
      if (localStorage.getItem(key)) return; // уже видели — больше не показываем
    } catch { return; }
    if (shownThisSession.has(stage)) return; // другой бейдж этой стадии уже показывает бабл
    shownThisSession.add(stage);
    setHint(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!stage || !s) return null;

  function close() {
    setHint(false);
    try { localStorage.setItem(`lamb:deploy-hint:${stage}`, "1"); } catch { /* ignore */ }
  }

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <span style={{ ...ui.monoLabel, textTransform: "none", padding: "2px 8px", border: `1px solid ${s.color}`, color: s.color, borderRadius: 999, whiteSpace: "nowrap" }}>
        {t(locale, s.label)}
      </span>
      {hint && (
        <span
          style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 60, width: 250, maxWidth: "80vw",
            background: "var(--surface-2)", border: `1px solid ${s.color}`, borderRadius: 8, padding: "10px 12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)", display: "block",
          }}
        >
          {/* стрелка-уголок */}
          <span style={{ position: "absolute", top: -5, left: 14, width: 9, height: 9, background: "var(--surface-2)", borderLeft: `1px solid ${s.color}`, borderTop: `1px solid ${s.color}`, transform: "rotate(45deg)" }} />
          <button onClick={close} aria-label="×" style={{ position: "absolute", top: 6, right: 6, background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 2 }}>×</button>
          <span style={{ ...ui.monoLabel, textTransform: "none", color: s.color, display: "block", marginBottom: 4 }}>{t(locale, s.label)}</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text)", display: "block", paddingRight: 10 }}>{t(locale, s.hint)}</span>
        </span>
      )}
    </span>
  );
}
