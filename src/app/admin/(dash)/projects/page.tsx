import Link from "next/link";
import { requireAdmin } from "@/lib/principal";
import { listProjectsWithMeta } from "@/lib/db";
import { getProjectRepoSync, type RepoSyncStatus } from "@/lib/repo-sync";
import { getLocale } from "@/lib/i18n-server";
import { t, type Locale } from "@/lib/i18n";
import { AddProjectForm } from "./add-form";
import { ArchiveButton } from "./archive-button";
import { ProtocolButton } from "./protocol-button";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

/** Бейдж синхронизации dev↔client репо: зелёный «синхронізовано» или янтарный «+N не доставлено». */
function SyncBadge({ s, locale }: { s?: RepoSyncStatus; locale: Locale }) {
  if (!s || !s.configured) return null;
  const nStr = s.capped ? `${s.ahead}+` : String(s.ahead);
  const color = s.error ? "var(--muted)" : s.synced ? "var(--accent)" : "#e8b339";
  const label = s.error
    ? t(locale, "projects.sync.error")
    : s.synced
      ? t(locale, "projects.sync.synced")
      : t(locale, "projects.sync.ahead", { n: nStr });
  const title = s.error ? "" : s.synced ? t(locale, "projects.sync.syncedTitle") : t(locale, "projects.sync.aheadTitle", { n: nStr });
  return (
    <span title={title} style={{ ...ui.monoLabel, textTransform: "none", padding: "2px 8px", border: `1px solid ${color}`, color, borderRadius: 999, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, display: "inline-block", flexShrink: 0 }} />
      {label}
    </span>
  );
}

function ProjectCard({ p, locale, sync }: { p: { key: string; name: string; archived: boolean }; locale: Locale; sync?: RepoSyncStatus }) {
  return (
    <div style={{ ...ui.card, padding: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", opacity: p.archived ? 0.6 : 1 }}>
      <Link href={`/admin/projects/${p.key}`} style={{ textDecoration: "none", color: "var(--text)", display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</span>
        <span style={{ ...ui.monoLabel, marginLeft: "auto" }}>{t(locale, "projects.open")} →</span>
      </Link>
      <SyncBadge s={sync} locale={locale} />
      <ArchiveButton projectKey={p.key} archived={p.archived} locale={locale} />
    </div>
  );
}

export default async function ProjectsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const all = await listProjectsWithMeta();
  const active = all.filter((p) => !p.archived);
  const archived = all.filter((p) => p.archived);
  // Статус синка dev↔client только для активных проектов (параллельно, с кэшем в памяти).
  const syncList = await Promise.all(active.map((p) => getProjectRepoSync(p.key, p.meta)));
  const syncByKey = new Map(active.map((p, i) => [p.key, syncList[i]]));

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "projects.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "projects.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>{t(locale, "projects.hint")}</p>

      <div style={{ marginTop: 14 }}><ProtocolButton /></div>

      <AddProjectForm locale={locale} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
        {active.map((p) => (
          <ProjectCard key={p.key} p={p} locale={locale} sync={syncByKey.get(p.key)} />
        ))}
      </div>

      {archived.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ ...ui.monoLabel, color: "#e8b339" }}>{t(locale, "projects.archived")} · {archived.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {archived.map((p) => (
              <ProjectCard key={p.key} p={p} locale={locale} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
