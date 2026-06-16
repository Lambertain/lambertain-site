import { requireAdmin } from "@/lib/principal";
import { listBriefs } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { briefLink } from "@/lib/invites";
import { BriefsPanel } from "./briefs-panel";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  await requireAdmin();
  const [briefs, projects] = await Promise.all([listBriefs(), getBackend().listProjects()]);
  return (
    <div>
      <div style={ui.monoLabel}>Лиды</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>Брифы</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>
        Бриф — нулевая стадия (до клиента, цены и проекта). Создаёте лида → шлёте ссылку → клиент заполняет → ответы приходят сюда и в бот.
        Когда заводите проект — привяжите к нему бриф (ответы станут доступны проекту и вашему Claude через токен).
      </p>
      <BriefsPanel
        briefs={briefs.map((b) => ({ id: b.id, token: b.token, link: briefLink(b.token), label: b.label, type: b.project_type, status: b.status, payload: b.payload, projectKey: b.project_key, created: b.created_at, tg: b.tg_username || b.tg_name || (b.tg_id ? String(b.tg_id) : null) }))}
        projects={projects.map((p) => ({ key: p.key, name: p.name }))}
      />
    </div>
  );
}
