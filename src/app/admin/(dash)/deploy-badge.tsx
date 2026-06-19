import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

/**
 * Бейдж деплой-стадии задачи простыми словами (виден клиенту): «Готується» → «На тестовому сайті» → «Опубліковано».
 * Независим от статуса задачи (Open/Review/Done). Без «PR/deploy/dev/prod» — клиенту понятно.
 */
const STYLE: Record<string, { color: string; key: string }> = {
  pr: { color: "#e8b339", key: "deploy.pr" },
  dev: { color: "#5b9cff", key: "deploy.dev" },
  prod: { color: "var(--accent)", key: "deploy.prod" },
};

export function DeployBadge({ stage, locale }: { stage?: string | null; locale: Locale }) {
  if (!stage || !STYLE[stage]) return null;
  const s = STYLE[stage];
  return (
    <span style={{ ...ui.monoLabel, textTransform: "none", padding: "2px 8px", border: `1px solid ${s.color}`, color: s.color, borderRadius: 999, whiteSpace: "nowrap" }}>
      {t(locale, s.key)}
    </span>
  );
}
