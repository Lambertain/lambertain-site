"use client";

import { useState } from "react";
import { Markdown } from "./markdown";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

type G = { id: number; title: string; body: string };

/** «Подготовка» у клиента: включённые проекту гайды-инструкции (аккордеоны с markdown). */
export function ClientGuides({ guides, locale }: { guides: G[]; locale: Locale }) {
  const [open, setOpen] = useState<number | null>(guides.length === 1 ? guides[0].id : null);
  if (!guides.length) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={ui.monoLabel}>{t(locale, "guides.prep")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {guides.map((g) => (
          <div key={g.id} style={{ ...ui.card, padding: 0, overflow: "hidden" }}>
            <button onClick={() => setOpen((o) => (o === g.id ? null : g.id))} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", textAlign: "left", fontSize: 15, fontWeight: 600 }}>
              {g.title}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ transform: open === g.id ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {open === g.id && (
              <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border)" }}>
                <div style={{ marginTop: 12 }}><Markdown>{g.body}</Markdown></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
