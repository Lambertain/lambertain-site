/** Набор статусов задачи (для клика-смены) и цвета. */
export const STATUSES = ["Open", "In Progress", "Review", "Done", "Blocked"] as const;

/** Корзина статуса — устойчиво к импортированным/произвольным названиям (по ключевым словам). */
export type Bucket = "notStarted" | "inProgress" | "review" | "done" | "blocked";

/** Сопоставление статуса с корзиной. Порядок проверок важен (done раньше review/progress). */
export function statusBucket(status: string | undefined | null): Bucket {
  const s = (status || "").toLowerCase();
  if (/(done|закры|готов|fixed|complete|verified|выполн)/.test(s)) return "done";
  if (/(block|заблок|stuck|hold)/.test(s)) return "blocked";
  if (/(verify|review|провер|тест|qa|ревью)/.test(s)) return "review";
  if (/(progress|работе|в работе|doing|wip)/.test(s)) return "inProgress";
  return "notStarted"; // open / to do / backlog / не начато
}

/** Канонический статус, который ставит портал для корзины. */
export const BUCKET_STATUS: Record<Bucket, (typeof STATUSES)[number]> = {
  notStarted: "Open",
  inProgress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

/** Порядок табов в UI: что у разраба → ревью → готово → не начатые → заблок. */
export const BUCKET_ORDER: Bucket[] = ["inProgress", "review", "done", "notStarted", "blocked"];

/** i18n-ключ подписи таба корзины. */
export const BUCKET_LABEL: Record<Bucket, string> = {
  inProgress: "tab.inProgress",
  review: "tab.review",
  done: "tab.done",
  notStarted: "tab.notStarted",
  blocked: "tab.blocked",
};

/** Цвет по статусу (сопоставление по ключевым словам — устойчиво к импортированным названиям). */
export function statusColor(status: string | undefined | null): string {
  const bucket = statusBucket(status);
  if (bucket === "done") return "#b9ff4b"; // зелёный
  if (bucket === "inProgress") return "#5b8def"; // синий
  if (bucket === "review") return "#e8b339"; // жёлтый
  if (bucket === "blocked") return "#ff5b5b"; // красный
  return "#8a8a8a"; // серый (not started)
}
