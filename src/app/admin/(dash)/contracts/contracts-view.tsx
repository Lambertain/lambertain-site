"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ui } from "../../ui-styles";
import {
  extractPlaceholders, dynamicPlaceholders, fieldLabel, MULTILINE_KEYS,
} from "@/lib/contracts";
import {
  saveContractor, removeContractor, saveTemplate, removeTemplate,
  createContractAction, removeContract, type NewContractInput,
} from "./actions";

type Contractor = {
  id: number; name: string; address: string | null; ipn: string | null; iban: string | null;
  bank_name: string | null; bank_mfo: string | null; bank_edrpou: string | null; phone: string | null; email: string | null;
};
type Template = { id: number; title: string; lang: string; body: string };
type ContractRow = { id: number; number: string | null; title: string | null; date: string | null; createdAt: string };

const CONTRACTOR_LABELS: Record<string, string> = {
  name: "Найменування (ФОП …)", address: "Адреса", ipn: "ІПН / ЄДРПОУ", iban: "IBAN",
  bank_name: "Банк", bank_mfo: "МФО", bank_edrpou: "ЄДРПОУ банку", phone: "Телефон", email: "E-mail",
};

const TABS = [
  ["contracts", "Договори"],
  ["create", "Новий договір"],
  ["contractors", "Виконавці (ФОПи)"],
  ["templates", "Шаблони"],
] as const;
type Tab = (typeof TABS)[number][0];

export function ContractsView({ contracts, contractors, templates, today }: {
  contracts: ContractRow[]; contractors: Contractor[]; templates: Template[]; today: string;
}) {
  const [tab, setTab] = useState<Tab>(contracts.length ? "contracts" : "create");

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              ...ui.monoLabel,
              textTransform: "none",
              cursor: "pointer",
              padding: "7px 14px",
              borderRadius: 2,
              border: "1px solid " + (tab === k ? "var(--accent)" : "var(--border-2)"),
              background: tab === k ? "var(--accent)" : "transparent",
              color: tab === k ? "#000" : "var(--muted)",
              fontSize: 12,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "contracts" && <ContractsList contracts={contracts} />}
      {tab === "create" && <CreateContract contractors={contractors} templates={templates} today={today} />}
      {tab === "contractors" && <ContractorsTab contractors={contractors} />}
      {tab === "templates" && <TemplatesTab templates={templates} />}
    </div>
  );
}

// ——— Список договоров ———
function ContractsList({ contracts }: { contracts: ContractRow[] }) {
  const [pending, start] = useTransition();
  if (!contracts.length) return <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 18 }}>Договорів ще немає. Перейдіть у «Новий договір».</p>;
  return (
    <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
      {contracts.map((c) => (
        <div key={c.id} style={{ ...ui.card, padding: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600 }}>{c.title || "Без назви"}</div>
            <div style={{ ...ui.monoLabel, textTransform: "none", marginTop: 4 }}>
              {c.number ? `№ ${c.number}` : "без номера"} · {c.date || c.createdAt.slice(0, 10)}
            </div>
          </div>
          <Link href={`/admin/contracts/${c.id}`} style={{ ...ui.btn, textDecoration: "none" }}>Відкрити / Друк</Link>
          <button
            onClick={() => { if (confirm("Видалити договір?")) start(async () => { await removeContract(c.id); location.reload(); }); }}
            disabled={pending}
            style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "8px 12px", cursor: "pointer", borderRadius: 2 }}
          >
            Видалити
          </button>
        </div>
      ))}
    </div>
  );
}

