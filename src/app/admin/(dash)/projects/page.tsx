import Link from "next/link";
import { getBackend } from "@/lib/tasks";
import { requireAdmin } from "@/lib/principal";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { AddProjectForm } from "./add-form";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const projects = await getBackend().listProjects();

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "projects.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "projects.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>{t(locale, "projects.hint")}</p>

      <AddProjectForm locale={locale} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
        {projects.map((p) => (
          <Link
            key={p.key}
            href={`/admin/projects/${p.key}`}
            style={{ ...ui.card, padding: 16, textDecoration: "none", color: "var(--text)", display: "flex", alignItems: "center", gap: 12 }}
          >
            <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{p.key}</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</span>
            <span style={{ ...ui.monoLabel, marginLeft: "auto" }}>{t(locale, "projects.open")} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
