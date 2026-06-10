import { redirect } from "next/navigation";
import { getBackend } from "@/lib/tasks";
import { getPrincipal } from "@/lib/principal";
import { visibleProjects } from "@/lib/scope";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { ChatIntake } from "./chat-intake";
import { ui } from "../ui-styles";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const me = await getPrincipal();
  if (!me) redirect("/admin/login");
  const be = getBackend();
  const locale = await getLocale();
  const all = await be.listProjects();
  const projects = visibleProjects(me, all);
  return (
    <div>
      <h1 style={{ ...ui.h1, fontSize: "clamp(22px,5vw,30px)" }}>{t(locale, "newtask.title")}</h1>
      <ChatIntake locale={locale} projects={projects.map((p) => ({ key: p.key, name: p.name }))} />
    </div>
  );
}
