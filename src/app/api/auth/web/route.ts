/**
 * Вход в веб по одноразовому токену из Mini App (мостик апка → браузер).
 * GET /api/auth/web?token=... -> ставит сессию и редиректит в /admin.
 */
import { NextResponse } from "next/server";
import { consumeWebLoginToken } from "@/lib/db";
import { setSession } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const tgId = token ? await consumeWebLoginToken(token) : null;
  if (!tgId) {
    return NextResponse.redirect(new URL("/admin/login?e=expired", url.origin));
  }
  await setSession(`tg:${tgId}`);
  return NextResponse.redirect(new URL("/admin", url.origin));
}
