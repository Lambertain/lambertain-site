/** Протокол работы Claude Code разработчика с PM-порталом + маркер эскалации. */

/** Базовый URL портала (прод). */
export const PORTAL_BASE = "https://lambertain-site-production.up.railway.app";

/** Публичный (брендовый) домен сайта — для ссылок, которые отправляем клиентам. */
export const PUBLIC_SITE = "https://www.lambertain.site";

/** Маркер коммента-вопроса клиенту (эскалация) — по нему портал и Claude находят ожидающие вопросы. */
export const ESCALATION_MARK = "🟡 Вопрос:";

/** Markdown-блок с протоколом для CLAUDE.md дев-репо (между маркерами — для идемпотентной раскладки). */
export function protocolBlock(token: string, projectKey: string, base = PORTAL_BASE): string {
  return `<!-- LAMBERTAIN-PROTOCOL:START -->
## Протокол задач Lambertain (для Claude Code)

Проект ведётся в PM-портале Lambertain. Работай по протоколу, не дожидаясь, пока разработчик что-то настроит.

1. **Возьми задачу.** В начале сессии:
   - список: \`curl -s -H "Authorization: Bearer ${token}" "${base}/api/dev/tasks"\`
   - конкретная (спека + тред комментов): \`.../api/dev/tasks?id=${projectKey}-<N>\`
2. **Следуй спеке.** Технические развилки решай САМ разумным дефолтом по конвенциям этого репо — НЕ заставляй разработчика выбирать вариант.
3. **Вопрос клиенту — эскалируй сам** (а не спрашивай разработчика). ВАЖНО ПРО КОДИРОВКУ: тело с кириллицей передавай ТОЛЬКО через файл в UTF-8 — инлайн \`-d '...'\` ломает кодировку в консоли Windows (приходят кракозябры).
   - запиши тело в файл \`esc.json\` (UTF-8): \`{"taskId":"${projectKey}-<N>","question":"<твой вопрос>"}\` (для бизнес-вопроса добавь \`"kind":"admin"\`)
   - отправь: \`curl -s -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/json; charset=utf-8" --data-binary @esc.json "${base}/api/dev/escalate"\`
   Портал оформит вопрос клиенту от лица агентства и уведомит его в Telegram. Продолжай незаблокированные части.
4. **Перед продолжением перечитывай задачу** (\`?id=\`): \`awaitingClient: true\` — ещё ждём ответа; \`lastClientAnswer\` и тред комментариев — ответ клиента. Продолжай по нему.
5. **Продуктовое/бизнес-решение**, которое не вправе принять сам — эскалируй так же, добавив \`"kind":"admin"\` в тело (придёт Никите в портал/бот).

Токен проекта — ниже; в публичный код не коммитить.
Project: \`${projectKey}\` · Token: \`${token}\`
<!-- LAMBERTAIN-PROTOCOL:END -->`;
}
