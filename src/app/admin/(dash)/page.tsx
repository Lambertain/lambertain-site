import { getBackend } from "@/lib/tasks";
import { NewTaskForm } from "./new-task-form";
import { ui } from "../ui-styles";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const be = getBackend();
  const [projects, users] = await Promise.all([be.listProjects(), be.listUsers()]);
  return (
    <div>
      <div style={ui.monoLabel}>Постановка</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>Новая задача</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>
        Опиши задание свободным текстом — проект, суть, исполнитель, срок. Я структурирую и покажу
        превью перед постановкой.
      </p>
      <NewTaskForm
        projects={projects.map((p) => ({ key: p.key, name: p.name }))}
        users={users
          .filter((u) => !u.banned)
          .map((u) => ({ login: u.login, fullName: u.fullName, role: u.role }))}
      />
    </div>
  );
}
