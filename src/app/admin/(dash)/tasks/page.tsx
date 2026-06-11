import { getBackend } from "@/lib/tasks";
import type { TaskFilter } from "@/lib/tasks/types";
import { getPrincipal } from "@/lib/principal";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { TaskList } from "../task-card";
import { nowMs } from "@/lib/now";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

const STALE_DAYS = 5;

export default async function TasksPage() {
  const me = await getPrincipal();
  if (!me) redirect("/admin/login");
  const locale = await getLocale();

  const be = getBackend();
  let filter: TaskFilter = { unresolvedOnly: true, order: "updated_desc" };
  let title = t(locale, "tasks.allTitle");
  let kicker = t(locale, "tasks.allKicker");

  if (me.role === "contributor" && me.youtrackLogin) {
    filter = { assigneeLogin: me.youtrackLogin, unresolvedOnly: true, order: "updated_desc" };
    title = t(locale, "tasks.mineTitle");
    kicker = t(locale, "tasks.mineKicker");
  } else if (me.role === "client" && me.youtrackLogin) {
    filter = { reporterLogin: me.youtrackLogin, order: "updated_desc" };
    title = t(locale, "tasks.clientTitle");
    kicker = t(locale, "tasks.clientKicker");
  }

  let tasks;
  try {
    tasks = await be.listTasks(filter);
  } catch (e) {
    return (
      <div>
        <h1 style={ui.h1}>{title}</h1>
        <p style={{ color: "#ff5b5b", fontSize: 14 }}>
          {t(locale, "error.load")}
          {e instanceof Error ? e.message : "—"}
        </p>
      </div>
    );
  }

  const threshold = nowMs() - STALE_DAYS * 86400000;
  const stale = tasks.filter((x) => x.resolved == null && x.updated != null && x.updated < threshold);
  const fresh = tasks.filter((x) => !stale.includes(x));

  return (
    <div>
      <div style={ui.monoLabel}>{kicker}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{title}</h1>

      {stale.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ ...ui.monoLabel, color: "#e8b339" }}>
            {t(locale, "overdue.title")} · {stale.length}
          </div>
          <TaskList tasks={stale} empty="" locale={locale} hideWorkers={me.role === "client"} />
        </div>
      )}

      <TaskList tasks={fresh} empty={t(locale, "tasks.empty")} locale={locale} hideWorkers={me.role === "client"} />
    </div>
  );
}
