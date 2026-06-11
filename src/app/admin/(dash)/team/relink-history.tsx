"use client";

import { useState, useTransition } from "react";
import { relinkHistory } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Orphan = { login: string; role: string | null; comments: number; assigneeTasks: number; reporterTasks: number };
type Member = { login: string; fullName: string };

function OrphanRow({ orphan, members, locale }: { orphan: Orphan; members: Member[]; locale: Locale }) {
  const [target, setTarget] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;

  function bind() {
    if (!target) return;
    start(async () => {
      const r = await relinkHistory(orphan.login, target);
      if (!r.error) {
        setDone(t(locale, "relink.done", { c: String(r.comments ?? 0), tk: String(r.tasks ?? 0) }));
        setTimeout(() => setHidden(true), 2500);
      }
    });
  }

  return (
    <div style={{ ...ui.card, padding: 14, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...ui.monoLabel, color: "#e8b339" }}>{orphan.login}</span>
        {orphan.role && <span style={ui.monoLabel}>{t(locale, `role.${orphan.role}`)}</span>}
        <span style={{ ...ui.monoLabel, textTransform: "none" }}>
          {t(locale, "relink.counts", { c: String(orphan.comments), tk: String(orphan.assigneeTasks + orphan.reporterTasks) })}
        </span>
      </div>
      {done ? (
        <p style={{ ...ui.monoLabel, color: "var(--accent)", textTransform: "none", marginTop: 10 }}>{done}</p>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...ui.input, width: "auto", flex: 1, minWidth: 180, padding: "8px 10px" }}>
            <option value="">{t(locale, "common.choose")}</option>
            {members.map((m) => (
              <option key={m.login} value={m.login}>{m.fullName} ({m.login})</option>
            ))}
          </select>
          <button onClick={bind} disabled={pending || !target} style={{ ...ui.btnAccent, opacity: pending || !target ? 0.5 : 1 }}>
            {pending ? "…" : t(locale, "relink.bind")}
          </button>
        </div>
      )}
    </div>
  );
}

export function RelinkHistory({ orphans, members, locale }: { orphans: Orphan[]; members: Member[]; locale: Locale }) {
  if (!orphans.length) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={ui.monoLabel}>{t(locale, "relink.kicker")}</div>
      <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>{t(locale, "relink.title")}</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10, maxWidth: 560 }}>{t(locale, "relink.hint")}</p>
      {orphans.map((o) => (
        <OrphanRow key={o.login} orphan={o} members={members} locale={locale} />
      ))}
    </div>
  );
}
