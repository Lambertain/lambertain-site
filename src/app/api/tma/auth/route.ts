/**
 * Авторизация Telegram Mini App. ВРЕМЕННО с диагностикой подписи.
 */
import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { validateInitData } from "@/lib/telegram-auth";
import { redeemInvite } from "@/lib/invites";
import { setSession } from "@/lib/auth";
import { getLinkByTgId } from "@/lib/db";

function diag(initData: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const params = new URLSearchParams(initData);
  const recv = params.get("hash") || "";
  params.delete("hash");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const withSig = createHmac("sha256", secret)
    .update([...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n"))
    .digest("hex");
  params.delete("signature");
  const noSig = createHmac("sha256", secret)
    .update([...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n"))
    .digest("hex");
  console.log("TMA-DIAG", JSON.stringify({
    tokenId: token.split(":")[0],
    len: initData.length,
    keys: [...new URLSearchParams(initData).keys()],
    recv: recv.slice(0, 12),
    withSig: withSig.slice(0, 12),
    noSig: noSig.slice(0, 12),
    matchWithSig: withSig === recv,
    matchNoSig: noSig === recv,
  }));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { initData?: string };
  if (body.initData) {
    try { diag(body.initData); } catch (e) { console.log("TMA-DIAG-ERR", String(e)); }
  }

  const result = validateInitData(body.initData || "");
  if (!result) {
    return NextResponse.json({ ok: false, error: "invalid initData" }, { status: 401 });
  }

  const { user, startParam } = result;
  const adminId = process.env.ADMIN_TELEGRAM_ID ? Number(process.env.ADMIN_TELEGRAM_ID) : null;
  if (startParam) await redeemInvite(startParam, user);

  let role: string | null = null;
  if (adminId && user.id === adminId) role = "admin";
  else role = (await getLinkByTgId(user.id))?.role ?? null;

  if (!role) {
    return NextResponse.json({
      ok: false,
      needRole: true,
      user: { id: user.id, firstName: user.firstName, username: user.username },
    });
  }

  await setSession(`tg:${user.id}`);
  return NextResponse.json({ ok: true, role });
}
