import { getBackend } from "@/lib/tasks";
import { requireAdmin } from "@/lib/principal";
import { TaskList } from "../task-card";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

const STALE_DAYS = 5;

export default async function OverduePage() {
  await requireAdmin();
  const be = getBackend();
  const all = await be.listTasks("#Unresolved sort by: updated asc");
  const threshold = Date.now() - STALE_DAYS * 86400000;
  const stale = all.filter((t) => t.updated != null && t.updated < threshold);

  return (
    <div>
      <div style={ui.monoLabel}>Без движения от {STALE_DAYS} дн.</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>Просрочки</h1>
      <TaskList tasks={stale} empty="Зависших задач нет — всё в движении." />
    </div>
  );
}
