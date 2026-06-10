import { requireAdmin } from "@/lib/principal";
import { listSkills, usageSummary } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { ui } from "../../ui-styles";
import { SkillCard } from "./skill-card";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const [skills, usage] = await Promise.all([listSkills(), usageSummary()]);

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "skills.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "skills.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>{t(locale, "skills.hint")}</p>

      {/* Расход токенов */}
      <div className="pm-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18, maxWidth: 420 }}>
        <div style={{ ...ui.card, padding: 16 }}>
          <div style={ui.monoLabel}>{t(locale, "skills.usageToday")}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{usage.todayTok.toLocaleString()}</div>
          <div style={{ ...ui.monoLabel, textTransform: "none" }}>~${usage.todayUsd.toFixed(2)}</div>
        </div>
        <div style={{ ...ui.card, padding: 16 }}>
          <div style={ui.monoLabel}>{t(locale, "skills.usageMonth")}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "var(--accent)" }}>${usage.monthUsd.toFixed(2)}</div>
        </div>
      </div>

      {/* Список скилов */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
        {skills.map((s) => (
          <SkillCard key={s.slug} skill={s} locale={locale} autoLabel={t(locale, "skills.auto")} />
        ))}
      </div>
    </div>
  );
}
