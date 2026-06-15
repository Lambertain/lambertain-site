import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getInstructionSetByToken } from "@/lib/db";
import { Markdown } from "../../admin/(dash)/markdown";
import { ui } from "../../admin/ui-styles";

export const dynamic = "force-dynamic";
// Не индексируем — это материал «по ссылке», не для поиска.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicInstructions({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const set = await getInstructionSetByToken(token);
  if (!set) notFound();

  return (
    <div style={{ ...ui.page, minHeight: "100vh", padding: "40px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "0.08em", color: "var(--text)", marginBottom: 28 }}>
          LAMB<span style={{ color: "var(--accent)" }}>.</span>
        </div>

        {set.title && <h1 style={{ ...ui.h1, fontSize: "clamp(24px, 6vw, 34px)", marginBottom: 24 }}>{set.title}</h1>}

        {set.guides.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 15 }}>Інструкція поки порожня.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {set.guides.map((g) => (
              <section key={g.id} style={{ ...ui.card, padding: 22 }}>
                <h2 style={{ fontSize: 19, margin: "0 0 12px", color: "var(--text)" }}>{g.title}</h2>
                <Markdown>{g.body}</Markdown>
              </section>
            ))}
          </div>
        )}

        <div style={{ ...ui.monoLabel, marginTop: 36, color: "var(--muted)" }}>
          Lambertain · <a href="https://www.lambertain.site" style={{ color: "var(--accent)", textDecoration: "none" }}>lambertain.site</a>
        </div>
      </div>
    </div>
  );
}
