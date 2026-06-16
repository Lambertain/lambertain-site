"use client";

import { useState } from "react";
import { ChatIntake } from "./chat-intake";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

type Proj = { key: string; name: string };

export function ChatModal({ projects, locale, isContributor, isAdmin, feedbackKey }: { projects: Proj[]; locale: Locale; isContributor?: boolean; isAdmin?: boolean; feedbackKey?: string }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  // Больше 2 проектов — сначала явный выбор проекта, потом форма (без селекта), чтобы задача не ушла не в тот проект.
  const needPick = projects.length > 2;

  function close() { setOpen(false); setChosen(null); }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ ...ui.btnAccent, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        {t(locale, "newtask.title")}
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {needPick && chosen && (
                <button onClick={() => setChosen(null)} title={t(locale, "newtask.pickProject")} style={{ display: "flex", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: 6, cursor: "pointer", borderRadius: 2 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
              )}
              <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "newtask.title")}</span>
            </span>
            <button onClick={close} aria-label="close" style={{ display: "flex", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: 7, cursor: "pointer", borderRadius: 2 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {needPick && !chosen ? (
            <div style={{ padding: "20px 16px", overflowY: "auto" }}>
              <div style={{ ...ui.monoLabel, marginBottom: 14 }}>{t(locale, "newtask.pickProject")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 520 }}>
                {projects.map((p) => (
                  <button key={p.key} onClick={() => setChosen(p.key)} style={{ ...ui.card, padding: "14px 16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text)", fontSize: 15, fontWeight: 600 }}>
                    {p.name}
                    <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{p.key}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ChatIntake projects={projects} locale={locale} fill isContributor={isContributor} isAdmin={isAdmin} feedbackKey={feedbackKey} lockedProject={needPick ? chosen! : undefined} />
          )}
        </div>
      )}
    </>
  );
}
