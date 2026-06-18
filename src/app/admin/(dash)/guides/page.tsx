import { requireAdmin } from "@/lib/principal";
import { listGuides, listInstructionSets } from "@/lib/db";
import { PUBLIC_SITE } from "@/lib/dev-protocol";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { GuidesPanel } from "./guides-panel";
import { InstructionSets } from "./instruction-sets";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function GuidesPage() {
  await requireAdmin();
  const [guides, sets, locale] = await Promise.all([listGuides(), listInstructionSets(), getLocale()]);
  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "guides.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "nav.guides")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>{t(locale, "guides.libHint")}</p>
      <GuidesPanel guides={guides} />
      <InstructionSets
        guides={guides.map((g) => ({ id: g.id, title: g.title }))}
        sets={sets.map((s) => ({ id: s.id, token: s.token, title: s.title, guideIds: s.guide_ids }))}
        publicBase={PUBLIC_SITE}
        locale={locale}
      />
    </div>
  );
}
