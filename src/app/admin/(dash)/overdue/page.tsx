import { getBackend } from "@/lib/tasks";
import { requireAdmin } from "@/lib/principal";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { TaskList } from "../task-card";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

const STALE_DAYS = 5;

export default async function OverduePage() {
  await requireAdmin();
  const locale = await getLocale();
  const be = getBackend();
  const all = await be.listTasks("#Unresolved sort by: updated asc");
  const threshold = Date.now() - STALE_DAYS * 86400000;
  const stale = all.filter((t) => t.updated != null && t.updated < threshold);

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "overdue.kicker", { n: STALE_DAYS })}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "overdue.title")}</h1>
      <TaskList tasks={stale} empty={t(locale, "overdue.empty")} locale={locale} />
    </div>
  );
}
