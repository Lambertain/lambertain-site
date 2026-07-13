"use client";

import { useState, useTransition } from "react";
import { createEmployeeInvite, removeEmployee } from "./crew-actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

type Proj = { key: string; name: string };
export type CrewMember = { login: string; fullName: string; projectKeys: string[]; joinedAt: string | null };

const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };

/** Форма создания ссылки-приглашения сотрудника (роль фиксирована на сервере). */
function InviteBox({ projects, locale }: { projects: Proj[]; locale: Locale }) {
  const multi = projects.length > 1;
  const [selected, setSelected] = useState<string[]>(projects.map((p) => p.key)); // по умолчанию все мои проекты
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function toggle(key: string) {
    setLink(null);
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }
  function gen() {
    setError(null); setLink(null); setCopied(false);
    start(async () => {
      const res = await createEmployeeInvite(selected);
      if (res.error) setError(res.error === "no-project" ? t(locale, "crew.noProject") : res.error);
      else setLink(res.link ?? null);
    });
  }
  const noProject = multi && selected.length === 0;

  return (
    <div style={{ ...ui.card, marginTop: 16, maxWidth: 560 }}>
      {multi && (
        <div style={{ marginBottom: 14 }}>
          <label style={ui.fieldLabel}>
            {t(locale, "field.project")}
            <span style={{ textTransform: "none", color: "var(--muted)" }}> · {t(locale, "invite.projectsHint")}</span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6, border: "1px solid var(--border-2)", padding: 6 }}>
            {projects.map((p) => {
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
        </div>
      )}

      <button onClick={gen} disabled={pending || noProject} style={{ ...ui.btnAccent, opacity: pending || noProject ? 0.5 : 1 }}>
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

function MemberCard({ member, locale }: { member: CrewMember; locale: Locale }) {
  const [confirm, setConfirm] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [pending, start] = useTransition();
  if (removed) return null;

  const isRaw = /^tg\d+$/.test(member.login);
  return (
    <div style={{ ...ui.card, marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{member.fullName}</span>
      {isRaw ? (
        <span style={ui.monoLabel}>@{member.login}</span>
      ) : (
        <span role="link" title="Telegram" onClick={() => window.open(`https://t.me/${member.login}`, "_blank", "noopener")} style={{ ...ui.monoLabel, color: "var(--accent)", textDecoration: "underline", cursor: "pointer" }}>@{member.login}</span>
      )}
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {member.joinedAt && <span style={{ ...ui.monoLabel, textTransform: "none" }}>{new Date(member.joinedAt).toLocaleDateString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>}
        {confirm ? (
          <>
            <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{t(locale, "crew.removeConfirm")}</span>
            <button onClick={() => start(async () => { const r = await removeEmployee(member.login); if (!r.error) setRemoved(true); })} disabled={pending} style={{ ...ui.monoLabel, color: "#fff", background: "#ff5b5b", border: "none", padding: "6px 12px", cursor: "pointer", borderRadius: 2, opacity: pending ? 0.5 : 1 }}>{pending ? "…" : t(locale, "crew.removeYes")}</button>
            <button onClick={() => setConfirm(false)} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px solid var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "common.cancel")}</button>
          </>
        ) : (
          <button onClick={() => setConfirm(true)} style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>{t(locale, "crew.remove")}</button>
        )}
      </span>
    </div>
  );
}

export function CrewPanel({ projects, employees, locale }: { projects: Proj[]; employees: CrewMember[]; locale: Locale }) {
  return (
    <div>
      <div style={{ marginTop: 24 }}>
        <div style={ui.monoLabel}>{t(locale, "crew.kicker")}</div>
        <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>{t(locale, "crew.inviteTitle")}</h2>
        <InviteBox projects={projects} locale={locale} />
      </div>

      <div style={{ marginTop: 28 }}>
        <h2 style={{ ...ui.h1, fontSize: 22 }}>{t(locale, "crew.membersTitle")} · {employees.length}</h2>
        {employees.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10 }}>{t(locale, "crew.empty")}</p>
        ) : (
          employees.map((m) => <MemberCard key={m.login} member={m} locale={locale} />)
        )}
      </div>
    </div>
  );
}
