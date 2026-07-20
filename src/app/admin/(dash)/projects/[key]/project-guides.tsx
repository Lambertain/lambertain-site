"use client";

import { useState, useTransition } from "react";
import { createGuideTask } from "../../project-actions";
import { ui } from "../../../ui-styles";

type G = { id: number; title: string; collects: boolean };

function GuideRow({ projectKey, g }: { projectKey: string; g: G }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  function send() {
    setErr(null);
    start(async () => {
      const r = await createGuideTask(projectKey, g.id);
      if (r.error) setErr(r.error);
      else { setDone(true); setTimeout(() => setDone(false), 4000); }
    });
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border-2)", borderRadius: 4 }}>
      <span style={{ flex: 1, fontSize: 14 }}>
        {g.title}
        {g.collects && <span style={{ ...ui.monoLabel, textTransform: "none", color: "#e8b339", marginLeft: 8 }}>· сбор данных</span>}
      </span>
      {done ? (
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>Задача создана ✓</span>
      ) : (
        <button onClick={send} disabled={pending} style={{ ...ui.btn, opacity: pending ? 0.5 : 1, whiteSpace: "nowrap" }}>{pending ? "…" : "Создать задачу"}</button>
      )}
      {err && <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b" }}>{err}</span>}
    </div>
  );
}

/** «Гайды клиенту»: отправить гайд клиенту задачей (в любой момент). Задача → «Потрібна ваша дія» + пуш в ТГ. */
export function ProjectGuides({ projectKey, guides }: { projectKey: string; guides: G[] }) {
  return (
    <div style={{ ...ui.card, marginTop: 16 }}>
      <div style={{ ...ui.monoLabel, color: "var(--accent)" }}>Гайды клиенту</div>
      <p style={{ ...ui.monoLabel, textTransform: "none", color: "var(--muted)", marginTop: 6 }}>
        Отправьте гайд клиенту задачей — она появится у него в «Потрібна ваша дія» и придёт пуш в Telegram.
        Гайд со сбором данных попросит вписать значение (токен/ссылку) — оно попадёт в настройки проекта.
      </p>
      {guides.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}>Сначала добавьте гайды в разделе «Гайды».</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {guides.map((g) => <GuideRow key={g.id} projectKey={projectKey} g={g} />)}
        </div>
      )}
    </div>
  );
}
