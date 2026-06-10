import Link from "next/link";
import { requireAdmin } from "@/lib/principal";
import { listAllProjects } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { t, type Locale } from "@/lib/i18n";
import { AddProjectForm } from "./add-form";
import { ArchiveButton } from "./archive-button";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

function ProjectCard({ p, locale }: { p: { key: string; name: string; archived: boolean }; locale: Locale }) {
  return (
    <div style={{ ...ui.card, padding: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", opacity: p.archived ? 0.6 : 1 }}>
      <Link href={`/admin/projects/${p.key}`} style={{ textDecoration: "none", color: "var(--text)", display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</span>
        <span style={{ ...ui.monoLabel, marginLeft: "auto" }}>{t(locale, "projects.open")} →</span>
      </Link>
      <ArchiveButton projectKey={p.key} archived={p.archived} locale={locale} />
    </div>
  );
}

export default async function ProjectsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const all = await listAllProjects();
  const active = all.filter((p) => !p.archived);
  const archived = all.filter((p) => p.archived);

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "projects.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "projects.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>{t(locale, "projects.hint")}</p>

      <AddProjectForm locale={locale} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
        {active.map((p) => (
          <ProjectCard key={p.key} p={p} locale={locale} />
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
