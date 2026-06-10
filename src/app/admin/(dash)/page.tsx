import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import type { TaskFilter } from "@/lib/tasks/types";
import { getPrincipal } from "@/lib/principal";
import { visibleProjects } from "@/lib/scope";
import { getReads } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { ChatModal } from "./chat-modal";
import { TaskBoard, type BoardTask } from "./task-board";
import { ui } from "../ui-styles";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const me = await getPrincipal();
  if (!me) redirect("/admin/login");
  const locale = await getLocale();
  const be = getBackend();

  const all = await be.listProjects();
  const projects = visibleProjects(me, all).map((p) => ({ key: p.key, name: p.name }));

  // Скоуп задач по роли.
  let filter: TaskFilter = { order: "updated_desc", limit: 150 };
  if (me.realRole !== "admin") {
    if (me.role === "contributor" && me.youtrackLogin) filter = { assigneeLogin: me.youtrackLogin, order: "updated_desc" };
    else if ((me.role === "client" || me.role === "employee") && me.projectKey) filter = { projectKey: me.projectKey, order: "updated_desc" };
  }

  const readKey = me.youtrackLogin || me.fullName || "admin";
  let tasks, reads;
  try {
    [tasks, reads] = await Promise.all([be.listTasks(filter), getReads(readKey)]);
  } catch (e) {
    return <p style={{ color: "#ff5b5b", fontSize: 14 }}>{e instanceof Error ? e.message : "—"}</p>;
  }

  const board: BoardTask[] = tasks.map((tk) => ({
    id: tk.id,
    summary: tk.summary,
    status: tk.state || "Open",
    description: tk.description,
    created: tk.created,
    updated: tk.updated,
    commentCount: tk.commentCount,
    assignee: me.role === "client" ? null : tk.assignee?.fullName ?? null,
    unread: (tk.lastCommentAt ?? 0) > (reads.get(tk.id) ?? 0),
  }));

  const canEditStatus = me.realRole === "admin" || me.role === "contributor";
  const canDelete = me.realRole === "admin" || me.role === "client";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ ...ui.h1, fontSize: "clamp(22px,5vw,30px)" }}>{t(locale, "nav.tasks")}</h1>
        <ChatModal projects={projects} locale={locale} />
      </div>
      <TaskBoard tasks={board} locale={locale} canEditStatus={canEditStatus} canDelete={canDelete} empty={t(locale, "tasks.empty")} />
    </div>
  );
}
