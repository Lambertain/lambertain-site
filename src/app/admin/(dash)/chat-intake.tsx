"use client";

import { useState, useRef, useTransition } from "react";
import { intakeTurn, createProposedTasks } from "./actions";
import type { ProposedTask } from "@/lib/intake";
import { t, type Locale } from "@/lib/i18n";
import { ui } from "../ui-styles";

type Proj = { key: string; name: string };
// Упрощённый тип сообщения Anthropic для клиента.
type Msg = { role: "user" | "assistant"; content: unknown };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .filter((b) => (b as { type: string }).type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
  return "";
}
function imagesOf(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b) => (b as { type: string }).type === "image")
    .map((b) => {
      const s = (b as { source: { media_type: string; data: string } }).source;
      return `data:${s.media_type};base64,${s.data}`;
    });
}

export function ChatIntake({ projects, locale }: { projects: Proj[]; locale: Locale }) {
  const [projectKey, setProjectKey] = useState(projects[0]?.key ?? "");
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<{ media_type: string; data: string }[]>([]);
  const [proposed, setProposed] = useState<ProposedTask[] | null>(null);
  const [created, setCreated] = useState<{ id: string; url: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function attach(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const [meta, data] = dataUrl.split(",");
        const media_type = meta.slice(5, meta.indexOf(";"));
        setImages((p) => [...p, { media_type, data }]);
      };
      reader.readAsDataURL(f);
    });
  }

  function send() {
    if (!input.trim() && images.length === 0) return;
    if (!projectKey) return;
    setError(null);
    setProposed(null);
    const content: unknown[] = [];
    if (input.trim()) content.push({ type: "text", text: input });
    for (const img of images) content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
    const newHistory: Msg[] = [...history, { role: "user", content }];
    setHistory(newHistory);
    setInput("");
    setImages([]);
    start(async () => {
      const res = await intakeTurn(newHistory as never, projectKey);
      if (res.error) setError(res.error);
      else {
        if (res.messages) setHistory(res.messages as Msg[]);
        if (res.proposed) setProposed(res.proposed);
      }
    });
  }

  function createTasks() {
    if (!proposed) return;
    start(async () => {
      const res = await createProposedTasks(projectKey, proposed);
      if (res.error) setError(res.error);
      else {
        setCreated(res.created ?? []);
        setProposed(null);
      }
    });
  }

  const display = history.filter((m) => textOf(m.content) || imagesOf(m.content).length);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 240px" }}>
          <label style={ui.fieldLabel}>{t(locale, "field.project")}</label>
          <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)} style={ui.input}>
            {projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key} — {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {display.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          {display.map((m, i) => (
            <div
              key={i}
              style={{
                ...ui.card,
                padding: 14,
                borderColor: m.role === "user" ? "var(--border-2)" : "var(--accent-line)",
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
              }}
            >
              <div style={{ ...ui.monoLabel, marginBottom: 6, color: m.role === "user" ? "var(--muted)" : "var(--accent)" }}>
                {m.role === "user" ? t(locale, "chat.you") : "Lambertain"}
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55 }}>{textOf(m.content)}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: imagesOf(m.content).length ? 8 : 0 }}>
                {imagesOf(m.content).map((src, j) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={j} src={src} alt="" style={{ maxWidth: 120, borderRadius: 4, border: "1px solid var(--border-2)" }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {pending && <p style={{ ...ui.monoLabel, color: "var(--accent)", marginTop: 12 }}>{t(locale, "chat.thinking")}</p>}

      {proposed && (
        <div style={{ ...ui.card, marginTop: 16, borderColor: "var(--accent-line)" }}>
          <div style={ui.monoLabel}>{t(locale, "chat.proposedTitle")} · {proposed.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {proposed.map((tk, i) => (
              <div key={i} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{tk.summary}</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{tk.description}</div>
                {tk.assigneeLogin && <div style={{ ...ui.monoLabel, marginTop: 6 }}>→ {tk.assigneeLogin}</div>}
              </div>
            ))}
          </div>
          <button onClick={createTasks} disabled={pending} style={{ ...ui.btnAccent, marginTop: 14, opacity: pending ? 0.5 : 1 }}>
            {t(locale, "chat.createAll")}
          </button>
        </div>
      )}

      {created && (
        <div style={{ ...ui.card, marginTop: 16, borderColor: "var(--accent-line)" }}>
          <span style={{ color: "var(--accent)" }}>{t(locale, "chat.createdOk")} </span>
          {created.map((c, i) => (
            <a key={i} href={c.url} style={{ color: "var(--accent)", marginRight: 10 }}>
              {c.id}
            </a>
          ))}
        </div>
      )}

      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 12 }}>{error}</p>}

      {images.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={`data:${img.media_type};base64,${img.data}`} alt="" style={{ maxWidth: 64, borderRadius: 4, border: "1px solid var(--border-2)" }} />
          ))}
        </div>
      )}

      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} placeholder={t(locale, "chat.placeholder")} style={{ ...ui.input, resize: "vertical", marginTop: 12 }} />
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => attach(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} style={ui.btn}>
          {t(locale, "chat.attach")}
        </button>
        <button onClick={send} disabled={pending || (!input.trim() && !images.length)} style={{ ...ui.btnAccent, opacity: pending || (!input.trim() && !images.length) ? 0.5 : 1 }}>
          {t(locale, "chat.send")}
        </button>
      </div>
    </div>
  );
}
