/**
 * Мінімальний клієнт Google Sheets для авто-обліку задач (без npm-залежностей).
 * Аутентифікація — сервіс-акаунт (env GOOGLE_SA_JSON), JWT RS256 підписуємо через node:crypto,
 * обмінюємо на access_token. Пишемо ЛИШЕ значення (values) — форматування таблиці (шапка/фільтр/
 * ширини/заморозка) виставлене один раз вручну і переживає оновлення значень, тож його не чіпаємо.
 */
import crypto from "node:crypto";

let cached: { token: string; exp: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) throw new Error("GOOGLE_SA_JSON не заданий");
  const sa = JSON.parse(raw) as { client_email: string; private_key: string };
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${b64url(signer.sign(sa.private_key))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`google token ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return cached.token;
}

/**
 * Перезаписати перший аркуш таблиці значеннями `values` (A1 від лівого верху) + позначку часу в I1.
 * Форматування не чіпаємо. Спершу чистимо широкий діапазон, щоб не лишалось «хвостів» від довшої версії.
 */
export async function writeSheetValues(spreadsheetId: string, values: (string | number)[][], stamp?: string): Promise<void> {
  const token = await accessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  await fetch(`${base}/values/A1:Z1000:clear`, { method: "POST", headers });
  const put = await fetch(`${base}/values/A1?valueInputOption=USER_ENTERED`, {
    method: "PUT", headers: jsonHeaders, body: JSON.stringify({ values }),
  });
  if (!put.ok) throw new Error(`sheets update ${put.status}: ${(await put.text()).slice(0, 200)}`);
  if (stamp) {
    await fetch(`${base}/values/I1?valueInputOption=USER_ENTERED`, {
      method: "PUT", headers: jsonHeaders, body: JSON.stringify({ values: [[`Оновлено автоматично: ${stamp}`]] }),
    }).catch(() => {});
  }
}
