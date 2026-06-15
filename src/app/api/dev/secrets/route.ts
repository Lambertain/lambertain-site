/**
 * Секреты/доступы проекта для Claude разработчика (токены, логины, ключи, которые дал клиент/владелец).
 * GET /api/dev/secrets — список секретов проекта (использовать в коде/конфиге; в публичный код НЕ коммитить).
 * Человеку-разработчику секреты в портале НЕ показываются — только его Claude-коду здесь.
 * Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, listSecrets } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function GET(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  const secrets = await listSecrets(projectKey);
  return NextResponse.json({
    project: projectKey,
    note: "Доступы проекта (от клиента/владельца). Использовать в env/конфиге; в публичный код НЕ коммитить.",
    secrets: secrets.map((s) => ({ name: s.name, value: s.value, env: s.env, note: s.note })),
  });
}
