import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/principal";
import { getContract } from "@/lib/db";
import { ui } from "../../../ui-styles";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/** Inline-разметка: **жирный** → <strong>. */
function renderInline(line: string, keyBase: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong>
      : <span key={`${keyBase}-${i}`}>{p}</span>,
  );
}

/** Простой рендер тела договора: # заголовок, ## секция, пустая строка — отступ, прочее — абзац. */
function DocBody({ body }: { body: string }) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  return (
    <>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (line.startsWith("# ")) return <h1 key={i} style={{ fontSize: 19, textAlign: "center", margin: "0 0 4px", lineHeight: 1.3 }}>{renderInline(line.slice(2), `l${i}`)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} style={{ fontSize: 14, fontWeight: 700, textAlign: line.includes("про надання") ? "center" : "left", margin: "14px 0 6px", textTransform: line.includes("про надання") ? "none" : undefined }}>{renderInline(line.slice(3), `l${i}`)}</h2>;
        if (line === "") return <div key={i} style={{ height: 8 }} />;
        return <div key={i} style={{ margin: "2px 0" }}>{renderInline(line, `l${i}`)}</div>;
      })}
    </>
  );
}

export default async function ContractView({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const contract = await getContract(Number(id));
  if (!contract) notFound();

  return (
    <div>
      <style>{`
        @media print {
          .pm-nav, .no-print { display: none !important; }
          .pm-main { overflow: visible !important; padding: 0 !important; }
          html, body { background: #fff !important; }
          .contract-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
        }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <Link href="/admin/contracts" style={{ ...ui.btn, textDecoration: "none" }}>← До списку</Link>
        <PrintButton />
        <span style={{ ...ui.monoLabel, textTransform: "none" }}>{contract.title || "Договір"}</span>
      </div>

      <div
        className="contract-sheet"
        style={{
          maxWidth: 820, margin: "0 auto", background: "#fff", color: "#111",
          padding: "48px 56px", boxShadow: "0 0 0 1px var(--border), 0 8px 40px rgba(0,0,0,0.4)",
          fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13.5, lineHeight: 1.5,
        }}
      >
        <DocBody body={contract.body || ""} />
      </div>
    </div>
  );
}
