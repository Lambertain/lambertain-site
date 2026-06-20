"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

/**
 * Бейдж деплой-стадии задачи простыми словами (виден клиенту): «Готується» → «На тестовому сайті» → «Опубліковано».
 * При ПЕРВОЙ встрече каждой стадии показывает разовый поясняющий бабл (×, в стиле сайта). Бабл — через портал в body,
 * position:fixed с зажимом в видимую область, чтобы НЕ вылезал за края мини-аппа / на телефоне. localStorage помнит показ.
 */
const STYLE: Record<string, { color: string; label: string; hint: string }> = {
  pr: { color: "#e8b339", label: "deploy.pr", hint: "deploy.hint.pr" },
  dev: { color: "#5b9cff", label: "deploy.dev", hint: "deploy.hint.dev" },
  prod: { color: "var(--accent)", label: "deploy.prod", hint: "deploy.hint.prod" },
};

const shownThisSession = new Set<string>();

export function DeployBadge({ stage, locale }: { stage?: string | null; locale: Locale }) {
  const s = stage ? STYLE[stage] : undefined;
  const [hint, setHint] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; arrow: number } | null>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!stage || !s) return;
    const key = `lamb:deploy-hint:${stage}`;
    try { if (localStorage.getItem(key)) return; } catch { return; }
    if (shownThisSession.has(stage)) return;
    shownThisSession.add(stage);
    setHint(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Позиция бабла: под бейджем, зажата в видимую область (минимум 8px от краёв).
  useLayoutEffect(() => {
    if (!hint || !badgeRef.current) return;
    const recalc = () => {
      const r = badgeRef.current?.getBoundingClientRect();
      if (!r) return;
      const margin = 10;
      const width = Math.min(260, window.innerWidth - margin * 2);
      const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
      const top = r.bottom + 8;
      const arrow = Math.max(10, Math.min(r.left - left + r.width / 2 - 4, width - 18));
      setPos({ top, left, width, arrow });
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => { window.removeEventListener("resize", recalc); window.removeEventListener("scroll", recalc, true); };
  }, [hint]);

  if (!stage || !s) return null;

  function close() {
    setHint(false);
    try { localStorage.setItem(`lamb:deploy-hint:${stage}`, "1"); } catch { /* ignore */ }
  }

  return (
    <>
      <span ref={badgeRef} style={{ ...ui.monoLabel, textTransform: "none", padding: "2px 8px", border: `1px solid ${s.color}`, color: s.color, borderRadius: 999, whiteSpace: "nowrap", display: "inline-flex" }}>
        {t(locale, s.label)}
      </span>
      {hint && pos && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 2000,
            background: "var(--surface-2)", border: `1px solid ${s.color}`, borderRadius: 8, padding: "10px 12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >
          <span style={{ position: "absolute", top: -5, left: pos.arrow, width: 9, height: 9, background: "var(--surface-2)", borderLeft: `1px solid ${s.color}`, borderTop: `1px solid ${s.color}`, transform: "rotate(45deg)" }} />
          <button onClick={close} aria-label="×" style={{ position: "absolute", top: 6, right: 6, background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 2 }}>×</button>
          <span style={{ ...ui.monoLabel, textTransform: "none", color: s.color, display: "block", marginBottom: 4 }}>{t(locale, s.label)}</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text)", display: "block", paddingRight: 12 }}>{t(locale, s.hint)}</span>
        </div>,
        document.body,
      )}
    </>
  );
}
