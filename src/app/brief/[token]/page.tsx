import { getBriefByToken } from "@/lib/db";
import { BriefForm } from "./brief-form";
import { ui } from "../../admin/ui-styles";

export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const brief = await getBriefByToken(token);

  if (!brief) {
    return (
      <div style={{ ...ui.page, display: "grid", placeItems: "center", padding: 24 }}>
        <p style={{ color: "var(--muted)", fontSize: 15 }}>Бриф не знайдено / Бриф не найден.</p>
      </div>
    );
  }
  if (brief.status === "submitted") {
    return (
      <div style={{ ...ui.page, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ ...ui.card, textAlign: "center", maxWidth: 480, padding: 32 }}>
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>Дякую! Бриф вже надіслано.<br />Спасибо! Бриф уже отправлен.</p>
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...ui.page, minHeight: "100dvh" }}>
      <BriefForm token={token} />
    </div>
  );
}
