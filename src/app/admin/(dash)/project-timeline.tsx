import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

/**
 * Таймлайн проекта на карточке: 3 даты (Старт · Здача · Гарантія до) + прогресс-бары.
 * «Гарантія до» = дата сдачи (deadline) + 1 місяць — період безкоштовного виправлення багів клієнту.
 * Показуємо всім (адмін/розробник/клієнт). Чистий presentational-компонент — працює і в server-, і в client-картці.
 */
const DAY = 86400000;
const DATE_LOCALE: Record<Locale, string> = { uk: "uk-UA", ru: "ru-RU", en: "en-GB" };

function addMonth(ms: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + 1);
  return d.getTime();
}
function fmt(ms: number, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "uk-UA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(ms));
}
function clampPct(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function Bar({ pct, label, color }: { pct: number; label: string; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", ...ui.monoLabel, textTransform: "none", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: "var(--surface-2)", border: "1px solid var(--border-2)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

export function ProjectTimeline({ startedMs, deadlineMs, now, locale }: {
  startedMs: number | null;
  deadlineMs: number | null;
  now: number;
  locale: Locale;
}) {
  if (startedMs == null && deadlineMs == null) return null;
  const warrantyEndMs = deadlineMs != null ? addMonth(deadlineMs) : null;

  const overdue = deadlineMs != null && now > deadlineMs;
  const timePct = startedMs != null && deadlineMs != null && deadlineMs > startedMs
    ? clampPct(((now - startedMs) / (deadlineMs - startedMs)) * 100)
    : null;
  const warrantyPct = deadlineMs != null && warrantyEndMs != null
    ? clampPct(((now - deadlineMs) / (warrantyEndMs - deadlineMs)) * 100)
    : null;
  const warrantyDaysLeft = warrantyEndMs != null ? Math.round((warrantyEndMs - now) / DAY) : null;

  // Подпись под гарантийным баром: до сдачи — «стартует со сдачей», в период — «до {дата} · N дн.», после — «завершено».
  let warrantyNote = "";
  if (warrantyEndMs != null && deadlineMs != null) {
    if (now < deadlineMs) warrantyNote = t(locale, "dash.warrantyPending", { date: fmt(warrantyEndMs, locale) });
    else if (now > warrantyEndMs) warrantyNote = t(locale, "dash.warrantyEnded", { date: fmt(warrantyEndMs, locale) });
    else warrantyNote = t(locale, "dash.warrantyActive", { date: fmt(warrantyEndMs, locale), n: String(Math.max(0, warrantyDaysLeft ?? 0)) });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, maxWidth: 380 }}>
      {/* 3 даты одной строкой */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", ...ui.monoLabel, textTransform: "none" }}>
        {startedMs != null && <span>{t(locale, "dash.dateStart")}: {fmt(startedMs, locale)}</span>}
        {deadlineMs != null && <span>{t(locale, "dash.dateDelivery")}: {fmt(deadlineMs, locale)}</span>}
        {warrantyEndMs != null && <span style={{ color: "#5b9cff" }}>{t(locale, "dash.dateWarranty")}: {fmt(warrantyEndMs, locale)}</span>}
      </div>
      {timePct != null && <Bar pct={timePct} label={t(locale, "dash.byTime")} color={overdue ? "#ff5b5b" : "var(--accent)"} />}
      {warrantyPct != null && (
        <div>
          <Bar pct={warrantyPct} label={t(locale, "dash.byWarranty")} color="#5b9cff" />
          {warrantyNote && <div style={{ ...ui.monoLabel, textTransform: "none", marginTop: 4, color: "var(--muted)" }}>{warrantyNote}</div>}
        </div>
      )}
    </div>
  );
}
