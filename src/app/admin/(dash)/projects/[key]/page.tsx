import Link from "next/link";
import { requireAdmin } from "@/lib/principal";
import { getProjectFull, getProjectTokens, getBriefByProject, listGuides, getProjectGuideIds, listSecrets } from "@/lib/db";
import { ProjectGuides } from "./project-guides";
import { SecretsPanel } from "./secrets-panel";
import { DeleteProject } from "./delete-project";
import { getBackend } from "@/lib/tasks";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { MetaForm } from "./meta-form";
import { KickoffPanel } from "./kickoff-panel";
import { DeliverPanel } from "./deliver-panel";
import { TokenRow } from "../token-row";
import { ui } from "../../../ui-styles";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ key: string }> }) {
  await requireAdmin();
  const { key } = await params;
  const locale = await getLocale();
  const [proj, tokens, users, brief, guides, enabledGuides, secrets] = await Promise.all([
    getProjectFull(key), getProjectTokens(), getBackend().listUsers(), getBriefByProject(key), listGuides(), getProjectGuideIds(key), listSecrets(key),
  ]);
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

      {brief && (
        <div style={{ ...ui.card, marginTop: 16 }}>
          <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>Бриф клиента{brief.project_type ? ` · ${brief.project_type}` : ""}</div>
          {brief.payload ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {Object.entries(brief.payload).map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", minWidth: 130 }}>{k}</span>
                  <span style={{ fontSize: 14, flex: 1, minWidth: 200, whiteSpace: "pre-wrap" }}>{Array.isArray(v) ? v.join(", ") : String(v ?? "—")}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 10 }}>Бриф ещё не заполнен.</p>
          )}
        </div>
      )}

      <SecretsPanel projectKey={key} secrets={secrets.map((s) => ({ id: s.id, name: s.name, value: s.value, note: s.note, env: s.env, filledBy: s.filled_by }))} />

      <ProjectGuides projectKey={key} guides={guides.map((g) => ({ id: g.id, title: g.title }))} enabled={enabledGuides} />

      <KickoffPanel projectKey={key} locale={locale} hasSpec={!!proj.meta.spec?.trim()} />

      {proj.meta.devGit && proj.meta.clientGit && <DeliverPanel projectKey={key} locale={locale} />}

      <div style={{ marginTop: 24 }}>
        <div style={ui.monoLabel}>{t(locale, "projects.kicker")}</div>
        <div style={{ marginTop: 10 }}>
          <TokenRow projectKey={key} name={proj.name} initialToken={tokens.get(key) ?? null} locale={locale} />
        </div>
      </div>

      <DeleteProject projectKey={key} projectName={proj.name} />
    </div>
  );
}
