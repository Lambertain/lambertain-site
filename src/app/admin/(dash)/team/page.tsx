import { requireAdmin } from "@/lib/principal";
import { listAccessRequests } from "@/lib/db";
import { getBackend } from "@/lib/tasks";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { InviteForm } from "./invite-form";
import { AccessRequests } from "./requests";
import { ui } from "../../ui-styles";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireAdmin();
  const locale = await getLocale();
  const [requests, projects] = await Promise.all([listAccessRequests(), getBackend().listProjects()]);
  const projOpts = projects.map((p) => ({ key: p.key, name: p.name }));
  const reqs = requests.map((r) => ({
    tg_id: r.tg_id,
    username: r.username,
    full_name: r.full_name,
    requested_role: r.requested_role,
  }));

  return (
    <div>
      <div style={ui.monoLabel}>{t(locale, "team.kicker")}</div>
      <h1 style={{ ...ui.h1, marginTop: 8 }}>{t(locale, "team.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, maxWidth: 560 }}>{t(locale, "team.hint")}</p>

      <AccessRequests requests={reqs} projects={projOpts} locale={locale} />

      <div style={{ marginTop: 28 }}>
        <div style={ui.monoLabel}>{t(locale, "team.inviteKicker")}</div>
        <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8 }}>{t(locale, "team.inviteTitle")}</h2>
        <InviteForm projects={projOpts} locale={locale} />
      </div>
    </div>
  );
}
