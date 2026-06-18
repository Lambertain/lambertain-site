/**
 * Видимость полей карточки проекта «Детали и доступы» по ролям смотрящего.
 * Один источник для формы настроек (чекбоксы) и для самой карточки (рендер).
 */
export type FieldVis = { client?: boolean; dev?: boolean };

/** Поля карточки + дефолтная видимость = текущее поведение ДО ручной настройки (чтобы ничего не сломать). */
export const FIELD_VIS_DEFAULTS: Record<string, { client: boolean; dev: boolean }> = {
  prodUrl: { client: true, dev: true },
  devUrl: { client: false, dev: true },
  design: { client: true, dev: true },
  devInfo: { client: false, dev: true },
  spec: { client: false, dev: true },
  accounts: { client: true, dev: true },
  prodAccounts: { client: true, dev: true },
  devAccounts: { client: false, dev: true },
  railway: { client: false, dev: true },
  vercel: { client: false, dev: true },
};

export const FIELD_VIS_ORDER = ["prodUrl", "devUrl", "design", "devInfo", "spec", "accounts"] as const;
export type VisField = (typeof FIELD_VIS_ORDER)[number];

/** Видно ли поле смотрящему. viewerDev=true → разработчик/админ; иначе клиент/сотрудник. */
export function fieldVisible(vis: Record<string, FieldVis> | undefined, field: string, viewerDev: boolean): boolean {
  const d = FIELD_VIS_DEFAULTS[field] ?? { client: true, dev: true };
  const v = (vis || {})[field] || {};
  const val = viewerDev ? v.dev : v.client;
  return val === undefined ? (viewerDev ? d.dev : d.client) : val;
}
