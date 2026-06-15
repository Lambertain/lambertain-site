import { requireAdmin } from "@/lib/principal";
import { listContracts, listContractors, listTemplates } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { ui } from "../../ui-styles";
import { ContractsView } from "./contracts-view";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const [contracts, contractors, templates] = await Promise.all([
    listContracts(),
    listContractors(),
    listTemplates(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "contracts.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "contracts.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 620 }}>{t(locale, "contracts.hint")}</p>

      <ContractsView
        contracts={contracts.map((c) => ({ id: c.id, number: c.number, title: c.title, date: c.contract_date, createdAt: c.created_at }))}
        contractors={contractors}
        templates={templates}
        today={today}
      />
    </div>
  );
}
