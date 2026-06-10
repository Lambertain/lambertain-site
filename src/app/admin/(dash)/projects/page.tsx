import { getBackend } from "@/lib/tasks";
import { requireAdmin } from "@/lib/principal";
import { getProjectTokens } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { TokenRow } from "./token-row";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const be = getBackend();
  const [projects, tokens] = await Promise.all([be.listProjects(), getProjectTokens()]);

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "projects.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "projects.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>{t(locale, "projects.hint")}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        {projects.map((p) => (
          <TokenRow key={p.key} projectKey={p.key} name={p.name} initialToken={tokens.get(p.key) ?? null} locale={locale} />
        ))}
      </div>
    </div>
  );
}
