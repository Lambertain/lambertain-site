"use client";

import { useState, useTransition } from "react";
import { saveUserProjects, deleteUser, createInviteLink } from "../../team/actions";
import type { PanelUser } from "../../team/users-panel";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };

function UserRow({ user, projectKey, locale }: { user: PanelUser; projectKey: string; locale: Locale }) {
  const [gone, setGone] = useState(false);
  const [confirm, setConfirm] = useState<null | "project" | "delete">(null);
  const [pend, start] = useTransition();

  const display = user.alias || user.fullName;
  const isTgId = /^tg\d+$/.test(user.login);

  function removeFromProject() {
    // Убираем только этот проект из набора (клиент → проектов не остаётся; сотрудник/разраб → остальные сохраняются).
    const keys = user.projectKeys.filter((k) => k !== projectKey);
    start(async () => { const r = await saveUserProjects(user.login, keys); if (!r.error) setGone(true); });
  }
  function removeUser() {
    start(async () => { const r = await deleteUser(user.login); if (!r.error) setGone(true); });
  }

  if (gone) return null;

  return (
    <div style={{ ...ui.card, padding: 12, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{display}</span>
        {isTgId ? (
          <span style={ui.monoLabel}>@{user.login}</span>
        ) : (
          <span role="link" title="Telegram" onClick={() => window.open(`https://t.me/${user.login}`, "_blank", "noopener")} style={{ ...ui.monoLabel, color: "var(--accent)", textDecoration: "underline", cursor: "pointer" }}>@{user.login}</span>
        )}
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{t(locale, `role.${user.role}`)}</span>
        {user.joinedAt && <span style={{ ...ui.monoLabel, textTransform: "none", marginLeft: "auto" }}>{new Date(user.joinedAt).toLocaleDateString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        {confirm === "project" ? (
          <>
            <span style={{ ...ui.monoLabel, textTransform: "none", color: "#e8b339" }}>{t(locale, "projUsers.removeConfirm")}</span>
            <button onClick={removeFromProject} disabled={pend} style={{ ...ui.monoLabel, color: "#000", background: "#e8b339", border: "none", padding: "6px 12px", cursor: "pointer", borderRadius: 2, opacity: pend ? 0.5 : 1 }}>{pend ? "…" : t(locale, "users.deleteYes")}</button>
            <button onClick={() => setConfirm(null)} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "common.cancel")}</button>
          </>
        ) : confirm === "delete" ? (
          <>
            <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{t(locale, "users.deleteConfirm")}</span>
            <button onClick={removeUser} disabled={pend} style={{ ...ui.monoLabel, color: "#fff", background: "#ff5b5b", border: "none", padding: "6px 12px", cursor: "pointer", borderRadius: 2, opacity: pend ? 0.5 : 1 }}>{pend ? "…" : t(locale, "users.deleteYes")}</button>
            <button onClick={() => setConfirm(null)} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "common.cancel")}</button>
          </>
        ) : (
          <>
            <button onClick={() => setConfirm("project")} style={{ ...ui.monoLabel, color: "#e8b339", background: "transparent", border: "1px solid #e8b339", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "projUsers.removeFromProject")}</button>
            <button onClick={() => setConfirm("delete")} style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "users.delete")}</button>
          </>
        )}
      </div>
    </div>
  );
}

export function ProjectUsersPanel({
  projectKey, users, candidates, locale,
}: { projectKey: string; users: PanelUser[]; candidates: PanelUser[]; locale: Locale }) {
  const [addLogin, setAddLogin] = useState("");
  const [pendAdd, startAdd] = useTransition();
  const [role, setRole] = useState<"client" | "employee" | "contributor">("employee");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendInv, startInv] = useTransition();

  function addExisting() {
    if (!addLogin) return;
    const u = candidates.find((c) => c.login === addLogin);
    if (!u) return;
    // Клиент — один проект (заменяем); сотрудник/разработчик — добавляем к существующим.
    const keys = u.role === "client" ? [projectKey] : Array.from(new Set([...u.projectKeys, projectKey]));
    startAdd(async () => { const r = await saveUserProjects(addLogin, keys); if (!r.error) { setAddLogin(""); location.reload(); } });
  }
  function invite() {
    setErr(null); setLink(null); setCopied(false);
    startInv(async () => {
      const r = await createInviteLink(role, [projectKey], role === "client");
      if (r.error) setErr(r.error); else setLink(r.link ?? null);
    });
  }

  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={ui.monoLabel}>{t(locale, "projUsers.kicker")}</div>
      <h2 style={{ ...ui.h1, fontSize: 20, marginTop: 6 }}>{t(locale, "projUsers.title")} · {users.length}</h2>

      {users.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10 }}>{t(locale, "projUsers.empty")}</p>
      ) : (
        users.map((u) => <UserRow key={u.login} user={u} projectKey={projectKey} locale={locale} />)
      )}

      {/* Добавить уже присоединившегося пользователя в этот проект */}
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
        <label style={ui.fieldLabel}>{t(locale, "projUsers.addExisting")}</label>
        {candidates.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>{t(locale, "projUsers.addExistingNone")}</p>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={addLogin} onChange={(e) => setAddLogin(e.target.value)} style={{ ...ui.input, flex: 1, minWidth: 200 }}>
              <option value="">—</option>
              {candidates.map((c) => (
                <option key={c.login} value={c.login}>{(c.alias || c.fullName)} · @{c.login} · {t(locale, `role.${c.role}`)}</option>
              ))}
            </select>
            <button onClick={addExisting} disabled={pendAdd || !addLogin} style={{ ...ui.btn, opacity: pendAdd || !addLogin ? 0.5 : 1 }}>{pendAdd ? "…" : t(locale, "projUsers.add")}</button>
          </div>
        )}
      </div>

      {/* Пригласить нового по ссылке (сразу в этот проект) */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
        <label style={ui.fieldLabel}>{t(locale, "projUsers.inviteNew")}</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={role} onChange={(e) => { setRole(e.target.value as typeof role); setLink(null); }} style={{ ...ui.input, maxWidth: 220 }}>
            <option value="employee">{t(locale, "role.employee")}</option>
            <option value="client">{t(locale, "role.client")}</option>
            <option value="contributor">{t(locale, "role.contributor")}</option>
          </select>
          <button onClick={invite} disabled={pendInv} style={{ ...ui.btnAccent, opacity: pendInv ? 0.5 : 1 }}>{pendInv ? t(locale, "common.generating") : t(locale, "team.createInvite")}</button>
        </div>
        {err && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 10 }}>{err}</p>}
        {link && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <input readOnly value={link} style={{ ...ui.input, fontFamily: "var(--font-mono)", fontSize: 12 }} />
              <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); }} style={ui.btn}>{copied ? t(locale, "common.copied") : t(locale, "common.copy")}</button>
            </div>
            <p style={{ ...ui.monoLabel, textTransform: "none", marginTop: 8 }}>{t(locale, "team.linkHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
