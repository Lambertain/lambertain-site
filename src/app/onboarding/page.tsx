import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/principal";
import { getOnboarding, getOnboardingValues } from "@/lib/db";
import { OnboardingAccordion } from "./accordion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lambertain — інструкція з підключення",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const me = await getPrincipal();
  if (!me) redirect("/admin/login");

  const { steps } = await getOnboarding();
  const isClient = me.role === "client" && !!me.projectKey;
  const values = isClient ? await getOnboardingValues(me.projectKey!) : undefined;

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)", padding: "clamp(24px,6vw,56px) 18px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href="/admin" style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", textDecoration: "none", display: "inline-block", marginBottom: 18 }}>
          ← На портал
        </Link>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 26, letterSpacing: "0.08em" }}>
          LAMB<span style={{ color: "var(--accent)" }}>.</span>
        </div>
        <h1 style={{ fontSize: "clamp(24px,5vw,34px)", fontWeight: 700, marginTop: 14, lineHeight: 1.2 }}>
          Інструкція з підключення
        </h1>
        <p style={{ fontSize: 15, color: "var(--muted)", marginTop: 10, lineHeight: 1.6, maxWidth: 560 }}>
          Кілька простих кроків, щоб запустити ваш проєкт. Виконуйте їх по черзі — на деяких кроках
          потрібно вставити дані (посилання, токен), вони збережуться автоматично. Якщо щось незрозуміло, напишіть мені.
        </p>

        <div style={{ marginTop: 28 }}>
          {steps.length > 0 ? (
            <OnboardingAccordion steps={steps} editable={isClient} values={values} />
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>Інструкція готується.</p>
          )}
        </div>
      </div>
    </main>
  );
}
