import { requireAdmin } from "@/lib/principal";
import { listSkills, usageSummary } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { ui } from "../../ui-styles";

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
          <div key={s.slug} style={{ ...ui.card, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{s.title}</span>
              <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>{s.slug}</span>
              {s.auto_generated && <span style={{ ...ui.monoLabel, color: "#e8b339" }}>{t(locale, "skills.auto")}</span>}
            </div>
            <div style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginBottom: 8 }}>{s.triggers}</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5, color: "var(--text)" }}>{s.playbook}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
