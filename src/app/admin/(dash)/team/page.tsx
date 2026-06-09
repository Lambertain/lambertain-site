import { getBackend } from "@/lib/tasks";
import { requireAdmin } from "@/lib/principal";
import { InviteForm } from "./invite-form";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireAdmin();
  const be = getBackend();
  const users = await be.listUsers();
  const active = users
    .filter((u) => !u.banned && u.login !== "guest")
    .map((u) => ({ login: u.login, fullName: u.fullName, role: u.role }));

  return (
    <div>
      <div style={ui.monoLabel}>Доступ по ролям</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>Команда</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>
        Сгенерируй одноразовую ссылку для сотрудника или клиента. Открыв её в Telegram, он привяжет
        свой аккаунт к учётке YouTrack и получит доступ к Mini App в своей роли.
      </p>
      <InviteForm users={active} />
    </div>
  );
}
