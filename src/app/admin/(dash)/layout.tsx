import { redirect } from "next/navigation";
import Link from "next/link";
import { getPrincipal } from "@/lib/principal";
import type { Role } from "@/lib/tasks/types";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { logout } from "../auth-actions";
import { OpenInBrowser } from "./open-in-browser";
import { ViewAs } from "./view-as";
import { DevHelp } from "./dev-help";
import { LocaleSwitch } from "./locale-switch";
import { NotificationBell } from "./notification-bell";
import { AutoRefresh } from "./auto-refresh";
import { listUnreadNotifications, listProjectsWithMeta } from "@/lib/db";
import { ui } from "../ui-styles";

const NAV: Record<Role, { href: string; key: string }[]> = {
  admin: [
    { href: "/admin", key: "nav.projects" },
    { href: "/admin/tasks", key: "nav.tasks" },
    { href: "/admin/briefs", key: "nav.briefs" },
    { href: "/admin/guides", key: "nav.guides" },
    { href: "/admin/contracts", key: "nav.contracts" },
    { href: "/admin/skills", key: "nav.skills" },
    { href: "/admin/team", key: "nav.team" },
    { href: "/admin/onboarding", key: "nav.onboarding" },
  ],
  contributor: [{ href: "/admin", key: "nav.projects" }, { href: "/admin/tasks", key: "nav.tasks" }],
  client: [{ href: "/admin", key: "nav.tasks" }, { href: "/onboarding", key: "nav.onboarding" }],
  employee: [{ href: "/admin", key: "nav.tasks" }],
  unknown: [],
};

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/admin/login");
  const locale = await getLocale();
  // Колокольчик: непрочитанные уведомления текущего пользователя + имена проектов для группировки.
  const [unread, allProjects] = await Promise.all([
    principal.tgId ? listUnreadNotifications(principal.tgId).catch(() => []) : Promise.resolve([]),
    listProjectsWithMeta().catch(() => []),
  ]);
  const projectNames: Record<string, string> = Object.fromEntries(allProjects.map((p) => [p.key, p.name]));

  // Таб «Инструкция» у клиента — только если онбординг для его проекта ВКЛЮЧЕН (иначе не показываем по умолчанию).
  let nav = NAV[principal.role] ?? [];
  if (principal.role === "client") {
    // Клиент может быть в нескольких проектах — таб показываем, если онбординг включён хотя бы у одного.
    const myKeys = principal.projectKeys?.length ? principal.projectKeys : principal.projectKey ? [principal.projectKey] : [];
    const onboardingOn = allProjects.some((p) => myKeys.includes(p.key) && (p.meta.showOnboarding || p.meta.onboardingSetToken));
    if (!onboardingOn) nav = nav.filter((n) => n.key !== "nav.onboarding");
  }

  return (
    <div style={{ ...ui.page, height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Живое обновление портала без F5: мягкий рефетч server-компонентов каждые 15с (видимая вкладка + при фокусе). */}
      <AutoRefresh seconds={15} />
      <nav
        className="pm-nav"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 56px 12px 20px",
          flexWrap: "wrap",
          borderBottom: "1px solid var(--border)",
          background: "rgba(8,8,8,0.9)",
          backdropFilter: "blur(16px)",
          position: "relative",
          flexShrink: 0,
          zIndex: 50,
        }}
      >
        {/* «В браузере» + «Выйти» — в правом верхнем углу */}
        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 60, display: "flex", alignItems: "center", gap: 8 }}>
          {principal.role === "contributor" && <DevHelp locale={locale} />}
          <NotificationBell initial={unread} projectNames={projectNames} locale={locale} />
          <LocaleSwitch current={locale} />
          <OpenInBrowser label={t(locale, "common.inBrowser")} />
          <form action={logout}>
            <button
              type="submit"
              title={t(locale, "common.logout")}
              aria-label={t(locale, "common.logout")}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)", padding: 7, cursor: "pointer", borderRadius: 2 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </form>
        </div>

        <Link
          href="/admin"
          style={{ fontFamily: "var(--font-display)", fontSize: 20, letterSpacing: "0.08em", color: "var(--text)", textDecoration: "none" }}
        >
          LAMB<span style={{ color: "var(--accent)" }}>.</span>
          <span style={{ ...ui.monoLabel, marginLeft: 10 }}>Dev</span>
        </Link>

        <div className="pm-nav-links" style={{ display: "flex", gap: 22, flexWrap: "wrap", flexBasis: "100%", marginTop: 6 }}>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>
              {t(locale, n.key)}
            </Link>
          ))}
          <span style={{ ...ui.monoLabel, marginLeft: "auto" }}>
            {principal.fullName} · {t(locale, `role.${principal.role}`)}
          </span>
        </div>
      </nav>

      <main className="pm-main" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {principal.realRole === "admin" && (
          <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <ViewAs current={principal.role as "admin" | "client" | "contributor" | "employee"} locale={locale} />
            {principal.role !== "admin" && (
              <span style={{ ...ui.monoLabel, color: "#e8b339" }}>
                {t(locale, "viewas.banner", { role: t(locale, `role.${principal.role}`) })}
              </span>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