// ——— Мастер нового договора ———
function CreateContract({ contractors, templates, today }: { contractors: Contractor[]; templates: Template[]; today: string }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<number | "">(templates[0]?.id ?? "");
  const [contractorId, setContractorId] = useState<number | "">(contractors[0]?.id ?? "");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(today);
  const [city, setCity] = useState("Київ");
  const [title, setTitle] = useState("");
  const [clientReq, setClientReq] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const tpl = templates.find((t) => t.id === templateId);
  const placeholders = useMemo(() => (tpl ? extractPlaceholders(tpl.body) : []), [tpl]);
  const dynamics = useMemo(() => (tpl ? dynamicPlaceholders(tpl.body) : []), [tpl]);
  const has = (k: string) => placeholders.includes(k);

  function setVar(k: string, v: string) { setVars((p) => ({ ...p, [k]: v })); }

  function submit() {
    if (!templateId || !contractorId) { setMsg("Оберіть шаблон і виконавця"); return; }
    setMsg(null);
    const payload: NewContractInput = {
      templateId: Number(templateId), contractorId: Number(contractorId),
      number, date, city, title, clientRequisites: clientReq, vars,
    };
    start(async () => {
      const r = await createContractAction(payload);
      if (r.error) setMsg(r.error);
      else if (r.id) router.push(`/admin/contracts/${r.id}`);
    });
  }

  if (!templates.length) return <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 18 }}>Спершу додайте шаблон у вкладці «Шаблони».</p>;
  if (!contractors.length) return <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 18 }}>Спершу додайте виконавця (ФОП) у вкладці «Виконавці».</p>;

  return (
    <div style={{ ...ui.card, padding: 18, marginTop: 18, maxWidth: 760 }}>
      <Field label="Шаблон договору">
        <select value={templateId} onChange={(e) => { setTemplateId(Number(e.target.value)); setVars({}); }} style={ui.input}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </Field>
      <Field label="Виконавець (наш ФОП)">
        <select value={contractorId} onChange={(e) => setContractorId(Number(e.target.value))} style={ui.input}>
          {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {has("number") && <Field label="Номер договору" w={160}><input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="01/2026" style={ui.input} /></Field>}
        {has("date") && <Field label="Дата" w={160}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={ui.input} /></Field>}
        {has("city") && <Field label="Місто" w={160}><input value={city} onChange={(e) => setCity(e.target.value)} style={ui.input} /></Field>}
      </div>

      <Field label="Назва у списку (необов'язково)">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="напр. Договір з ФОП Фесюк — лендінг" style={ui.input} />
      </Field>

      {has("client.requisites") && (
        <Field label="Реквізити Замовника (вставте блок реквізитів клієнта)">
          <textarea value={clientReq} onChange={(e) => setClientReq(e.target.value)} rows={6}
            placeholder={'ФОП Прізвище Ім\'я По-батькові\nІПН: …\nIBAN: …\nБанк: …\nАдреса: …\nТел.: …'}
            style={{ ...ui.input, resize: "vertical", fontSize: 14, lineHeight: 1.5 }} />
        </Field>
      )}

      {dynamics.map((k) => (
        <Field key={k} label={fieldLabel(k)}>
          {MULTILINE_KEYS.has(k)
            ? <textarea value={vars[k] ?? ""} onChange={(e) => setVar(k, e.target.value)} rows={3} style={{ ...ui.input, resize: "vertical", fontSize: 14, lineHeight: 1.5 }} />
            : <input value={vars[k] ?? ""} onChange={(e) => setVar(k, e.target.value)} style={ui.input} />}
        </Field>
      ))}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <button onClick={submit} disabled={pending} style={{ ...ui.btnAccent, opacity: pending ? 0.5 : 1 }}>{pending ? "Створення…" : "Створити договір"}</button>
        {msg && <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{msg}</span>}
      </div>
    </div>
  );
}

// ——— ФОПы ———
function ContractorsTab({ contractors }: { contractors: Contractor[] }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={ui.monoLabel}>Новий виконавець</div>
      <ContractorEditor isNew />
      <div style={{ ...ui.monoLabel, marginTop: 24 }}>Виконавці · {contractors.length}</div>
      {contractors.map((c) => <ContractorEditor key={c.id} c={c} />)}
    </div>
  );
}

