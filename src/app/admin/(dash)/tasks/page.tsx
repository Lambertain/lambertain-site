import { getBackend } from "@/lib/tasks";
import { getPrincipal } from "@/lib/principal";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { TaskList } from "../task-card";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const me = await getPrincipal();
  if (!me) redirect("/admin/login");
  const locale = await getLocale();

  const be = getBackend();
  let query = "#Unresolved sort by: updated desc";
  let title = t(locale, "tasks.allTitle");
  let kicker = t(locale, "tasks.allKicker");

  if (me.role === "contributor" && me.youtrackLogin) {
    query = `Assignee: ${me.youtrackLogin} #Unresolved sort by: updated desc`;
    title = t(locale, "tasks.mineTitle");
    kicker = t(locale, "tasks.mineKicker");
  } else if (me.role === "client" && me.youtrackLogin) {
    query = `created by: ${me.youtrackLogin} sort by: updated desc`;
    title = t(locale, "tasks.clientTitle");
    kicker = t(locale, "tasks.clientKicker");
  }

  let tasks;
  try {
    tasks = await be.listTasks(query);
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

  return (
    <div>
      <div style={ui.monoLabel}>{kicker}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{title}</h1>
      <TaskList tasks={tasks} empty={t(locale, "tasks.empty")} locale={locale} />
    </div>
  );
}
