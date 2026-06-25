"use client";

import { useState } from "react";
import { type Locale } from "@/lib/i18n";
import { ui } from "../../../ui-styles";

const ROLE: Record<string, Record<Locale, string>> = {
  contributor: { uk: "Розробник", ru: "Разработчик", en: "Developer" },
  client: { uk: "Клієнт", ru: "Клиент", en: "Client" },
  employee: { uk: "Співробітник", ru: "Сотрудник", en: "Employee" },
  admin: { uk: "Адмін / власник", ru: "Админ / владелец", en: "Admin / owner" },
};
const TXT: Record<Locale, { tg: string; proj: string; noproj: string; norole: string }> = {
  uk: { tg: "Telegram", proj: "Проєкти", noproj: "Без проєкту", norole: "Роль невідома" },
  ru: { tg: "Telegram", proj: "Проекты", noproj: "Без проекта", norole: "Роль неизвестна" },
  en: { tg: "Telegram", proj: "Projects", noproj: "No project", norole: "Role unknown" },
};

/** Постановщик/исполнитель с всплывающим окном при наведении: роль, Telegram-ник, проекты. */
export function ReporterHover({ text, role, projects, telegram, projectNames, locale }: {
  text: string;
  role: string | null;
  projects: string[];
  telegram: string | null;
  projectNames: Record<string, string>;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const tx = TXT[locale];
  return (
    <span style={{ position: "relative", display: "inline-block" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span style={{ borderBottom: "1px dotted var(--muted)", cursor: "help" }}>{text}</span>
      {open && (
        <span style={{ position: "absolute", left: 0, top: "100%", marginTop: 6, zIndex: 60, minWidth: 190, maxWidth: 280, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 11px", boxShadow: "0 8px 24px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", gap: 5, whiteSpace: "normal" }}>
          <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{role ? (ROLE[role]?.[locale] || role) : tx.norole}</span>
          {telegram && <span style={{ fontSize: 12.5 }}>{tx.tg}: @{telegram}</span>}
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {projects.length ? `${tx.proj}: ${projects.map((p) => projectNames[p] || p).join(", ")}` : tx.noproj}
          </span>
        </span>
      )}
    </span>
  );
}
