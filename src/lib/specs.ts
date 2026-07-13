/**
 * Доступ к спекам проекта. Проект может иметь несколько спек (по модулям/фазам) в `meta.specs[]` —
 * добавление новой не дописывается в существующую и не раздувает её. Легаси-одиночная спека — в `meta.spec`.
 * Чистые функции (без БД): используются и в server-роутах, и в UI-серверных компонентах.
 */
import type { ProjectMeta, ProjectSpec } from "./tasks/types";

type SpecMeta = Pick<ProjectMeta, "specs" | "spec">;

/** Нормализованный список спек проекта: из `specs[]` (по order), иначе легаси `spec` как одна запись `main`. */
export function listSpecs(meta: SpecMeta | null | undefined): ProjectSpec[] {
  if (meta?.specs?.length) return [...meta.specs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const legacy = (meta?.spec || "").trim();
  return legacy ? [{ key: "main", title: "Спека проєкту", body: meta!.spec as string, order: 0 }] : [];
}

/** Одна спека по ключу (или null). */
export function getSpec(meta: SpecMeta | null | undefined, key: string): ProjectSpec | null {
  return listSpecs(meta).find((s) => s.key === key) ?? null;
}

/** Полный текст всех спек — общий контекст для разработчика/классификаторов (dev-API projectSpec). */
export function projectSpecText(meta: SpecMeta | null | undefined): string {
  const specs = listSpecs(meta);
  if (!specs.length) return "";
  if (specs.length === 1 && specs[0].key === "main") return specs[0].body; // легаси — без заголовка
  return specs.map((s) => `# ${s.title}\n\n${s.body.trim()}`).join("\n\n---\n\n");
}

/** slug из заголовка/ключа (латиница+кириллица, дефисы). */
export function specSlug(s: string): string {
  const base = s.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґё]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return base || "spec";
}

/**
 * Upsert спеки в meta по ключу. Легаси одиночную `spec` при первом добавлении переносим в `specs[]`
 * (единый источник правды). Возвращает НОВЫЙ meta.
 */
export function upsertSpec(meta: ProjectMeta, spec: { key?: string; title: string; body: string; order?: number }, now: string): ProjectMeta {
  let specs: ProjectSpec[] = meta.specs ? [...meta.specs] : [];
  if (!specs.length && (meta.spec || "").trim()) specs = [{ key: "main", title: "Спека проєкту", body: meta.spec as string, order: 0 }];
  const key = spec.key?.trim() || specSlug(spec.title);
  const idx = specs.findIndex((s) => s.key === key);
  const nextOrder = spec.order ?? (idx >= 0 ? specs[idx].order : specs.reduce((mx, s) => Math.max(mx, s.order ?? 0), -1) + 1);
  const entry: ProjectSpec = { key, title: spec.title.trim() || key, body: spec.body, order: nextOrder, updatedAt: now };
  if (idx >= 0) specs[idx] = entry; else specs.push(entry);
  const next = { ...meta, specs } as ProjectMeta;
  delete next.spec; // всё теперь в specs[]
  return next;
}

/** Удалить спеку по ключу. Возвращает НОВЫЙ meta. */
export function removeSpec(meta: ProjectMeta, key: string): ProjectMeta {
  // Легаси: удаляют единственную `main` при отсутствии specs[] — чистим и spec.
  if (!meta.specs?.length) {
    if (key === "main") { const n = { ...meta } as ProjectMeta; delete n.spec; return n; }
    return meta;
  }
  const specs = meta.specs.filter((s) => s.key !== key);
  const next = { ...meta } as ProjectMeta;
  if (specs.length) next.specs = specs; else delete next.specs;
  return next;
}
