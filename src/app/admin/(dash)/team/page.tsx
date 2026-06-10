import { getBackend } from "@/lib/tasks";
import { requireAdmin } from "@/lib/principal";
import { listAccessRequests } from "@/lib/db";
import { InviteForm } from "./invite-form";
import { AccessRequests } from "./requests";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireAdmin();
  const be = getBackend();
  const [users, requests] = await Promise.all([be.listUsers(), listAccessRequests()]);
  const active = users
    .filter((u) => !u.banned && u.login !== "guest")
    .map((u) => ({ login: u.login, fullName: u.fullName, role: u.role }));
  const reqs = requests.map((r) => ({
    tg_id: r.tg_id,
    username: r.username,
    full_name: r.full_name,
    requested_role: r.requested_role,
  }));

  return (
    <div>
      <div style={ui.monoLabel}>Доступ по ролям</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>Команда</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>
        Подтверждай заявки на доступ или генерируй ссылку-приглашение. Привязка соединяет Telegram
        пользователя с учёткой YouTrack и ролью.
      </p>

      <AccessRequests requests={reqs} users={active} />

      <div style={{ marginTop: 28 }}>
        <div style={ui.monoLabel}>Пригласить ссылкой</div>
        <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>Приглашение</h2>
        <InviteForm users={active} />
      </div>
    </div>
  );
}
