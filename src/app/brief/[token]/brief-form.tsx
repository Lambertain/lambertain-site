"use client";

import { useState, useTransition } from "react";
import { submitBriefAction } from "./actions";
import { ui } from "../../admin/ui-styles";

type Lang = "uk" | "ru";
type Field = { key: string; uk: string; ru: string; kind: "text" | "area" | "yesno" | "multi"; opts?: { key: string; uk: string; ru: string }[]; required?: boolean };

const TYPES: { key: string; uk: string; ru: string }[] = [
  { key: "visitka", uk: "Сайт-візитівка", ru: "Сайт-визитка" },
  { key: "landing", uk: "Лендинг послуги", ru: "Лендинг услуги" },
  { key: "shop", uk: "Інтернет-магазин", ru: "Интернет-магазин" },
  { key: "saas", uk: "SaaS / платформа", ru: "SaaS / платформа" },
  { key: "portfolio", uk: "Портфоліо", ru: "Портфолио" },
  { key: "other", uk: "Інше", ru: "Другое" },
];

const COMMON: Field[] = [
  { key: "what", uk: "Що за продукт/послуга і для кого?", ru: "Что за продукт/услуга и для кого?", kind: "area", required: true },
  { key: "brand", uk: "Є готовий бренд? (кольори / лого / шрифти — або «ні»)", ru: "Есть готовый бренд? (цвета / лого / шрифты — или «нет»)", kind: "text" },
  { key: "refLike", uk: "Сайти, які подобаються (посилання)", ru: "Сайты, которые нравятся (ссылки)", kind: "area" },
  { key: "refDislike", uk: "Сайти, які НЕ подобаються (посилання)", ru: "Сайты, которые НЕ нравятся (ссылки)", kind: "area" },
  { key: "mood", uk: "Настрій трьома словами (напр. «суворо, дорого, спокійно»)", ru: "Настроение тремя словами (напр. «строго, дорого, спокойно»)", kind: "text" },
  { key: "langs", uk: "Мови сайту", ru: "Языки сайта", kind: "multi", opts: [
    { key: "uk", uk: "Українська", ru: "Украинский" }, { key: "ru", uk: "Російська", ru: "Русский" }, { key: "en", uk: "Англійська", ru: "Английский" },
  ] },
];

const BRANCH: Record<string, Field[]> = {
  visitka: [
    { key: "blocks", uk: "Які блоки потрібні", ru: "Какие блоки нужны", kind: "multi", opts: [
      { key: "about", uk: "Про мене", ru: "Обо мне" }, { key: "services", uk: "Послуги", ru: "Услуги" },
      { key: "portfolio", uk: "Портфоліо/кейси", ru: "Портфолио/кейсы" }, { key: "contacts", uk: "Контакти", ru: "Контакты" },
    ] },
    { key: "leadForm", uk: "Потрібна форма заявки?", ru: "Нужна форма заявки?", kind: "yesno" },
  ],
  landing: [
    { key: "offer", uk: "Головна пропозиція (оффер)", ru: "Главное предложение (оффер)", kind: "area" },
    { key: "cta", uk: "Цільова дія (заявка / дзвінок / купівля)", ru: "Целевое действие (заявка / звонок / покупка)", kind: "text" },
    { key: "trust", uk: "Елементи довіри", ru: "Элементы доверия", kind: "multi", opts: [
      { key: "reviews", uk: "Відгуки", ru: "Отзывы" }, { key: "cases", uk: "Кейси", ru: "Кейсы" }, { key: "certs", uk: "Сертифікати/нагороди", ru: "Сертификаты/награды" },
    ] },
    { key: "pricing", uk: "Показувати ціни?", ru: "Показывать цены?", kind: "yesno" },
  ],
  shop: [
    { key: "categories", uk: "Категорії товарів", ru: "Категории товаров", kind: "area" },
    { key: "payment", uk: "Оплата (картка / накладений платіж / ...)", ru: "Оплата (карта / наложенный платёж / ...)", kind: "text" },
    { key: "delivery", uk: "Доставка (Нова Пошта / ...)", ru: "Доставка (Новая Почта / ...)", kind: "text" },
    { key: "crm", uk: "Облік/CRM (SalesDrive, 1С, немає)", ru: "Учёт/CRM (SalesDrive, 1С, нет)", kind: "text" },
  ],
  saas: [
    { key: "roles", uk: "Ролі користувачів", ru: "Роли пользователей", kind: "text" },
    { key: "scenarios", uk: "3–5 ключових сценаріїв", ru: "3–5 ключевых сценариев", kind: "area" },
    { key: "pricing", uk: "Тарифи / монетизація", ru: "Тарифы / монетизация", kind: "text" },
    { key: "integrations", uk: "Інтеграції (оплата, пошта, API)", ru: "Интеграции (оплата, почта, API)", kind: "text" },
    { key: "auth", uk: "Авторизація (email, Google, Telegram)", ru: "Авторизация (email, Google, Telegram)", kind: "text" },
  ],
  portfolio: [
    { key: "works", uk: "Що показуємо (роботи / проєкти)", ru: "Что показываем (работы / проекты)", kind: "area" },
    { key: "style", uk: "Бажаний стиль/настрій", ru: "Желаемый стиль/настроение", kind: "text" },
  ],
  other: [
    { key: "free", uk: "Опишіть, що потрібно", ru: "Опишите, что нужно", kind: "area" },
  ],
};

