import { getBackend } from "@/lib/tasks";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { ChatIntake } from "./chat-intake";
import { ui } from "../ui-styles";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const be = getBackend();
  const locale = await getLocale();
  const projects = await be.listProjects();
  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "newtask.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "newtask.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>
        {t(locale, "newtask.hint")}
      </p>
      <ChatIntake locale={locale} projects={projects.map((p) => ({ key: p.key, name: p.name }))} />
    </div>
  );
}
