import { redirect } from "next/navigation";
import Link from "next/link";
import { getPrincipal } from "@/lib/principal";
import type { Role } from "@/lib/tasks/types";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { logout } from "../auth-actions";
import { OpenInBrowser } from "./open-in-browser";
import { ui } from "../ui-styles";

const NAV: Record<Role, { href: string; key: string }[]> = {
  admin: [
    { href: "/admin", key: "nav.newTask" },
    { href: "/admin/tasks", key: "nav.tasks" },
    { href: "/admin/clients", key: "nav.clients" },
    { href: "/admin/overdue", key: "nav.overdue" },
    { href: "/admin/projects", key: "nav.projects" },
    { href: "/admin/team", key: "nav.team" },
  ],
  contributor: [{ href: "/admin/tasks", key: "nav.myTasks" }],
  client: [
    { href: "/admin", key: "nav.newTask" },
    { href: "/admin/tasks", key: "nav.myProjects" },
  ],
  unknown: [],
};

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/admin/login");
  const locale = await getLocale();
  const nav = NAV[principal.role] ?? [];

  return (
    <div style={ui.page}>
      <nav
        className="pm-nav"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          padding: "16px 32px",
          borderBottom: "1px solid var(--border)",
          background: "rgba(8,8,8,0.9)",
          backdropFilter: "blur(16px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <Link
          href="/admin"
          style={{ fontFamily: "var(--font-display)", fontSize: 20, letterSpacing: "0.08em", color: "var(--text)", textDecoration: "none" }}
        >
          LAMB<span style={{ color: "var(--accent)" }}>.</span>
          <span style={{ ...ui.monoLabel, marginLeft: 10 }}>Dev</span>
        </Link>

        <div className="pm-nav-links" style={{ display: "flex", gap: 22 }}>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}>
              {t(locale, n.key)}
            </Link>
          ))}
        </div>

        <div className="pm-nav-right" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={ui.monoLabel}>
            {principal.fullName} · {t(locale, `role.${principal.role}`)}
          </span>
          <OpenInBrowser label={t(locale, "common.inBrowser")} />
          <form action={logout}>
            <button type="submit" style={{ ...ui.btn, padding: "7px 14px" }}>
              {t(locale, "common.logout")}
            </button>
          </form>
        </div>
      </nav>

      <main className="pm-main">{children}</main>
    </div>
  );
}
