/**
 * Терпимое к кодировке чтение JSON-тела запроса.
 *
 * Claude разработчика часто шлёт тело с кириллицей curl-ом на Windows. Если тело ушло инлайном (`-d`),
 * консоль Windows отдаёт байты в cp1251/cp866, а не UTF-8 — `req.json()` читает их как UTF-8 и получает
 * кракозябры (`�����`). Здесь читаем сырые байты: если UTF-8-декод дал символы-замены (U+FFFD), значит
 * это не UTF-8 — перечитываем теми же байтами как windows-1251 / cp866 и берём вариант без замен и с
 * максимумом кириллицы. Валидный UTF-8 никогда не содержит U+FFFD, поэтому исправный ввод не трогаем.
 */
function cyrillicCount(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0410 && c <= 0x044f) n++; // А-я
  }
  return n;
}

export async function readJsonSmart<T = unknown>(req: Request): Promise<T> {
  const buf = new Uint8Array(await req.arrayBuffer());
  let text = new TextDecoder("utf-8").decode(buf); // non-fatal: невалидные байты → U+FFFD
  if (text.includes("�")) {
    // Не UTF-8: подбираем однобайтовую кодировку (cp1251/cp866 не дают U+FFFD — выбираем по кириллице).
    let best = text;
    let bestScore = -1;
    for (const enc of ["windows-1251", "ibm866"]) {
      try {
        const dec = new TextDecoder(enc).decode(buf);
        if (dec.includes("�")) continue;
        const score = cyrillicCount(dec);
        if (score > bestScore) { bestScore = score; best = dec; }
      } catch { /* кодировка не поддержана рантаймом — пропускаем */ }
    }
    text = best;
  }
  return JSON.parse(text) as T;
}
