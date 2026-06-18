/**
 * Управление аккаунтами входа проекта (meta.prodAccounts / meta.devAccounts) — для Claude/скриптов, без сессии.
 * POST /api/admin/project/accounts
 *   { projectKey, env: "prod"|"dev", accounts: [{login?,pass?,note?}], mode?: "append"|"replace", deleteSecretIds?: number[] }
 * accounts добавляются (append, по умолчанию) или заменяют (replace) prod/dev-аккаунты. deleteSecretIds — убрать
 * перенесённые записи из «Секрети та доступи» (только секреты ЭТОГО проекта). Авторизация: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getProjectFull, setProjectMeta, listSecrets, deleteSecret } from "@/lib/db";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

type Account = { login?: string; pass?: string; note?: string };

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let body: { projectKey?: string; env?: string; accounts?: Account[]; mode?: string; deleteSecretIds?: number[]; clearCredentials?: boolean };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const projectKey = String(body.projectKey || "").trim();
  const env = body.env === "prod" ? "prod" : body.env === "dev" ? "dev" : null;
  if (!projectKey) return NextResponse.json({ error: "projectKey required" }, { status: 400 });
  if (!env) return NextResponse.json({ error: "env: prod|dev" }, { status: 400 });

  const proj = await getProjectFull(projectKey);
  if (!proj) return NextResponse.json({ error: `project ${projectKey} not found` }, { status: 404 });

  const incoming = (Array.isArray(body.accounts) ? body.accounts : [])
    .map((a) => ({ login: a.login?.trim() || undefined, pass: a.pass?.trim() || undefined, note: a.note?.trim() || undefined }))
    .filter((a) => a.login || a.pass || a.note);

  const field = env === "prod" ? "prodAccounts" : "devAccounts";
  const existing = (env === "prod" ? proj.meta.prodAccounts : proj.meta.devAccounts) ?? [];
  const next = body.mode === "replace" ? incoming : [...existing, ...incoming];
  const metaUpd = { ...proj.meta, [field]: next.length ? next : undefined };
  if (body.clearCredentials) metaUpd.credentials = undefined; // legacy m.credentials больше не используется
  await setProjectMeta(projectKey, proj.name, metaUpd);

  // Удалить перенесённые секреты — только принадлежащие этому проекту.
  let deleted = 0;
  if (Array.isArray(body.deleteSecretIds) && body.deleteSecretIds.length) {
    const own = new Set((await listSecrets(projectKey)).map((s) => s.id));
    for (const id of body.deleteSecretIds) {
      if (own.has(Number(id))) { await deleteSecret(Number(id)); deleted++; }
    }
  }

  return NextResponse.json({ ok: true, projectKey, env, accounts: next.length, secretsDeleted: deleted });
}
