"use client";

import { useState } from "react";
import { ChatIntake } from "./chat-intake";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

type Proj = { key: string; name: string };

export function ChatModal({ projects, locale, isContributor, isAdmin, feedbackKey, role }: {
  projects: Proj[]; locale: Locale; isContributor?: boolean; isAdmin?: boolean; feedbackKey?: string; role?: string;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);   // выбран в picker
  const [confirmed, setConfirmed] = useState(false);            // перешёл к форме

  const single = projects.length === 1;
  function close() { setOpen(false); setChosen(null); setConfirmed(false); }
  const formProject = single ? projects[0]?.key : chosen;

  // Подпись по роли пользователя в выбранном проекте.
  function roleHint(key: string): string {
    if (key === feedbackKey) return t(locale, "pick.feedback");
    if (role === "client") return t(locale, "pick.client");
    if (role === "employee") return t(locale, "pick.employee");
    if (role === "contributor") return t(locale, "pick.contributor");
    return t(locale, "pick.admin");
  }

  const showForm = confirmed || single;

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
              {showForm && !single && (
                <button onClick={() => setConfirmed(false)} title={t(locale, "newtask.pickProject")} style={{ display: "flex", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: 6, cursor: "pointer", borderRadius: 2 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
              )}
              <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "newtask.title")}</span>
            </span>
            <button onClick={close} aria-label="close" style={{ display: "flex", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: 7, cursor: "pointer", borderRadius: 2 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {!showForm ? (
            <div style={{ padding: "22px 16px", overflowY: "auto" }}>
              <div style={{ ...ui.monoLabel, marginBottom: 16 }}>{t(locale, "newtask.pickProject")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, maxWidth: 760 }}>
                {projects.map((p) => {
                  const on = chosen === p.key;
                  return (
                    <button key={p.key} onClick={() => setChosen(p.key)}
                      style={{ position: "relative", padding: "14px 14px", textAlign: "left", cursor: "pointer", borderRadius: 4, fontSize: 14, fontWeight: 600,
                        border: "1px solid " + (on ? "var(--accent)" : "var(--border-2)"),
                        background: on ? "var(--accent)" : "var(--surface)", color: on ? "#000" : "var(--text)" }}>
                      {p.name}
                      <span style={{ position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: "50%", background: on ? "#000" : "var(--accent)" }} />
                    </button>
                  );
                })}
              </div>

              {chosen && (
                <div style={{ marginTop: 20, maxWidth: 600 }}>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text)" }}>{roleHint(chosen)}</p>
                  <button onClick={() => setConfirmed(true)} style={{ ...ui.btnAccent, marginTop: 12 }}>{t(locale, "pick.cta")}</button>
                </div>
              )}
            </div>
          ) : (
            <ChatIntake projects={projects} locale={locale} fill isContributor={isContributor} isAdmin={isAdmin} feedbackKey={feedbackKey} lockedProject={formProject ?? undefined} />
          )}
        </div>
      )}
    </>
  );
}
