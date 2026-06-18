"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { myNotifications, readTaskNotifications, readNotification, readAllNotifications } from "./notif-actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

export type Notif = { id: number; task_id: string | null; project_key: string | null; title: string; link: string | null; count: number; created_at: string };

function fmt(ts: string, locale: Locale): string {
  const d = new Date(ts);
  const loc = locale === "ru" ? "ru-RU" : locale === "en" ? "en-US" : "uk-UA";
  return d.toLocaleString(loc, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function relPath(n: Notif): string | null {
  if (n.task_id) return `/admin/tasks/${n.task_id}`;
  if (n.link) { try { return new URL(n.link).pathname; } catch { return n.link.startsWith("/") ? n.link : null; } }
  return null;
}

export function NotificationBell({ initial, projectNames, locale }: { initial: Notif[]; projectNames: Record<string, string>; locale: Locale }) {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>(initial);
  const [open, setOpen] = useState(false);

  async function openModal() {
    setOpen(true);
    try { setItems(await myNotifications()); } catch { /* keep */ }
  }
  async function click(n: Notif) {
    setItems((xs) => xs.filter((x) => x.id !== n.id));
    setOpen(false);
    try { if (n.task_id) await readTaskNotifications(n.task_id); else await readNotification(n.id); } catch { /* best-effort */ }
    const path = relPath(n);
    if (path) router.push(path);
  }
  async function readAll() {
    setItems([]);
    try { await readAllNotifications(); } catch { /* best-effort */ }
  }

  // Группировка попроектно → задачи (события).
  const groups = new Map<string, Notif[]>();
  for (const n of items) {
    const k = n.project_key || "—";
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(n);
  }
  const count = items.length;

  return (
    <>
      <button
        onClick={openModal}
        title={t(locale, "notif.title")}
        aria-label={t(locale, "notif.title")}
        style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border-2)", color: count ? "var(--accent)" : "var(--muted)", padding: 7, cursor: "pointer", borderRadius: 2 }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        {count > 0 && (
          <span style={{ position: "absolute", top: -7, right: -7, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 9, background: "var(--accent)", color: "#000", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--bg)" }}>{count > 99 ? "99+" : count}</span>
        )}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(420px, 100%)", height: "100%", background: "var(--surface)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", boxShadow: "-8px 0 24px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ ...ui.h1, fontSize: 18 }}>{t(locale, "notif.title")}</span>
              <span style={{ ...ui.monoLabel, color: "var(--muted)" }}>{count}</span>
              {count > 0 && <button onClick={readAll} style={{ ...ui.monoLabel, marginLeft: "auto", color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "4px 10px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "notif.readAll")}</button>}
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0, marginLeft: count > 0 ? 0 : "auto" }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px 18px" }}>
              {count === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 16, textAlign: "center" }}>{t(locale, "notif.empty")}</p>
              ) : (
                [...groups.entries()].map(([pk, ns]) => (
                  <div key={pk} style={{ marginTop: 14 }}>
                    <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>{projectNames[pk] || pk}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {ns.map((n) => (
                        <button key={n.id} onClick={() => click(n)} style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 4, padding: 12, background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 6, cursor: "pointer", color: "var(--text)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {n.task_id && <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{n.task_id}</span>}
                            {n.count > 1 && <span style={{ ...ui.monoLabel, color: "#000", background: "var(--accent)", padding: "0 6px", borderRadius: 3, fontWeight: 700 }}>{n.count}</span>}
                            <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginLeft: "auto" }}>{fmt(n.created_at, locale)}</span>
                          </div>
                          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{n.title}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
