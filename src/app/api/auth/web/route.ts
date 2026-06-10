/**
 * Вход в веб по одноразовому токену из Mini App (мостик апка → браузер).
 * GET /api/auth/web?token=... -> ставит сессию и редиректит в /admin.
 * Публичный хост берём из заголовков прокси (на Railway req.url = внутренний localhost:PORT).
 */
import { NextResponse } from "next/server";
import { consumeWebLoginToken } from "@/lib/db";
import { setSession } from "@/lib/auth";

function publicBase(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  let host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (!host || host.includes("localhost") || host.includes("127.0.0.1")) {
    host = "www.lambertain.site";
  }
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const base = publicBase(req);
  const tgId = token ? await consumeWebLoginToken(token) : null;
  if (!tgId) {
    return NextResponse.redirect(`${base}/admin/login?e=expired`);
  }
  await setSession(`tg:${tgId}`);
  return NextResponse.redirect(`${base}/admin`);
}
