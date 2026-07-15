/**
 * Бэкфилл классификации «клиент может проверить сам» (client_verifiable) по существующим задачам + починка
 * уже стоящих на клиентском ревью внутренних/технических задач (переводим их в Done, чтобы клиент не принимал
 * то, чего не видит). Новые задачи классифицируются на kickoff; этот эндпоинт — для уже заведённых.
 *
 * POST /api/admin/classify-verifiable
 *   { projectKey?, dryRun?, reclassify?, moveReviewToDone? }
 *   projectKey       — один проект; без него — ВСЕ проекты.
 *   reclassify:true  — переклассифицировать и уже помеченные (иначе только client_verifiable IS NULL).
 *   moveReviewToDone — по умолчанию true: неверифицируемые (false) клиентские задачи из Review → Done.
 *   dryRun:true      — только классифицировать и показать, что БУДЕТ сделано; ничего не писать.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { getBackend } from "@/lib/tasks";
import { setTaskClientVerifiable } from "@/lib/db";
import { classifyClientVerifiable, type VerifiableItem } from "@/lib/verifiable";
import { statusBucket } from "@/lib/statuses";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { projectKey?: string; dryRun?: boolean; reclassify?: boolean; moveReviewToDone?: boolean } = {};
  try { b = await readJsonSmart(req); } catch { /* тело необязательно */ }
  const dryRun = b?.dryRun === true;
  const reclassify = b?.reclassify === true;
  const moveReviewToDone = b?.moveReviewToDone !== false; // по умолчанию true

  const be = getBackend();
  const projectKey = String(b?.projectKey || "").trim();
  const keys = projectKey ? [projectKey] : (await be.listProjects()).map((p) => p.key);

  // Собираем НЕзакрытые задачи всех нужных проектов (Done переклассифицировать не нужно — уже приняты).
  const all = [];
  for (const key of keys) {
    const tasks = await be.listTasks({ projectKey: key, unresolvedOnly: true, limit: 500 });
    all.push(...tasks);
  }
  // Кого классифицировать: с пустым флагом (или все при reclassify).
  const toClassify = all.filter((t) => reclassify || t.clientVerifiable == null);
  const items: VerifiableItem[] = toClassify.map((t) => ({ id: t.id, summary: t.summary, description: t.description }));
  const verdicts = items.length ? await classifyClientVerifiable(items) : new Map<string, boolean>();

  // Эффективный флаг для каждой задачи (после классификации): из вердикта или уже стоявший.
  const effVerifiable = (id: string, prev: boolean | null | undefined): boolean =>
    verdicts.has(id) ? verdicts.get(id)! : prev !== false;

  let setTrue = 0, setFalse = 0;
  const moved: string[] = [];
  const wouldMove: string[] = [];

  for (const t of all) {
    const v = effVerifiable(t.id, t.clientVerifiable);
    // 1) Записать флаг (только тем, кого классифицировали в этот проход).
    if (verdicts.has(t.id)) {
      if (v) setTrue++; else setFalse++;
      if (!dryRun) await setTaskClientVerifiable(t.id, v);
    }
    // 2) Неверифицируемая клиентская задача, застрявшая на ревью → в Done (клиент её проверить не может).
    if (moveReviewToDone && !v && statusBucket(t.state) === "review" && t.reporter?.role === "client") {
      wouldMove.push(t.id);
      if (!dryRun) {
        await be.updateStatus(t.id, "Done", { actorRole: "system", trigger: "авто-готово: внутрішня/технічна задача (клієнт не перевіряє)" });
        moved.push(t.id);
      }
    }
  }

  if (!dryRun) { revalidatePath("/admin"); revalidatePath("/admin/tasks"); }
  return NextResponse.json({
    ok: true, dryRun, projects: keys.length, scanned: all.length, classified: items.length,
    verifiableTrue: setTrue, verifiableFalse: setFalse,
    reviewToDone: dryRun ? wouldMove : moved,
  });
}
