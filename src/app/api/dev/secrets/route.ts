/**
 * Секреты/доступы проекта для Claude разработчика (токены, логины, ключи от клиента/владельца).
 * GET  /api/dev/secrets — читать доступы; использовать в коде/конфиге; в публичный код НЕ коммитить.
 * POST /api/dev/secrets — разработчик САМ задаёт Dev URL и dev-аккаунты входа (staging он же и разворачивает).
 *   { devUrl?: string|null, devAccounts?: [{login?,pass?,note?}], accountsMode?: "append"|"replace" }
 *   Скоуп ограничен dev-стороной: prod URL/аккаунты и прочие поля через этот эндпоинт НЕ трогаются.
 * Источник GET — поля проекта, помеченные «видно разрабу» (реестр: railway/vercel/соцсети/доступы + аккаунты входа),
 * плюс legacy project_secrets. Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, listSecrets, getProjectFull, setProjectMeta } from "@/lib/db";
import { readJsonSmart } from "@/lib/req-body";
import { fieldVisible } from "@/lib/field-visibility";
import { getFieldDef } from "@/lib/project-fields";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

const hasVals = (o: Record<string, unknown> | undefined | null) => !!o && Object.values(o).some(Boolean);

export async function GET(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  const [legacy, proj] = await Promise.all([listSecrets(projectKey), getProjectFull(projectKey)]);
  const meta = proj?.meta ?? {};
  const out: Array<{ name: string; value: string; env?: string | null; note?: string | null }> = [];

  // 1) Legacy-секреты (project_secrets) — пока есть.
  for (const s of legacy) out.push({ name: s.name, value: s.value ?? "", env: s.env, note: s.note });

  // 2) Поля реестра, помеченные «видно разрабу» (включая backed railway/vercel из clientDeploy/clientVercel).
  const enabled = new Set<string>([
    ...(meta.enabledFields ?? []),
    ...(hasVals(meta.clientDeploy) ? ["railway"] : []),
    ...(hasVals(meta.clientVercel) ? ["vercel"] : []),
  ]);
  for (const key of enabled) {
    if (!fieldVisible(meta.fieldVisibility, key, true)) continue;
    const def = getFieldDef(key);
    if (!def) continue;
    const vals = def.backed === "clientDeploy" ? (meta.clientDeploy as Record<string, string> | undefined)
      : def.backed === "clientVercel" ? (meta.clientVercel as Record<string, string> | undefined)
      : meta.customFields?.[key];
    for (const sub of def.subs) {
      const v = vals?.[sub.key];
      if (v) out.push({ name: `${def.label.uk} · ${sub.label.uk}`, value: String(v) });
    }
  }

  // 3) Аккаунты входа (prod/dev), помеченные «видно разрабу».
  const acc = (env: "prod" | "dev", rows: Array<{ login?: string; pass?: string; note?: string }> | undefined) => {
    if (!fieldVisible(meta.fieldVisibility, env === "prod" ? "prodAccounts" : "devAccounts", true)) return;
    for (const a of rows ?? []) {
      const value = [a.login, a.pass].filter(Boolean).join(" / ");
      if (value || a.note) out.push({ name: `Вхід (${env})${a.note ? ` · ${a.note}` : ""}`, value, env });
    }
  };
  acc("prod", meta.prodAccounts);
  acc("dev", meta.devAccounts);

  return NextResponse.json({
    project: projectKey,
    note: "Доступы проекта (от клиента/владельца). Использовать в env/конфиге; в публичный код НЕ коммитить.",
    secrets: out,
  });
}

type Account = { login?: string; pass?: string; note?: string };

/** Разработчик задаёт Dev URL и dev-аккаунты входа сам (он разворачивает staging и заводит тестовые аккаунты). */
export async function POST(req: Request) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const projectKey = await getProjectKeyByToken(token);
  if (!projectKey) return NextResponse.json({ error: "invalid token" }, { status: 403 });

  let body: { devUrl?: string | null; devAccounts?: Account[]; accountsMode?: string };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const proj = await getProjectFull(projectKey);
  if (!proj) return NextResponse.json({ error: `project ${projectKey} not found` }, { status: 404 });
  const meta = { ...proj.meta };

  // Dev URL → meta.apps.dev.url (host сохраняем). devUrl:null/"" — очистить.
  if (body.devUrl !== undefined) {
    const url = (body.devUrl ?? "").trim() || undefined;
    meta.apps = { ...meta.apps, dev: { ...(meta.apps?.dev ?? {}), url } };
  }

  // Dev-аккаунты входа — добавить (append, по умолчанию) или заменить (replace).
  if (Array.isArray(body.devAccounts)) {
    const incoming = body.devAccounts
      .map((a) => ({ login: a.login?.trim() || undefined, pass: a.pass?.trim() || undefined, note: a.note?.trim() || undefined }))
      .filter((a) => a.login || a.pass || a.note);
    const existing = meta.devAccounts ?? [];
    const next = body.accountsMode === "replace" ? incoming : [...existing, ...incoming];
    meta.devAccounts = next.length ? next : undefined;
  }

  await setProjectMeta(projectKey, proj.name, meta);
  return NextResponse.json({ ok: true, project: projectKey, devUrl: meta.apps?.dev?.url ?? null, devAccounts: meta.devAccounts?.length ?? 0 });
}
