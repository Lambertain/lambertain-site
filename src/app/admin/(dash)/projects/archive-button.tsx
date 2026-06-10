"use client";

import { useTransition } from "react";
import { archiveProject } from "./actions";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../../ui-styles";

export function ArchiveButton({ projectKey, archived, locale }: { projectKey: string; archived: boolean; locale: Locale }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); start(() => { archiveProject(projectKey, !archived); }); }}
      disabled={pending}
      style={{ ...ui.btn, padding: "5px 10px", opacity: pending ? 0.5 : 1 }}
    >
      {archived ? t(locale, "projects.restore") : t(locale, "projects.archive")}
    </button>
  );
}
