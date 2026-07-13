import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/principal";
import { listProjectsWithMeta, listLinks, memberProjectsMap } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { CrewPanel, type CrewMember } from "./crew-panel";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function CrewPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/admin/login");
  if (principal.role !== "client") redirect("/admin"); // страница только для клиента (админ может смотреть через «Просмотр как клиент»)

  const locale = await getLocale();
  const myKeys = principal.projectKeys?.length ? principal.projectKeys : principal.projectKey ? [principal.projectKey] : [];

  const [projectsMeta, links, memberProj] = await Promise.all([
    listProjectsWithMeta().catch(() => []),
    listLinks().catch(() => []),
    memberProjectsMap().catch(() => new Map<string, string[]>()),
  ]);

  const projects = projectsMeta
    .filter((p) => myKeys.includes(p.key))
    .map((p) => ({ key: p.key, name: p.name }));

  // Сотрудники клиента = роль employee, состоящие хотя бы в одном общем со мной проекте.
  const employees: CrewMember[] = links
    .filter((l) => l.role === "employee")
    .map((l) => {
      const keys = Array.from(new Set([...(memberProj.get(l.login) ?? []), ...(l.project_key ? [l.project_key] : [])]));
      return { login: l.login, fullName: l.full_name || l.login, projectKeys: keys, joinedAt: l.linked_at };
    })
    .filter((e) => e.projectKeys.some((k) => myKeys.includes(k)));

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "crew.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "crew.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>{t(locale, "crew.hint")}</p>

      <CrewPanel projects={projects} employees={employees} locale={locale} />
    </div>
  );
}
