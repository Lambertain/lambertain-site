import { requireAdmin } from "@/lib/principal";
import { listAccessRequests, listProjectsWithMeta, listOrphanAuthors, listLinks, memberProjectsMap } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { InviteForm } from "./invite-form";
import { AccessRequests } from "./requests";
import { UsersPanel, type PanelUser } from "./users-panel";
import { RelinkHistory } from "./relink-history";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireAdmin();
  const locale = await getLocale();
  const [requests, projectsMeta, users, orphans, links, memberProj] = await Promise.all([
    listAccessRequests(),
    listProjectsWithMeta(),
    getBackend().listUsers(),
    listOrphanAuthors(),
    listLinks(),
    memberProjectsMap(),
  ]);
  const activeProjects = projectsMeta.filter((p) => !p.archived);
  const projOpts = activeProjects.map((p) => ({ key: p.key, name: p.name }));
  const userByLogin = new Map(users.map((u) => [u.login, u]));

  // Пользователи = присоединившиеся (tg_links), обогащённые alias и проектами.
  const panelUsers: PanelUser[] = links.map((l) => {
    const m = userByLogin.get(l.login);
    // Разработчик — проекты по defaultAssignee. Клиент/сотрудник — объединяем member_projects и tg_links.project_key
    // (надёжно: сотрудника проекта без клиента и клиента с сотрудниками одинаково цепляем по проекту).
    const projectKeys =
      l.role === "contributor"
        ? activeProjects.filter((p) => p.meta.defaultAssignee === l.login).map((p) => p.key)
        : Array.from(new Set([...(memberProj.get(l.login) ?? []), ...(l.project_key ? [l.project_key] : [])]));
    return {
      login: l.login,
      fullName: m?.fullName || l.full_name || l.login,
      alias: m?.alias ?? null,
      role: l.role,
      projectKeys,
      joinedAt: l.linked_at,
    };
  });

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

      <UsersPanel users={panelUsers} projects={projOpts} locale={locale} />

      <RelinkHistory orphans={orphans} members={users.map((u) => ({ login: u.login, fullName: u.alias || u.fullName }))} locale={locale} />

      <div style={{ marginTop: 28 }}>
        <div style={ui.monoLabel}>{t(locale, "team.inviteKicker")}</div>
        <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>{t(locale, "team.inviteTitle")}</h2>
        <InviteForm projects={projOpts} locale={locale} />
      </div>
    </div>
  );
}
