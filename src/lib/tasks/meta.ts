import { parse } from "yaml";
import type { ProjectMeta } from "./types";

/**
 * Извлекает YAML-блок из описания проекта и парсит в ProjectMeta.
 * Описание имеет вид:
 *   ```yaml
 *   repositories: ...
 *   ```
 * Пустое/битое описание -> {}.
 */
export function parseProjectMeta(description: string | null | undefined): ProjectMeta {
  if (!description) return {};
  const m = description.match(/```ya?ml\s*([\s\S]*?)```/i);
  const raw = m ? m[1] : description;
  let doc: Record<string, unknown>;
  try {
    doc = (parse(raw) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
  if (!doc || typeof doc !== "object") return {};

  const repos = (doc.repositories ?? {}) as Record<string, unknown>;
  const apps = (doc.apps ?? {}) as Record<string, unknown>;
  const deploy = (doc.deploy ?? {}) as Record<string, unknown>;
  const creds = Array.isArray(doc.credentials) ? doc.credentials : [];

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

  const appPart = (v: unknown): { url?: string; host: "client" | "mine" | "" } => {
    const o = (v ?? {}) as Record<string, unknown>;
    const h = str(o.host);
    const host: "client" | "mine" | "" = h === "client" || h === "mine" ? h : "";
    return { url: str(o.url), host };
  };

  return {
    clientGit: str(repos.client_git),
    devGit: str(repos.dev_git),
    localPath: str(repos.local_path),
    apps: { prod: appPart(apps.prod), dev: appPart(apps.dev) },
    credentials: creds
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .map((c) => ({
        role: str(c.role),
        env: str(c.env),
        login: str(c.login),
        pass: str(c.pass),
      }))
      .filter((c) => c.login || c.role),
    design: str(doc.design),
    deploy: { prodBranch: str(deploy.prod_branch), devBranch: str(deploy.dev_branch) },
  };
}
