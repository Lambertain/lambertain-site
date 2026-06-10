/** Набор статусов задачи (для клика-смены) и цвета. */
export const STATUSES = ["Open", "In Progress", "To Verify", "Done", "Blocked"] as const;

/** Цвет по статусу (сопоставление по ключевым словам — устойчиво к импортированным названиям). */
export function statusColor(status: string | undefined | null): string {
  const s = (status || "").toLowerCase();
  if (/(done|закры|готов|fixed|complete|verified|выполн)/.test(s)) return "#b9ff4b"; // зелёный
  if (/(progress|работе|в работе|doing)/.test(s)) return "#5b8def"; // синий
  if (/(verify|review|провер|тест|qa)/.test(s)) return "#e8b339"; // жёлтый
  if (/(block|заблок|stuck|hold)/.test(s)) return "#ff5b5b"; // красный
  return "#8a8a8a"; // серый (open/to do/backlog)
}
