"use client";

import { useState } from "react";
import type { ProjectMeta } from "@/lib/tasks/types";
import { fieldVisible } from "@/lib/field-visibility";
import { getFieldDef } from "@/lib/project-fields";
import { BUCKET_ORDER, BUCKET_LABEL, type Bucket } from "@/lib/statuses";
import { type RepoSyncStatus } from "@/lib/repo-sync";
import { t, type Locale } from "@/lib/i18n";
import { Markdown } from "./markdown";
import { SyncBadge } from "./sync-badge";
import { ProjectTimeline } from "./project-timeline";
import { ui } from "../ui-styles";

function ExtLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)", textDecoration: "none", fontSize: 14, wordBreak: "break-all" }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
      {label}
    </a>
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
  project, showDevLink, counts, newCount, now, locale, sync,
}: {
  project: { key: string; name: string; meta: ProjectMeta };
  canEdit?: boolean;
  showDevLink?: boolean;
  counts?: Record<Bucket, number>;
  newCount?: number;
  now: number;
  locale: Locale;
  /** Статус синка dev↔client репо — показываем только dev/админу (showDevLink). */
  sync?: RepoSyncStatus;
}) {
  const m = project.meta;
  const [open, setOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);

  const startedMs = m.startedAt ? new Date(m.startedAt).getTime() : null;
  const deadlineMs = m.deadline ? new Date(m.deadline).getTime() : null;

  const devUrl = m.apps?.dev?.url;
  const prodUrl = m.apps?.prod?.url;
  const figma = m.design;
  // Видимость полей по роли смотрящего: showDevLink=true → разработчик/админ, иначе клиент/сотрудник.
  const viewerDev = !!showDevLink;
  const see = (field: string) => fieldVisible(m.fieldVisibility, field, viewerDev);

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
          {/* Синхронизация dev↔client репо — только dev/админу (клиенту не показываем). */}
          {viewerDev && <SyncBadge s={sync} locale={locale} />}
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

        <ProjectTimeline startedMs={startedMs} deadlineMs={deadlineMs} now={now} locale={locale} />
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

          {/* Кастомные поля из реестра (соцсети/мессенджеры/деплой/доступы) — каждое по своей видимости.
              backed-поля (railway/vercel) берут значения из clientDeploy/clientVercel; включаем их и для старых проектов. */}
          {Array.from(new Set([
            ...(m.enabledFields ?? []),
            ...(m.clientDeploy && Object.values(m.clientDeploy).some(Boolean) ? ["railway"] : []),
            ...(m.clientVercel && Object.values(m.clientVercel).some(Boolean) ? ["vercel"] : []),
          ])).filter((k) => see(k)).map((k) => {
            const def = getFieldDef(k);
            const values = def?.backed === "clientDeploy" ? (m.clientDeploy as Record<string, string> | undefined)
              : def?.backed === "clientVercel" ? (m.clientVercel as Record<string, string> | undefined)
              : m.customFields?.[k];
            return <CustomFieldView key={k} fieldKey={k} values={values} locale={locale} />;
          })}

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

        </div>
      )}
    </div>
  );
}
