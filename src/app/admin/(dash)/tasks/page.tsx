import { getBackend } from "@/lib/tasks";
import { getPrincipal } from "@/lib/principal";
import { redirect } from "next/navigation";
import { TaskList } from "../task-card";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const me = await getPrincipal();
  if (!me) redirect("/admin/login");

  const be = getBackend();
  let query = "#Unresolved sort by: updated desc";
  let title = "Все задачи";
  let label = "Активные";

  if (me.role === "contributor" && me.youtrackLogin) {
    query = `Assignee: ${me.youtrackLogin} #Unresolved sort by: updated desc`;
    title = "Мои задачи";
    label = "Назначено мне";
  } else if (me.role === "client" && me.youtrackLogin) {
    query = `created by: ${me.youtrackLogin} sort by: updated desc`;
    title = "Мои проекты";
    label = "Мои заявки";
  }

  let tasks;
  try {
    tasks = await be.listTasks(query);
  } catch (e) {
    return (
      <div>
        <h1 style={ui.h1}>{title}</h1>
        <p style={{ color: "#ff5b5b", fontSize: 14 }}>
          Ошибка загрузки: {e instanceof Error ? e.message : "неизвестно"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={ui.monoLabel}>{label}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{title}</h1>
      <TaskList tasks={tasks} empty="Активных задач нет." />
    </div>
  );
}
