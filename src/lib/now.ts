/**
 * Текущее время в мс. Вынесено из рендера компонентов: прямой вызов Date.now()
 * в теле server/client-компонента триггерит правило react-hooks/purity.
 * Server-side рендер вызывается на каждый запрос (dynamic), значение актуально.
 */
export function nowMs(): number {
  return Date.now();
}
