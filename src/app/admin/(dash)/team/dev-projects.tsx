"use client";

import { useState, useTransition } from "react";
import { saveDevProjects } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Dev = { login: string; fullName: string; projectKeys: string[] };
type Proj = { key: string; name: string };

function DevRow({ dev, projects, locale }: { dev: Dev; projects: Proj[]; locale: Locale }) {
  const [keys, setKeys] = useState<string[]>(dev.projectKeys);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = keys.slice().sort().join(",") !== dev.projectKeys.slice().sort().join(",");

  function toggle(key: string) {
    setSaved(false);
    setKeys((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }
  function save() {
    start(async () => {
      const r = await saveDevProjects(dev.login, keys);
      if (!r.error) setSaved(true);
    });
  }

  return (
    <div style={{ ...ui.card, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>{dev.fullName}</strong>
        <span style={{ ...ui.monoLabel }}>{dev.login}</span>
        {keys.length === 0 && <span style={{ ...ui.monoLabel, color: "#e8b339" }}>{t(locale, "team.noProjects")}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {projects.map((p) => {
          const on = keys.includes(p.key);
          return (
            <button
              key={p.key}
              onClick={() => toggle(p.key)}
              style={{
                ...ui.monoLabel,
                textTransform: "none",
                padding: "6px 10px",
                background: on ? "var(--accent)" : "transparent",
                color: on ? "#000" : "var(--muted)",
                border: `1px solid ${on ? "var(--accent)" : "var(--border-2)"}`,
                cursor: "pointer",
              }}
            >
              {p.name}
            </button>
          );
        })}
      </div>
      {(dirty || saved) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <button onClick={save} disabled={pending || !dirty} style={{ ...ui.btnAccent, opacity: pending || !dirty ? 0.5 : 1 }}>
            {pending ? "…" : t(locale, "team.saveProjects")}
          </button>
          {saved && !dirty && <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "projects.saved")}</span>}
        </div>
      )}
    </div>
  );
}

export function DevProjects({ devs, projects, locale }: { devs: Dev[]; projects: Proj[]; locale: Locale }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={ui.monoLabel}>{t(locale, "team.devsKicker")}</div>
      <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>{t(locale, "team.devsTitle")}</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10, maxWidth: 560 }}>{t(locale, "team.devsHint")}</p>
      {devs.map((d) => (
        <DevRow key={d.login} dev={d} projects={projects} locale={locale} />
      ))}
    </div>
  );
}
