import { t, type Locale } from "@/lib/i18n";
import { type RepoSyncStatus } from "@/lib/repo-sync";
import { ui } from "../ui-styles";

/**
 * Бейдж синхронизации dev↔client репо: зелёный «синхронізовано» либо янтарный «+N не доставлено»
 * (dev опережает клиентское на N коммитов), серый «статус невідомий» при сбое. Скрыт, если у проекта
 * нет клиентского репо. Только для дев/админа — клиенту не показываем.
 */
export function SyncBadge({ s, locale }: { s?: RepoSyncStatus; locale: Locale }) {
  if (!s || !s.configured) return null;
  const nStr = s.capped ? `${s.ahead}+` : String(s.ahead);
  const color = s.error ? "var(--muted)" : s.synced ? "var(--accent)" : "#e8b339";
  const label = s.error
    ? t(locale, "projects.sync.error")
    : s.synced
      ? t(locale, "projects.sync.synced")
      : t(locale, "projects.sync.ahead", { n: nStr });
  const title = s.error ? "" : s.synced ? t(locale, "projects.sync.syncedTitle") : t(locale, "projects.sync.aheadTitle", { n: nStr });
  return (
    <span title={title} style={{ ...ui.monoLabel, textTransform: "none", padding: "2px 8px", border: `1px solid ${color}`, color, borderRadius: 999, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, display: "inline-block", flexShrink: 0 }} />
      {label}
    </span>
  );
}
