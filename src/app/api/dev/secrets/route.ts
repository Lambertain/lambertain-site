/**
 * Секреты/доступы проекта для Claude разработчика (токены, логины, ключи от клиента/владельца).
 * GET /api/dev/secrets — использовать в коде/конфиге; в публичный код НЕ коммитить. Только Claude-коду (не человеку).
 * Источник — поля проекта, помеченные «видно разрабу» (реестр: railway/vercel/соцсети/доступы + аккаунты входа),
 * плюс legacy project_secrets. Авторизация: Authorization: Bearer <project_token>
 */
import { NextResponse } from "next/server";
import { getProjectKeyByToken, listSecrets, getProjectFull } from "@/lib/db";
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
