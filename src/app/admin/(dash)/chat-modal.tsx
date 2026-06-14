"use client";

import { useState } from "react";
import { ChatIntake } from "./chat-intake";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

type Proj = { key: string; name: string };

export function ChatModal({ projects, locale, isContributor, isAdmin, feedbackKey }: { projects: Proj[]; locale: Locale; isContributor?: boolean; isAdmin?: boolean; feedbackKey?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ ...ui.btnAccent, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        {t(locale, "newtask.title")}
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "newtask.title")}</span>
            <button onClick={() => setOpen(false)} aria-label="close" style={{ display: "flex", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: 7, cursor: "pointer", borderRadius: 2 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <ChatIntake projects={projects} locale={locale} fill isContributor={isContributor} isAdmin={isAdmin} feedbackKey={feedbackKey} />
        </div>
      )}
    </>
  );
}
