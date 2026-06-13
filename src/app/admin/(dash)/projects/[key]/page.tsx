import Link from "next/link";
import { requireAdmin } from "@/lib/principal";
import { getProjectFull, getProjectTokens } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { MetaForm } from "./meta-form";
import { DeliverPanel } from "./deliver-panel";
import { TokenRow } from "../token-row";
import { ui } from "../../../ui-styles";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ key: string }> }) {
  await requireAdmin();
  const { key } = await params;
  const locale = await getLocale();
  const [proj, tokens, users] = await Promise.all([getProjectFull(key), getProjectTokens(), getBackend().listUsers()]);
  const contributors = users
    .filter((u) => u.role === "contributor" || u.role === "admin")
    .map((u) => ({ login: u.login, fullName: u.alias || u.fullName }));

  if (!proj) {
    return (
      <div>
        <Link href="/admin/projects" style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>
          ← {t(locale, "projects.title")}
        </Link>
        <p style={{ color: "#ff5b5b", fontSize: 14, marginTop: 16 }}>404: {key}</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/admin/projects" style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>
        ← {t(locale, "projects.title")}
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{key}</span>
        <h1 style={{ ...ui.h1, fontSize: "clamp(24px,5vw,34px)", margin: 0 }}>{proj.name}</h1>
      </div>

      <MetaForm projectKey={key} initialName={proj.name} initialMeta={proj.meta} contributors={contributors} locale={locale} />

      {proj.meta.devGit && proj.meta.clientGit && <DeliverPanel projectKey={key} locale={locale} />}

      <div style={{ marginTop: 24 }}>
        <div style={ui.monoLabel}>{t(locale, "projects.kicker")}</div>
        <div style={{ marginTop: 10 }}>
          <TokenRow projectKey={key} name={proj.name} initialToken={tokens.get(key) ?? null} locale={locale} />
        </div>
      </div>
    </div>
  );
}
