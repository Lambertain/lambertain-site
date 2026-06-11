"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>{title}</div>
      <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 6, whiteSpace: "pre-wrap" }}>{body}</p>
    </div>
  );
}

export function DevHelp({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t(locale, "help.label")}
        aria-label={t(locale, "help.label")}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", cursor: "pointer", flexShrink: 0 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.65)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...ui.card, maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ ...ui.h1, fontSize: 22, margin: 0 }}>{t(locale, "help.title")}</h2>
              <button onClick={() => setOpen(false)} aria-label="close" style={{ display: "flex", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: 7, cursor: "pointer", borderRadius: 2 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <Section title={t(locale, "help.startT")} body={t(locale, "help.startB")} />
            <Section title={t(locale, "help.optionsT")} body={t(locale, "help.optionsB")} />
            <Section title={t(locale, "help.answeredT")} body={t(locale, "help.answeredB")} />
            <Section title={t(locale, "help.phrasesT")} body={t(locale, "help.phrasesB")} />

            <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 18 }}>{t(locale, "help.note")}</p>
          </div>
        </div>
      )}
    </>
  );
}
