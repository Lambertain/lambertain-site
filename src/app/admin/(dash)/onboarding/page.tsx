import { requireAdmin } from "@/lib/principal";
import { getOnboarding } from "@/lib/db";
import { PORTAL_BASE } from "@/lib/dev-protocol";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { ui } from "../../ui-styles";
import { OnboardingEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function OnboardingAdminPage() {
  await requireAdmin();
  const locale = await getLocale();
  const { steps } = await getOnboarding();

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "onb.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "onb.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 620 }}>{t(locale, "onb.hint")}</p>
      <OnboardingEditor initial={steps} publicUrl={`${PORTAL_BASE}/onboarding`} locale={locale} />
    </div>
  );
}
