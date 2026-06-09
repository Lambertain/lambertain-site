import { getBackend } from "@/lib/tasks";
import { requireAdmin } from "@/lib/principal";
import { TaskCard } from "../task-card";
import { ReplyBox } from "./reply-box";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

const MAX_SCAN = 20; // ограничение на скан комментариев

export default async function ClientsPage() {
  await requireAdmin();
  const be = getBackend();
  const all = await be.listTasks("#Unresolved sort by: updated desc");
  const clientTasks = all.filter((t) => t.reporter?.role === "client").slice(0, MAX_SCAN);

  // Для каждой клиентской задачи ищем неотвеченный вопрос (последний коммент — от клиента).
  const enriched = await Promise.all(
    clientTasks.map(async (t) => {
      try {
        const comments = await be.getComments(t.id);
        const last = comments[comments.length - 1];
        const pending = last && last.author.role === "client" ? last.text : null;
        return { task: t, pending };
      } catch {
        return { task: t, pending: null };
      }
    }),
  );

  return (
    <div>
      <div style={ui.monoLabel}>Заявки и вопросы</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>Клиенты</h1>

      {!enriched.length ? (
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 20 }}>
          Активных задач от клиентов нет.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
          {enriched.map(({ task, pending }) => (
            <div key={task.id}>
              <TaskCard task={task} />
              {pending && <ReplyBox taskId={task.id} question={pending} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
