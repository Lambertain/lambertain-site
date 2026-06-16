import { requireAdmin } from "@/lib/principal";
import { listAccessRequests, listProjectsWithMeta, listOrphanAuthors, listLinks, memberProjectsMap, listInstructionSets, listBriefs } from "@/lib/db";
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
  const [requests, projectsMeta, users, orphans, links, memberProj, sets, briefs] = await Promise.all([
    listAccessRequests(),
    listProjectsWithMeta(),
    getBackend().listUsers(),
    listOrphanAuthors(),
    listLinks(),
    memberProjectsMap(),
    listInstructionSets(),
    listBriefs(),
  ]);
  // Лиды — заполненные брифы, ещё не заведённые в проект.
  const leads = briefs
    .filter((b) => !b.project_key)
    .map((b) => {
      const p = (b.payload || {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      return {
        id: b.id, label: b.label, projectType: b.project_type, status: b.status, submittedAt: b.submitted_at, createdAt: b.created_at,
        companyName: str(p.companyName), contactPerson: str(p.contactPerson), contacts: str(p.contacts),
      };
    });
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

  // Заявки от уже присоединившихся (есть tg_link) — не показываем: человек уже в команде
  // (мог зайти по инвайт-ссылке, а его старая заявка осталась висеть). Иначе дубль и путаница.
  const linkedTgIds = new Set(links.map((l) => l.tg_id));
  const reqs = requests
    .filter((r) => !linkedTgIds.has(r.tg_id))
    .map((r) => ({
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
        <div style={ui.monoLabel}>{t(locale, "team.inviteKicker")}</div>
        <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>{t(locale, "team.inviteTitle")}</h2>
        <InviteForm projects={projOpts} locale={locale} sets={sets.map((s) => ({ token: s.token, title: s.title, count: s.guide_ids.length }))} />
      </div>

      <UsersPanel users={panelUsers} projects={projOpts} locale={locale} leads={leads} />

      <RelinkHistory orphans={orphans} members={users.map((u) => ({ login: u.login, fullName: u.alias || u.fullName }))} locale={locale} />
    </div>
  );
}
