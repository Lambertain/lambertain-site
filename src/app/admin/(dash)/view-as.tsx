"use client";

import { useTransition } from "react";
import { setViewAs } from "../auth-actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

export function ViewAs({ current, locale }: { current: "admin" | "client" | "contributor" | "employee"; locale: Locale }) {
  const [pending, start] = useTransition();
  const opts: Array<{ v: "" | "client" | "contributor" | "employee"; key: string; active: boolean }> = [
    { v: "", key: "viewas.admin", active: current === "admin" },
    { v: "client", key: "role.client", active: current === "client" },
    { v: "contributor", key: "role.contributor", active: current === "contributor" },
    { v: "employee", key: "role.employee", active: current === "employee" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ ...ui.monoLabel, marginRight: 2 }}>{t(locale, "viewas.label")}:</span>
      {opts.map((o) => (
        <button
          key={o.v || "admin"}
          onClick={() => start(() => setViewAs(o.v))}
          disabled={pending || o.active}
          style={{
            ...ui.monoLabel,
            cursor: o.active ? "default" : "pointer",
            background: o.active ? "var(--accent)" : "transparent",
            color: o.active ? "#000" : "var(--muted)",
            border: "1px solid " + (o.active ? "var(--accent)" : "var(--border-2)"),
            padding: "4px 8px",
          }}
        >
          {t(locale, o.key)}
        </button>
      ))}
    </div>
  );
}
