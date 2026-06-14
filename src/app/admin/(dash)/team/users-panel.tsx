"use client";

import { useState, useTransition } from "react";
import { saveUserProjects, renameUser, deleteUser } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Proj = { key: string; name: string };
export type PanelUser = {
  login: string;
  fullName: string;
  alias: string | null;
  role: string;
  projectKeys: string[];
  joinedAt: string | null;
};

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };

function Card({ user, projects, locale }: { user: PanelUser; projects: Proj[]; locale: Locale }) {
  const single = user.role === "client"; // клиент — один проект; сотрудник/разраб — несколько
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<string[]>(user.projectKeys);
  const [alias, setAlias] = useState(user.alias ?? "");
  const [savedP, setSavedP] = useState(false);
  const [savedN, setSavedN] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [pendP, startP] = useTransition();
  const [pendN, startN] = useTransition();
  const [pendD, startD] = useTransition();

  function removeUser() {
    startD(async () => { const r = await deleteUser(user.login); if (!r.error) setDeleted(true); });
  }

  const display = user.alias || user.fullName;
  const projName = (k: string) => projects.find((p) => p.key === k)?.name || k;
  const dirtyKeys = keys.slice().sort().join(",") !== user.projectKeys.slice().sort().join(",");
  const dirtyName = alias.trim() !== (user.alias ?? "");

  function toggle(key: string) {
    setSavedP(false);
    if (single) { setKeys((c) => (c.includes(key) ? [] : [key])); return; }
    setKeys((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  }
  function saveProjects() {
    startP(async () => { const r = await saveUserProjects(user.login, keys); if (!r.error) setSavedP(true); });
  }
  function saveName() {
    startN(async () => { const r = await renameUser(user.login, alias); if (!r.error) setSavedN(true); });
  }

  if (deleted) return null;

  return (
    <div style={{ ...ui.card, padding: 0, marginTop: 10, overflow: "hidden" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 14, background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", textAlign: "left" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", width: "100%" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{display}</span>
          {/^tg\d+$/.test(user.login) ? (
            <span style={ui.monoLabel}>@{user.login}</span>
          ) : (
            <span
              role="link"
              title="Відкрити в Telegram"
              onClick={(e) => { e.stopPropagation(); window.open(`https://t.me/${user.login}`, "_blank", "noopener"); }}
              style={{ ...ui.monoLabel, color: "var(--accent)", textDecoration: "underline", cursor: "pointer" }}
            >
              @{user.login}
            </span>
          )}
          <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, `role.${user.role}`)}</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {user.joinedAt && <span style={{ ...ui.monoLabel, textTransform: "none" }}>{new Date(user.joinedAt).toLocaleDateString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9" /></svg>
          </span>
        </span>
        {user.projectKeys.length > 0 && (
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {user.projectKeys.map((k) => (
              <span key={k} style={{ ...ui.monoLabel, textTransform: "none", padding: "2px 8px", border: "1px solid var(--border-2)", background: "var(--surface-2)", borderRadius: 3 }}>{projName(k)}</span>
            ))}
          </span>
        )}
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border)" }}>
          {/* имя */}
          <label style={{ ...ui.fieldLabel, marginTop: 14 }}>{t(locale, "users.alias")}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={alias} onChange={(e) => { setAlias(e.target.value); setSavedN(false); }} placeholder={user.fullName} style={{ ...ui.input, flex: 1, minWidth: 180 }} />
            <button onClick={saveName} disabled={pendN || !dirtyName} style={{ ...ui.btn, opacity: pendN || !dirtyName ? 0.5 : 1 }}>{pendN ? "…" : t(locale, "projects.save")}</button>
            {savedN && !dirtyName && <span style={{ ...ui.monoLabel, color: "var(--accent)", alignSelf: "center" }}>✓</span>}
          </div>

          {/* проекты */}
          <label style={{ ...ui.fieldLabel, marginTop: 14 }}>
            {t(locale, "field.project")}
            {!single && <span style={{ textTransform: "none", color: "var(--muted)" }}> · {t(locale, "invite.projectsHint")}</span>}
          </label>
          {projects.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>{t(locale, "deps.none")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, border: "1px solid var(--border-2)", padding: 6, maxHeight: 220, overflowY: "auto" }}>
              {projects.map((p) => {
                const on = keys.includes(p.key);
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
          {(dirtyKeys || savedP) && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <button onClick={saveProjects} disabled={pendP || !dirtyKeys} style={{ ...ui.btnAccent, opacity: pendP || !dirtyKeys ? 0.5 : 1 }}>{pendP ? "…" : t(locale, "team.saveProjects")}</button>
              {savedP && !dirtyKeys && <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, "projects.saved")}</span>}
            </div>
          )}

          {/* удаление пользователя (с подтверждением) */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {confirmDel ? (
              <>
                <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{t(locale, "users.deleteConfirm")}</span>
                <button onClick={removeUser} disabled={pendD} style={{ ...ui.monoLabel, color: "#fff", background: "#ff5b5b", border: "none", padding: "6px 12px", cursor: "pointer", borderRadius: 2, opacity: pendD ? 0.5 : 1 }}>{pendD ? "…" : t(locale, "users.deleteYes")}</button>
                <button onClick={() => setConfirmDel(false)} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "common.cancel")}</button>
              </>
            ) : (
              <button onClick={() => setConfirmDel(true)} style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "users.delete")}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const ROLE_ORDER = ["admin", "contributor", "employee", "client"];

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ ...ui.monoLabel, padding: "5px 11px", borderRadius: 2, cursor: "pointer", whiteSpace: "nowrap", border: "1px solid " + (active ? "var(--accent)" : "var(--border-2)"), background: active ? "var(--accent)" : "transparent", color: active ? "#000" : "var(--muted)" }}>
      {children}
    </button>
  );
}

export function UsersPanel({ users, projects, locale }: { users: PanelUser[]; projects: Proj[]; locale: Locale }) {
  const [roleF, setRoleF] = useState("all");
  const [projF, setProjF] = useState("all");
  const roles = ROLE_ORDER.filter((r) => users.some((u) => u.role === r));
  const filtered = users.filter(
    (u) => (roleF === "all" || u.role === roleF) && (projF === "all" || u.projectKeys.includes(projF)),
  );

  return (
    <div style={{ marginTop: 28 }}>
      <div style={ui.monoLabel}>{t(locale, "users.kicker")}</div>
      <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>
        {t(locale, "users.title")} · {filtered.length}
        {filtered.length !== users.length && <span style={{ color: "var(--muted)" }}> / {users.length}</span>}
      </h2>

      {/* фильтры: роли (пилюли) + проект (селект) */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Pill active={roleF === "all"} onClick={() => setRoleF("all")}>{t(locale, "users.allRoles")}</Pill>
          {roles.map((r) => (
            <Pill key={r} active={roleF === r} onClick={() => setRoleF(r)}>
              {t(locale, `role.${r}`)} · {users.filter((u) => u.role === r).length}
            </Pill>
          ))}
        </div>
        {projects.length > 0 && (
          <select value={projF} onChange={(e) => setProjF(e.target.value)} style={{ ...ui.input, width: "auto", padding: "6px 10px" }}>
            <option value="all">{t(locale, "users.allProjects")}</option>
            {projects.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {users.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10 }}>{t(locale, "users.empty")}</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10 }}>{t(locale, "users.noneMatch")}</p>
      ) : (
        filtered.map((u) => <Card key={u.login} user={u} projects={projects} locale={locale} />)
      )}
    </div>
  );
}
