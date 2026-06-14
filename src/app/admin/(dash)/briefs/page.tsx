import { requireAdmin } from "@/lib/principal";
import { listBriefs } from "@/lib/db";
import { PUBLIC_SITE } from "@/lib/dev-protocol";
import { BriefsPanel } from "./briefs-panel";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  await requireAdmin();
  const briefs = await listBriefs();
  return (
    <div>
      <div style={ui.monoLabel}>Лиды</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>Брифы</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>
        Бриф — нулевая стадия (до клиента, цены и проекта). Создаёте лида → шлёте ссылку → клиент заполняет → ответы приходят сюда и в бот.
      </p>
      <BriefsPanel
        briefs={briefs.map((b) => ({ id: b.id, token: b.token, label: b.label, type: b.project_type, status: b.status, payload: b.payload, created: b.created_at }))}
        base={PUBLIC_SITE}
      />
    </div>
  );
}
