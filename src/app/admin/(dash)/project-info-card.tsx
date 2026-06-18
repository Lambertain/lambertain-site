"use client";

import { useState, useTransition } from "react";
import { saveCredentials } from "./project-actions";
import type { ProjectMeta } from "@/lib/tasks/types";
import { fieldVisible } from "@/lib/field-visibility";
import { getFieldDef } from "@/lib/project-fields";
import { BUCKET_ORDER, BUCKET_LABEL, type Bucket } from "@/lib/statuses";
import { t, type Locale } from "@/lib/i18n";
import { Markdown } from "./markdown";
import { ui } from "../ui-styles";

type Cred = { role?: string; env?: string; login?: string; pass?: string };

const DAY = 86400000;

function ExtLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)", textDecoration: "none", fontSize: 14, wordBreak: "break-all" }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
      {label}
    </a>
  );
}

function Bar({ pct, label, danger }: { pct: number; label: string; danger?: boolean }) {
  const color = danger ? "#ff5b5b" : "var(--accent)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", ...ui.monoLabel, textTransform: "none", marginBottom: 4 }}>
        <span>{label}</span><span style={{ color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: "var(--surface-2)", border: "1px solid var(--border-2)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

/** Список аккаунтов входа (логин/пароль/примечание) в карточке. */
function AccountsView({ title, rows }: { title: string; rows: Array<{ login?: string; pass?: string; note?: string }> }) {
  return (
    <div>
      <div style={{ ...ui.monoLabel, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, padding: "6px 10px", border: "1px solid var(--border-2)", borderRadius: 3, background: "var(--surface-2)" }}>
            {c.login && <span style={{ fontFamily: "var(--font-mono)" }}>{c.login}</span>}
            {c.pass && <span style={{ fontFamily: "var(--font-mono)" }}>{c.pass}</span>}
            {c.note && <span style={{ color: "var(--muted)" }}>{c.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Кастомное поле из реестра в карточке: заголовок + значения подполей (url → ссылка). */
function CustomFieldView({ fieldKey, values, locale }: { fieldKey: string; values: Record<string, string> | undefined; locale: Locale }) {
  const def = getFieldDef(fieldKey);
  if (!def) return null;
  const rows = def.subs.map((s) => ({ label: s.label[locale], val: (values?.[s.key] ?? "").trim(), kind: s.kind })).filter((r) => r.val);
  if (!rows.length) return null;
  return (
    <div style={{ border: "1px solid var(--border-2)", borderRadius: 6, padding: 12, background: "var(--surface-2)" }}>
      <div style={{ ...ui.monoLabel, color: "var(--accent)", marginBottom: 6 }}>{def.label[locale]}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
            <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", minWidth: 90 }}>{r.label}</span>
            {r.kind === "url" ? <a href={r.val} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>{r.val}</a> : <span style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{r.val}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectInfoCard({
  project, canEdit, showDevLink, counts, newCount, now, locale,
}: {
  project: { key: string; name: string; meta: ProjectMeta };
  canEdit?: boolean;
  showDevLink?: boolean;
  counts?: Record<Bucket, number>;
  newCount?: number;
  now: number;
  locale: Locale;
}) {
  const m = project.meta;
  const [open, setOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [creds, setCreds] = useState<Cred[]>(m.credentials?.length ? m.credentials : []);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const startedMs = m.startedAt ? new Date(m.startedAt).getTime() : null;
  const deadlineMs = m.deadline ? new Date(m.deadline).getTime() : null;
  const daysLeft = deadlineMs != null ? Math.round((deadlineMs - now) / DAY) : null;
  const timePct = startedMs != null && deadlineMs != null && deadlineMs > startedMs
    ? Math.min(100, Math.max(0, Math.round(((now - startedMs) / (deadlineMs - startedMs)) * 100))) : null;

  const devUrl = m.apps?.dev?.url;
  const prodUrl = m.apps?.prod?.url;
  const figma = m.design;
  const accounts = m.credentials || [];
  // Видимость полей по роли смотрящего: showDevLink=true → разработчик/админ, иначе клиент/сотрудник.
  const viewerDev = !!showDevLink;
  const see = (field: string) => fieldVisible(m.fieldVisibility, field, viewerDev);

  function addRow() { setCreds((c) => [...c, { role: "", env: "", login: "", pass: "" }]); setSaved(false); }
  function setRow(i: number, k: keyof Cred, v: string) { setCreds((c) => c.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setSaved(false); }
  function delRow(i: number) { setCreds((c) => c.filter((_, j) => j !== i)); setSaved(false); }
  function save() {
    start(async () => {
      const r = await saveCredentials(project.key, creds);
      if (!r.error) { setSaved(true); setEditing(false); }
    });
  }

  return (
    <div style={{ ...ui.card, padding: 0, overflow: "hidden" }}>
      {/* шапка + узкие блоки (цифры/прогресс) */}
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          {/* Клик по проекту → его задачи (таб проекта). */}
          <a href={`/admin/tasks?project=${project.key}`} style={{ display: "inline-flex", alignItems: "baseline", gap: 8, textDecoration: "none", color: "inherit" }}>
            <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{project.key}</span>
            <strong style={{ fontSize: 16 }}>{project.name}</strong>
          </a>
          {!!newCount && <span style={{ ...ui.monoLabel, color: "#000", background: "var(--accent)", padding: "1px 7px", borderRadius: 3, fontWeight: 600 }}>{newCount} NEW</span>}
        </div>

        {counts && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            {/* Клик по плашке статуса → задачи проекта на этом табе. */}
            {BUCKET_ORDER.filter((b) => counts[b] > 0).map((b) => (
              <a key={b} href={`/admin/tasks?project=${project.key}&tab=${b}`} style={{ ...ui.monoLabel, textTransform: "none", padding: "3px 9px", border: "1px solid var(--border-2)", borderRadius: 3, textDecoration: "none", color: "inherit", cursor: "pointer" }}>
                {t(locale, BUCKET_LABEL[b])}: <b>{counts[b]}</b>
              </a>
            ))}
          </div>
        )}

        {(timePct != null) && (
          <div style={{ marginTop: 12, maxWidth: 360 }}>
            <Bar pct={timePct} label={t(locale, "dash.byTime")} danger={daysLeft != null && daysLeft < 0} />
            <div style={{ ...ui.monoLabel, textTransform: "none", marginTop: 4, color: daysLeft != null && daysLeft < 0 ? "#ff5b5b" : "var(--muted)" }}>
              {daysLeft != null && (daysLeft >= 0 ? `${daysLeft} ${t(locale, "dash.daysLeft")}` : `${-daysLeft} ${t(locale, "dash.overdueDays")}`)}
            </div>
          </div>
        )}
      </div>

      {/* аккордеон: описание со ссылками и аккаунтами */}
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--surface-2)", border: "none", borderTop: "1px solid var(--border)", color: "var(--text)", cursor: "pointer", textAlign: "left" }}>
        <span style={ui.monoLabel}>{t(locale, "proj.details")}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {see("devUrl") && devUrl && <ExtLink href={devUrl} label={`${t(locale, "proj.devApp")}: ${devUrl}`} />}
            {see("prodUrl") && prodUrl && <ExtLink href={prodUrl} label={`${t(locale, "proj.prodApp")}: ${prodUrl}`} />}
            {see("design") && figma && <ExtLink href={figma} label={`${t(locale, "proj.figma")}: ${figma}`} />}
          </div>

          {/* Аккаунты входа prod/dev (под соответствующими URL) — по видимости. */}
          {see("prodAccounts") && (m.prodAccounts?.length ?? 0) > 0 && <AccountsView title={t(locale, "proj.accountsProd")} rows={m.prodAccounts!} />}
          {see("devAccounts") && (m.devAccounts?.length ?? 0) > 0 && <AccountsView title={t(locale, "proj.accountsDev")} rows={m.devAccounts!} />}

          {/* Кастомные поля из реестра (соцсети/мессенджеры/доступы) — каждое по своей видимости. */}
          {(m.enabledFields ?? []).filter((k) => see(k)).map((k) => (
            <CustomFieldView key={k} fieldKey={k} values={m.customFields?.[k]} locale={locale} />
          ))}

          {/* Инфо от клиента + полная спека — видимость по настройке (дефолт: только разработчику). */}
          {see("devInfo") && m.devInfo && (
            <div style={{ border: "1px solid var(--border-2)", borderRadius: 6, padding: 12, background: "var(--surface-2)" }}>
              <div style={{ ...ui.monoLabel, color: "var(--accent)", marginBottom: 6 }}>{t(locale, "proj.devInfo")}</div>
              <Markdown>{m.devInfo}</Markdown>
            </div>
          )}
          {see("spec") && m.spec && (
            <div style={{ border: "1px solid var(--border-2)", borderRadius: 6 }}>
              <button onClick={() => setSpecOpen((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", textAlign: "left" }}>
                <span style={ui.monoLabel}>{t(locale, "proj.fullSpec")}</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ transform: specOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {specOpen && <div style={{ padding: "0 12px 12px", maxHeight: 420, overflowY: "auto" }}><Markdown>{m.spec}</Markdown></div>}
            </div>
          )}

          {/* аккаунты входа (видимость по настройке; дефолт — видны всем) */}
          {see("accounts") && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={ui.monoLabel}>{t(locale, "proj.accounts")}</span>
              {canEdit && !editing && (
                <button onClick={() => { setEditing(true); setCreds(accounts.length ? accounts : [{ role: "", env: "", login: "", pass: "" }]); }} title={t(locale, "proj.editAccounts")} style={{ display: "inline-flex", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: 5, cursor: "pointer", borderRadius: 2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </button>
              )}
            </div>

            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {creds.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <input value={c.role ?? ""} onChange={(e) => setRow(i, "role", e.target.value)} placeholder={t(locale, "proj.role")} style={{ ...ui.input, width: 120, padding: "6px 8px" }} />
                    <input value={c.env ?? ""} onChange={(e) => setRow(i, "env", e.target.value)} placeholder={t(locale, "proj.env")} style={{ ...ui.input, width: 90, padding: "6px 8px" }} />
                    <input value={c.login ?? ""} onChange={(e) => setRow(i, "login", e.target.value)} placeholder={t(locale, "proj.login")} style={{ ...ui.input, width: 150, padding: "6px 8px" }} />
                    <input value={c.pass ?? ""} onChange={(e) => setRow(i, "pass", e.target.value)} placeholder={t(locale, "proj.pass")} style={{ ...ui.input, width: 150, padding: "6px 8px" }} />
                    <button onClick={() => delRow(i)} style={{ background: "transparent", border: "none", color: "#ff5b5b", cursor: "pointer", fontSize: 16 }}>×</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
                  <button onClick={addRow} style={{ ...ui.monoLabel, color: "var(--muted)", background: "transparent", border: "1px dashed var(--border-2)", padding: "6px 12px", cursor: "pointer", borderRadius: 2 }}>+ {t(locale, "proj.addAccount")}</button>
                  <button onClick={save} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>{pending ? "…" : t(locale, "projects.save")}</button>
                  <button onClick={() => setEditing(false)} style={ui.btn}>{t(locale, "common.cancel")}</button>
                </div>
              </div>
            ) : accounts.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {accounts.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, padding: "6px 10px", border: "1px solid var(--border-2)", borderRadius: 3, background: "var(--surface-2)" }}>
                    {c.role && <span style={{ color: "var(--accent)", fontWeight: 600 }}>{c.role}</span>}
                    {c.env && <span style={{ color: "var(--muted)" }}>{c.env}</span>}
                    {c.login && <span style={{ fontFamily: "var(--font-mono)" }}>{c.login}</span>}
                    {c.pass && <span style={{ fontFamily: "var(--font-mono)" }}>{c.pass}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)" }}>{t(locale, "proj.noAccounts")}</p>
            )}
            {saved && <span style={{ ...ui.monoLabel, color: "var(--accent)", marginTop: 6, display: "inline-block" }}>{t(locale, "projects.saved")}</span>}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
