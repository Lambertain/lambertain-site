/**
 * Обогащение клиентских PR после gitflow-доставки (auto-deliver): то, что раньше проставлялось руками.
 * По просьбе разработчика клиента (ревьюит мультирепо-задачи):
 *  1) префикс «Trello #N ·» в заголовке PR (номер связанной Trello-карточки задачи);
 *  2) метка «бек+фронт» + перекрёстная ссылка (PAIR-LINK) в теле — когда ОДНА задача доставлена
 *     сразу в несколько репо (backend+frontend), чтобы ревьюить/сливать пары вместе.
 * Идемпотентно (сверяется с текущим состоянием PR) и best-effort: сбой обогащения не валит доставку,
 * но агрегируется и всплывает через reportTaskError у вызывающего.
 */
import { gh, ghJson } from "./deliver";
import { trelloCfg, cardIdFromText, trelloCardShort } from "./trello";
import { getBackend } from "./tasks";
import type { ProjectMeta } from "./tasks/types";
import type { GitflowDeliverResult } from "./sync-client";

const PAIR_LABEL = {
  name: "бек+фронт",
  color: "5319e7",
  description: "Задача у двох репо (backend+frontend) — ревʼю/злиття разом",
};
const PAIR_MARK = "<!-- PAIR-LINK -->";

/** Создать метку в репо, если её ещё нет (POST на существующую вернёт 422 — это ок). */
async function ensureLabel(repo: string): Promise<void> {
  await gh(`/repos/${repo}/labels`, { method: "POST", body: JSON.stringify(PAIR_LABEL) });
}

/**
 * Проставить на доставленных PR номер Trello и (для мультирепо-задач) метку + pair-link.
 * @param delivered результаты gitflow-доставки с открытыми PR (clientRepo + prNumber).
 */
export async function enrichDeliveredPRs(taskId: string, meta: ProjectMeta, delivered: GitflowDeliverResult[]): Promise<void> {
  const prs = delivered.filter((d): d is GitflowDeliverResult & { clientRepo: string; prNumber: number } => !!d.clientRepo && !!d.prNumber);
  if (!prs.length) return;

  // Номер Trello-карточки задачи (по ссылке trello.com/c/<id> в описании) — для префикса заголовка.
  let short: number | null = null;
  const cfg = trelloCfg(meta);
  if (cfg) {
    const task = await getBackend().getTask(taskId).catch(() => null);
    const cardId = task ? cardIdFromText(task.description || "") : null;
    if (cardId) short = await trelloCardShort(cfg, cardId).catch(() => null);
  }

  const isPair = prs.length >= 2; // одна задача → несколько репо (backend+frontend)
  if (isPair) await Promise.all(prs.map((p) => ensureLabel(p.clientRepo).catch(() => {})));

  const errors: string[] = [];
  for (const p of prs) {
    const repo = p.clientRepo, num = p.prNumber;
    try {
      const cur = await ghJson<{ title: string; body: string | null; labels: { name: string }[] }>(`/repos/${repo}/issues/${num}`);
      const patch: Record<string, string> = {};

      // 1) «Trello #N ·» в заголовок (только если номер известен и его там ещё нет).
      if (short) {
        const desired = `Trello #${short} · ${taskId}: ${p.branch}`;
        if (cur.title !== desired) patch.title = desired;
      }

      // 2) Pair-link в тело (только мультирепо и только если ещё не вставлен) — не затираем существующее.
      if (isPair && !(cur.body || "").includes(PAIR_MARK)) {
        const others = prs.filter((o) => o !== p).map((o) => `${o.clientRepo}#${o.prNumber}`).join(", ");
        patch.body = `${PAIR_MARK}\n> 🔗 **Парний PR (задача ${taskId}, backend+frontend):** ${others} — ревʼювати та зливати разом.\n\n${cur.body || ""}`;
      }

      if (Object.keys(patch).length) await gh(`/repos/${repo}/issues/${num}`, { method: "PATCH", body: JSON.stringify(patch) });

      // 3) Метка «бек+фронт» (мультирепо, если ещё не стоит).
      if (isPair && !cur.labels.some((l) => l.name === PAIR_LABEL.name)) {
        await gh(`/repos/${repo}/issues/${num}/labels`, { method: "POST", body: JSON.stringify({ labels: [PAIR_LABEL.name] }) });
      }
    } catch (e) {
      errors.push(`${repo}#${num}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
}
