/** Отправка сообщения в произвольный чат Telegram. Server-side only. */
export async function sendTo(chatId: number | string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch {
    // best-effort
  }
}

/** Уведомление админу (Никите). */
export async function notifyAdmin(text: string): Promise<void> {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (chat) await sendTo(chat, text);
}
