import { requireAdmin } from "@/lib/principal";
import { listGuides } from "@/lib/db";
import { GuidesPanel } from "./guides-panel";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function GuidesPage() {
  await requireAdmin();
  const guides = await listGuides();
  return (
    <div>
      <div style={ui.monoLabel}>Инструкции</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>Гайды</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>
        Растущая библиотека инструкций (регистрация GitHub, хостинга, бота и т.п.). На странице проекта включаете клиенту нужные — он видит их в «Подготовке».
      </p>
      <GuidesPanel guides={guides} />
    </div>
  );
}
