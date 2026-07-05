/**
 * Создание задачи залогиненным пользователем портала (session-cookie), через fetch с клиента.
 * Почему роут, а не Server Action: ссылка на Server Action инвалидируется при новом деплое и Next
 * форсит перезагрузку страницы — клиент теряет загруженные скрины. URL роута деплой переживает,
 * поэтому отправка задачи никак не зависит от выкаток. Логика — общая (lib/task-intake).
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getPrincipal } from "@/lib/principal";
import { createRequestTaskCore } from "@/lib/task-intake";
import type { ReqBlock } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await getPrincipal();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  let body: { projectKey?: string; title?: string; blocks?: ReqBlock[]; recipient?: "admin" | "client" | "self" | "from_client"; internal?: boolean };
  try { body = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const projectKey = String(body.projectKey || "").trim();
  const title = String(body.title || "").trim();
  const blocks = Array.isArray(body.blocks) ? body.blocks : [];
  if (!projectKey || !title) return NextResponse.json({ error: "projectKey и title обязательны" }, { status: 400 });

  // Флаг internal из формы больше не влияет: задача от админа по умолчанию внутренняя (клиент не видит),
  // клиент-видимость дают только recipient client/from_client. Логика — в createRequestTaskCore.
  const res = await createRequestTaskCore(me, projectKey, title, blocks, body.recipient);
  if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res);
}
