import { requireAdmin } from "@/lib/principal";
import { listAccessRequests, listProjectsWithMeta, listOrphanAuthors, listLinks } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { getLocale } from "@/lib/i18n-server";
import { t, type Locale } from "@/lib/i18n";
import { InviteForm } from "./invite-form";
import { AccessRequests } from "./requests";
import { DevProjects } from "./dev-projects";
import { RelinkHistory } from "./relink-history";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireAdmin();
  const locale = await getLocale();
  const [requests, projectsMeta, users, orphans, links] = await Promise.all([
    listAccessRequests(),
    listProjectsWithMeta(),
    getBackend().listUsers(),
    listOrphanAuthors(),
    listLinks(),
  ]);
  const DATE_LOC: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-US" };
  const roleLabel = (r: string) => t(locale, `role.${r}`);
  const activeProjects = projectsMeta.filter((p) => !p.archived);
  const projOpts = activeProjects.map((p) => ({ key: p.key, name: p.name }));
  const devs = users
    .filter((u) => u.role === "contributor")
    .map((u) => ({
      login: u.login,
      fullName: u.fullName,
      projectKeys: activeProjects.filter((p) => p.meta.defaultAssignee === u.login).map((p) => p.key),
    }));
  const reqs = requests.map((r) => ({
    tg_id: r.tg_id,
    username: r.username,
    full_name: r.full_name,
    requested_role: r.requested_role,
  }));

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "team.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "team.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>{t(locale, "team.hint")}</p>

      <AccessRequests requests={reqs} projects={projOpts} locale={locale} />

      <div style={{ marginTop: 28 }}>
        <div style={ui.monoLabel}>{t(locale, "team.linkedKicker")}</div>
        <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>{t(locale, "team.linkedTitle")} · {links.length}</h2>
        {links.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10 }}>{t(locale, "team.linkedEmpty")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {links.map((l) => (
              <div key={l.login} style={{ ...ui.card, padding: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{l.full_name || l.login}</span>
                <span style={ui.monoLabel}>@{l.login}</span>
                <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{roleLabel(l.role)}</span>
                {l.project_key && <span style={ui.monoLabel}>{l.project_key}</span>}
                <span style={{ ...ui.monoLabel, marginLeft: "auto", textTransform: "none" }}>
                  {new Date(l.linked_at).toLocaleString(DATE_LOC[locale], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <DevProjects devs={devs} projects={projOpts} locale={locale} />

      <RelinkHistory orphans={orphans} members={users.map((u) => ({ login: u.login, fullName: u.fullName }))} locale={locale} />

      <div style={{ marginTop: 28 }}>
        <div style={ui.monoLabel}>{t(locale, "team.inviteKicker")}</div>
        <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>{t(locale, "team.inviteTitle")}</h2>
        <InviteForm projects={projOpts} locale={locale} />
      </div>
    </div>
  );
}
