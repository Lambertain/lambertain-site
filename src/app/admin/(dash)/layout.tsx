import { redirect } from "next/navigation";
import Link from "next/link";
import { getPrincipal } from "@/lib/principal";
import type { Role } from "@/lib/tasks/types";
import { logout } from "../auth-actions";
import { OpenInBrowser } from "./open-in-browser";
import { ui } from "../ui-styles";

const NAV: Record<Role, { href: string; label: string }[]> = {
  admin: [
    { href: "/admin", label: "Новая задача" },
    { href: "/admin/tasks", label: "Задачи" },
    { href: "/admin/clients", label: "Клиенты" },
    { href: "/admin/overdue", label: "Просрочки" },
    { href: "/admin/team", label: "Команда" },
  ],
  contributor: [{ href: "/admin/tasks", label: "Мои задачи" }],
  client: [
    { href: "/admin", label: "Новая задача" },
    { href: "/admin/tasks", label: "Мои проекты" },
  ],
  unknown: [],
};

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/admin/login");

  const nav = NAV[principal.role] ?? [];

  return (
    <div style={ui.page}>
      <nav
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
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            letterSpacing: "0.08em",
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          LAMB<span style={{ color: "var(--accent)" }}>.</span>
          <span style={{ ...ui.monoLabel, marginLeft: 10 }}>Dev</span>
        </Link>

        <div style={{ display: "flex", gap: 22 }}>
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              style={{ ...ui.monoLabel, color: "var(--muted)", textDecoration: "none" }}
            >
              {n.label}
            </Link>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={ui.monoLabel}>
            {principal.fullName} · {principal.role}
          </span>
          <OpenInBrowser />
          <form action={logout}>
            <button type="submit" style={{ ...ui.btn, padding: "7px 14px" }}>
              Выйти
            </button>
          </form>
        </div>
      </nav>

      <main style={{ padding: "32px", maxWidth: 1000, margin: "0 auto" }}>{children}</main>
    </div>
  );
}