function ContractorEditor({ c, isNew }: { c?: Contractor; isNew?: boolean }) {
  const empty = { name: "", address: "", ipn: "", iban: "", bank_name: "", bank_mfo: "", bank_edrpou: "", phone: "", email: "" };
  const [f, setF] = useState<Record<string, string>>(c ? {
    name: c.name ?? "", address: c.address ?? "", ipn: c.ipn ?? "", iban: c.iban ?? "",
    bank_name: c.bank_name ?? "", bank_mfo: c.bank_mfo ?? "", bank_edrpou: c.bank_edrpou ?? "", phone: c.phone ?? "", email: c.email ?? "",
  } : empty);
  const [msg, setMsg] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [pending, start] = useTransition();
  if (removed) return null;

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveContractor({
        id: c?.id, name: f.name, address: f.address, ipn: f.ipn, iban: f.iban,
        bank_name: f.bank_name, bank_mfo: f.bank_mfo, bank_edrpou: f.bank_edrpou, phone: f.phone, email: f.email,
      });
      if (r.error) setMsg(r.error);
      else { setMsg("Збережено ✓"); if (isNew) setF(empty); }
    });
  }
  const keys = ["name", "address", "ipn", "iban", "bank_name", "bank_mfo", "bank_edrpou", "phone", "email"];
  return (
    <div style={{ ...ui.card, padding: 14, marginTop: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
        {keys.map((k) => (
          <label key={k} style={{ display: "block" }}>
            <span style={ui.fieldLabel}>{CONTRACTOR_LABELS[k]}</span>
            <input value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} style={ui.input} />
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={save} disabled={pending || !f.name.trim()} style={{ ...ui.btnAccent, opacity: pending || !f.name.trim() ? 0.5 : 1 }}>{pending ? "…" : isNew ? "Додати ФОП" : "Зберегти"}</button>
        {!isNew && c && (
          <button onClick={() => { if (confirm("Видалити ФОП?")) start(async () => { await removeContractor(c.id); setRemoved(true); }); }}
            style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "8px 12px", cursor: "pointer", borderRadius: 2 }}>Видалити</button>
        )}
        {msg && <span style={{ ...ui.monoLabel, textTransform: "none", color: msg.includes("✓") ? "var(--accent)" : "#ff5b5b" }}>{msg}</span>}
      </div>
    </div>
  );
}

// ——— Шаблоны ———
function TemplatesTab({ templates }: { templates: Template[] }) {
  return (
    <div style={{ marginTop: 18 }}>
      <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, maxWidth: 720 }}>
        Плейсхолдери у тексті: <code>{"{{contractor.name}}"}</code>, <code>{"{{contractor.iban}}"}</code> та інші реквізити виконавця підставляються автоматично;{" "}
        <code>{"{{client.requisites}}"}</code> — реквізити замовника; <code>{"{{number}}"}</code>, <code>{"{{date}}"}</code>, <code>{"{{city}}"}</code> — реквізити договору.{" "}
        Будь-які інші <code>{"{{поле}}"}</code> (напр. <code>{"{{subject}}"}</code>, <code>{"{{price}}"}</code>, <code>{"{{term}}"}</code>) стануть полями у формі створення договору.
      </p>
      <div style={{ ...ui.monoLabel, marginTop: 18 }}>Новий шаблон</div>
      <TemplateEditor isNew />
      <div style={{ ...ui.monoLabel, marginTop: 24 }}>Шаблони · {templates.length}</div>
      {templates.map((t) => <TemplateEditor key={t.id} t={t} />)}
    </div>
  );
}

function TemplateEditor({ t, isNew }: { t?: Template; isNew?: boolean }) {
  const [title, setTitle] = useState(t?.title ?? "");
  const [body, setBody] = useState(t?.body ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [pending, start] = useTransition();
  if (removed) return null;

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveTemplate({ id: t?.id, title, body });
      if (r.error) setMsg(r.error);
      else { setMsg("Збережено ✓"); if (isNew) { setTitle(""); setBody(""); } }
    });
  }
  return (
    <div style={{ ...ui.card, padding: 14, marginTop: 10 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Назва шаблону" style={{ ...ui.input, fontWeight: 600 }} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={isNew ? 8 : 14}
        placeholder="Текст договору з плейсхолдерами {{...}}" style={{ ...ui.input, resize: "vertical", marginTop: 8, fontSize: 13, lineHeight: 1.55, fontFamily: "var(--font-mono)" }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={save} disabled={pending || !title.trim() || !body.trim()} style={{ ...ui.btnAccent, opacity: pending || !title.trim() || !body.trim() ? 0.5 : 1 }}>{pending ? "…" : isNew ? "Створити шаблон" : "Зберегти"}</button>
        {!isNew && t && (
          <button onClick={() => { if (confirm("Видалити шаблон?")) start(async () => { await removeTemplate(t.id); setRemoved(true); }); }}
            style={{ ...ui.monoLabel, color: "#ff5b5b", background: "transparent", border: "1px solid #ff5b5b", padding: "8px 12px", cursor: "pointer", borderRadius: 2 }}>Видалити</button>
        )}
        {msg && <span style={{ ...ui.monoLabel, textTransform: "none", color: msg.includes("✓") ? "var(--accent)" : "#ff5b5b" }}>{msg}</span>}
      </div>
    </div>
  );
}

function Field({ label, children, w }: { label: string; children: React.ReactNode; w?: number }) {
  return (
    <label style={{ display: "block", marginTop: 12, width: w ?? "100%" }}>
      <span style={ui.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}
