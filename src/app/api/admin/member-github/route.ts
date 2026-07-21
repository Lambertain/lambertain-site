/**
 * Привязать GitHub-логин к участнику портала — чтобы его комменты под клиентскими PR (код-ревью)
 * при зеркалировании из GitHub атрибутировались его же учётке на портале, а не анонимному «Lambertain».
 * POST /api/admin/member-github  { login, githubLogin }   githubLogin="" — очистить привязку.
 * Авторизация: Authorization: Bearer <ADMIN_API_TOKEN>.
 */
import { NextResponse } from "next/server";
import { readJsonSmart } from "@/lib/req-body";
import { setMemberGithubLogin } from "@/lib/db";
import { revalidatePath } from "next/cache";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (bearer(req) !== expected) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  let b: { login?: string; githubLogin?: string };
  try { b = await readJsonSmart(req); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const login = String(b.login || "").trim();
  const githubLogin = String(b.githubLogin ?? "").trim();
  if (!login) return NextResponse.json({ error: "login обязателен" }, { status: 400 });

  const ok = await setMemberGithubLogin(login, githubLogin || null);
  if (!ok) return NextResponse.json({ error: `участник ${login} не найден` }, { status: 404 });
  revalidatePath("/admin/team");
  return NextResponse.json({ ok: true, login, githubLogin: githubLogin || null });
}
