import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";
import { ADDRESSEE_LABEL, ADDRESSEE_TONE, type AddresseeKey } from "@/lib/task-addressee";

/** Цвет бейджа по тону: видит ли клиент задачу / где «мяч». */
const TONE_COLOR = {
  client: "var(--accent)", // лайм — клиент вовлечён/видит
  wait: "#e8b339",         // жёлтый — ждёт действия (клиента/владельца)
  internal: "var(--muted)",// серый — внутренняя, клиент не видит
  team: "#5b9cff",         // синий — командная (клиент видит, наш рабочий элемент)
} as const;

/** Бейдж «кому адресована задача» — только для команды (super/admin/разработчик), не клиенту. */
export function AddresseeBadge({ addressee, locale }: { addressee: AddresseeKey | null | undefined; locale: Locale }) {
  if (!addressee) return null;
  const color = TONE_COLOR[ADDRESSEE_TONE[addressee]];
  return (
    <span style={{ ...ui.monoLabel, textTransform: "none", padding: "2px 8px", border: `1px solid ${color}`, color, borderRadius: 999, whiteSpace: "nowrap", display: "inline-flex", flexShrink: 0 }}>
      {t(locale, ADDRESSEE_LABEL[addressee])}
    </span>
  );
}
