/**
 * Серверное определение локали: кука `locale` (если выставлена) -> Accept-Language.
 * Для server components.
 */
import { cookies, headers } from "next/headers";
import { type Locale, normalizeLocale, localeFromAcceptLanguage } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const cookieLoc = normalizeLocale((await cookies()).get("locale")?.value);
  if (cookieLoc) return cookieLoc;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}
