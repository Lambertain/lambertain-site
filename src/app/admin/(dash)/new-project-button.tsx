"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProjectQuick } from "./team/actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

/** Кнопка «+ Проект» на дашборде (админ/супер-админ): создать проект и сразу перейти в его редактор. */
export function NewProjectButton({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function close() { setOpen(false); setName(""); setError(null); }

  function create() {
    if (!name.trim()) { setError(t(locale, "newproject.nameRequired")); return; }
    setError(null);
    start(async () => {
      const res = await createProjectQuick(name.trim());
      if (res.error) setError(res.error);
      else if (res.key) { setName(""); setOpen(false); router.push(`/admin/projects/${res.key}`); }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ ...ui.btn, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        {t(locale, "newproject.title")}
      </button>

      {open && (
        <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "var(--surface)", border: "1px solid var(--border)", padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "newproject.heading")}</span>
              <button onClick={close} aria-label="close" style={{ display: "flex", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: 7, cursor: "pointer", borderRadius: 2 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !pending) create(); }}
              placeholder={t(locale, "newproject.namePh")}
              style={{ ...ui.input, width: "100%", padding: "12px 14px", fontSize: 15 }}
            />
            {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 10 }}>{error}</p>}
            <button onClick={create} disabled={pending} style={{ ...ui.btnAccent, marginTop: 16, width: "100%", opacity: pending ? 0.5 : 1 }}>
              {pending ? "…" : t(locale, "newproject.create")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
