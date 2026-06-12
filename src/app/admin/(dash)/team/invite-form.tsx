"use client";

import { useMemo, useState, useTransition } from "react";
import { createInviteLink, createProjectQuick } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Proj = { key: string; name: string };

export function InviteForm({ projects, locale }: { projects: Proj[]; locale: Locale }) {
  const [role, setRole] = useState<"contributor" | "client" | "employee" | "admin">("contributor");
  const [list, setList] = useState<Proj[]>(projects);
  const [selected, setSelected] = useState<string[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [pending, start] = useTransition();

  // новый проект
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, startAdd] = useTransition();
  const [addErr, setAddErr] = useState<string | null>(null);

  const sorted = useMemo(() => [...list].sort((a, b) => a.name.localeCompare(b.name)), [list]);
  const multi = role === "contributor" || role === "employee"; // разраб/сотрудник — несколько; клиент — один
  const needsProject = role === "client" || role === "employee";

  function changeRole(r: typeof role) {
    setLink(null);
    setRole(r);
    // клиент — максимум один проект; админ — без проектов
    if (r === "client") setSelected((cur) => cur.slice(0, 1));
    if (r === "admin") setSelected([]);
  }

  function toggle(key: string) {
    setLink(null);
    if (!multi) { setSelected((cur) => (cur.includes(key) ? [] : [key])); return; }
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  function addProject() {
    setAddErr(null);
    startAdd(async () => {
      const r = await createProjectQuick(newKey, newName);
      if (r.error) { setAddErr(r.error); return; }
      if (r.key && r.name && !list.some((p) => p.key === r.key)) {
        setList((cur) => [...cur, { key: r.key!, name: r.name! }]);
      }
      if (r.key) setSelected((cur) => (cur.includes(r.key!) ? cur : [...cur, r.key!]));
      setNewKey(""); setNewName("");
    });
  }

  function gen() {
    setError(null); setLink(null); setCopied(false);
    start(async () => {
      const res = await createInviteLink(role, selected, showOnboarding);
      if (res.error) setError(res.error);
      else setLink(res.link ?? null);
    });
  }

  const needProject = needsProject && selected.length === 0;

  return (
    <div style={{ ...ui.card, marginTop: 20, maxWidth: 560 }}>
      <div>
        <label style={ui.fieldLabel}>{t(locale, "field.role")}</label>
        <select value={role} onChange={(e) => changeRole(e.target.value as typeof role)} style={{ ...ui.input, maxWidth: 260 }}>
          <option value="contributor">{t(locale, "role.contributor")}</option>
          <option value="client">{t(locale, "role.client")}</option>
          <option value="employee">{t(locale, "role.employee")}</option>
          <option value="admin">{t(locale, "role.admin")}</option>
        </select>
        {role === "admin" && <p style={{ ...ui.monoLabel, textTransform: "none", color: "#e8b339", marginTop: 6 }}>{t(locale, "invite.adminWarn")}</p>}
      </div>

      {/* проекты — чекбоксы, алфавит (для админа не нужны) */}
      {role !== "admin" && (
      <>
      <div style={{ marginTop: 16 }}>
        <label style={ui.fieldLabel}>
          {t(locale, "field.project")}
          {multi && <span style={{ textTransform: "none", color: "var(--muted)" }}> · {t(locale, "invite.projectsHint")}</span>}
        </label>
        {sorted.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>{t(locale, "deps.none")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6, maxHeight: 240, overflowY: "auto", border: "1px solid var(--border-2)", padding: 6 }}>
            {sorted.map((p) => {
              const on = selected.includes(p.key);
              return (
                <button key={p.key} onClick={() => toggle(p.key)} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "7px 8px", background: on ? "var(--surface-2)" : "transparent", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 14 }}>
                  <span style={{ width: 15, height: 15, flexShrink: 0, border: `1px solid ${on ? "var(--accent)" : "var(--border-2)"}`, background: on ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </span>
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* новый проект прямо здесь */}
      <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <label style={ui.fieldLabel}>{t(locale, "invite.newProject")}</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder={t(locale, "projects.key")} style={{ ...ui.input, width: 120, textTransform: "uppercase" }} />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t(locale, "projects.name")} style={{ ...ui.input, flex: 1, minWidth: 160 }} />
          <button onClick={addProject} disabled={adding || !newKey.trim() || !newName.trim()} style={{ ...ui.btn, opacity: adding || !newKey.trim() || !newName.trim() ? 0.5 : 1 }}>
            {adding ? "…" : t(locale, "projects.add")}
          </button>
        </div>
        {addErr && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{addErr}</p>}
      </div>
      </>
      )}

      {/* Клиенту — опция показать онбординг-инструкцию при входе */}
      {role === "client" && (
        <button
          onClick={() => setShowOnboarding((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 14, padding: 0 }}
        >
          <span style={{ width: 15, height: 15, flexShrink: 0, border: `1px solid ${showOnboarding ? "var(--accent)" : "var(--border-2)"}`, background: showOnboarding ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {showOnboarding && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
          </span>
          <span>{t(locale, "invite.showOnboarding")}</span>
        </button>
      )}

      <button onClick={gen} disabled={pending || needProject} style={{ ...ui.btnAccent, marginTop: 16, opacity: pending || needProject ? 0.5 : 1 }}>
        {pending ? t(locale, "common.generating") : t(locale, "team.createInvite")}
      </button>

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 12 }}>{error}</p>}

      {link && (
        <div style={{ marginTop: 16 }}>
          <label style={ui.fieldLabel}>{t(locale, "team.linkLabel")}</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input readOnly value={link} style={{ ...ui.input, fontFamily: "var(--font-mono)", fontSize: 12 }} />
            <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); }} style={ui.btn}>
              {copied ? t(locale, "common.copied") : t(locale, "common.copy")}
            </button>
          </div>
          <p style={{ ...ui.monoLabel, textTransform: "none", marginTop: 8 }}>{t(locale, "team.linkHint")}</p>
        </div>
      )}
    </div>
  );
}
