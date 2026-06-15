import { requireAdmin } from "@/lib/principal";
import { listGuides, listInstructionSets } from "@/lib/db";
import { PUBLIC_SITE } from "@/lib/dev-protocol";
import { GuidesPanel } from "./guides-panel";
import { InstructionSets } from "./instruction-sets";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function GuidesPage() {
  await requireAdmin();
  const [guides, sets] = await Promise.all([listGuides(), listInstructionSets()]);
  return (
    <div>
      <div style={ui.monoLabel}>Инструкции</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>Гайды</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>
        Растущая библиотека инструкций (регистрация GitHub, хостинга, бота и т.п.). На странице проекта включаете клиенту нужные — он видит их в «Подготовке».
      </p>
      <GuidesPanel guides={guides} />
      <InstructionSets
        guides={guides.map((g) => ({ id: g.id, title: g.title }))}
        sets={sets.map((s) => ({ id: s.id, token: s.token, title: s.title, guideIds: s.guide_ids }))}
        publicBase={PUBLIC_SITE}
      />
    </div>
  );
}