const TXT = {
  title: { uk: "Бриф проєкту", ru: "Бриф проекта" },
  intro: { uk: "Кілька питань, щоб зрозуміти задачу. Чим конкретніше — тим точніше результат.", ru: "Несколько вопросов, чтобы понять задачу. Чем конкретнее — тем точнее результат." },
  typeQ: { uk: "Що потрібно зробити?", ru: "Что нужно сделать?" },
  submit: { uk: "Надіслати бриф", ru: "Отправить бриф" },
  sent: { uk: "Дякую! Бриф надіслано — я зв'яжуся з вами.", ru: "Спасибо! Бриф отправлен — я свяжусь с вами." },
  required: { uk: "Заповніть обов'язкові поля.", ru: "Заполните обязательные поля." },
  yes: { uk: "Так", ru: "Да" }, no: { uk: "Ні", ru: "Нет" },
};

export function BriefForm({ token }: { token: string }) {
  const [lang, setLang] = useState<Lang>("uk");
  const [type, setType] = useState<string>("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  const toggleMulti = (k: string, opt: string) =>
    setData((d) => {
      const cur = Array.isArray(d[k]) ? (d[k] as string[]) : [];
      return { ...d, [k]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });

  function submit() {
    setError(null);
    const fields = [...COMMON, ...(BRANCH[type] || [])];
    for (const f of fields) if (f.required && !String(data[f.key] ?? "").trim()) { setError(TXT.required[lang]); return; }
    start(async () => {
      const r = await submitBriefAction(token, type, data);
      if (r.error) setError(r.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div style={{ ...ui.card, maxWidth: 560, margin: "0 auto", textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 15, lineHeight: 1.6 }}>{TXT.sent[lang]}</div>
      </div>
    );
  }

  function renderField(f: Field) {
    const v = data[f.key];
    return (
      <div key={f.key} style={{ marginTop: 16 }}>
        <label style={{ ...ui.fieldLabel, display: "block", marginBottom: 6 }}>{f[lang]}{f.required && <span style={{ color: "var(--accent)" }}> *</span>}</label>
        {f.kind === "text" && <input value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} style={{ ...ui.input, width: "100%" }} />}
        {f.kind === "area" && <textarea value={(v as string) ?? ""} onChange={(e) => set(f.key, e.target.value)} rows={3} style={{ ...ui.input, width: "100%", resize: "vertical" }} />}
        {f.kind === "yesno" && (
          <div style={{ display: "flex", gap: 8 }}>
            {([["yes", TXT.yes[lang]], ["no", TXT.no[lang]]] as const).map(([val, lbl]) => (
              <button key={val} type="button" onClick={() => set(f.key, val)} style={{ ...ui.monoLabel, textTransform: "none", padding: "7px 16px", borderRadius: 2, cursor: "pointer", border: "1px solid " + (v === val ? "var(--accent)" : "var(--border-2)"), background: v === val ? "var(--accent)" : "transparent", color: v === val ? "#000" : "var(--muted)" }}>{lbl}</button>
            ))}
          </div>
        )}
        {f.kind === "multi" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {f.opts!.map((o) => {
              const on = Array.isArray(v) && (v as string[]).includes(o.key);
              return (
                <button key={o.key} type="button" onClick={() => toggleMulti(f.key, o.key)} style={{ ...ui.monoLabel, textTransform: "none", padding: "7px 14px", borderRadius: 2, cursor: "pointer", border: "1px solid " + (on ? "var(--accent)" : "var(--border-2)"), background: on ? "var(--accent)" : "transparent", color: on ? "#000" : "var(--muted)" }}>{o[lang]}</button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={ui.monoLabel}>Lambertain</div>
          <h1 style={{ ...ui.h1, fontSize: 28, marginTop: 8 }}>{TXT.title[lang]}</h1>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {(["uk", "ru"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} style={{ ...ui.monoLabel, background: "none", border: "none", cursor: "pointer", padding: "4px 6px", color: lang === l ? "var(--text)" : "var(--muted)", textDecoration: lang === l ? "underline" : "none" }}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>{TXT.intro[lang]}</p>

      <div style={{ marginTop: 22 }}>
        <label style={{ ...ui.fieldLabel, display: "block", marginBottom: 8 }}>{TXT.typeQ[lang]}<span style={{ color: "var(--accent)" }}> *</span></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TYPES.map((tp) => (
            <button key={tp.key} type="button" onClick={() => setType(tp.key)} style={{ ...ui.monoLabel, textTransform: "none", padding: "9px 16px", borderRadius: 2, cursor: "pointer", border: "1px solid " + (type === tp.key ? "var(--accent)" : "var(--border-2)"), background: type === tp.key ? "var(--accent)" : "transparent", color: type === tp.key ? "#000" : "var(--muted)" }}>{tp[lang]}</button>
          ))}
        </div>
      </div>

      {type && (
        <>
          {COMMON.map(renderField)}
          {(BRANCH[type] || []).map(renderField)}
          {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 14 }}>{error}</p>}
          <button onClick={submit} disabled={pending} style={{ ...ui.btnAccent, marginTop: 22, width: "100%", justifyContent: "center", opacity: pending ? 0.6 : 1 }}>
            {pending ? "…" : TXT.submit[lang]}
          </button>
        </>
      )}
    </div>
  );
}
