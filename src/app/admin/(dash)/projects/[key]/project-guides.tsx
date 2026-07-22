"use client";

import { useState, useTransition } from "react";
import { createGuideTask } from "../../project-actions";
import { collectTargets } from "@/lib/project-fields";
import { ui } from "../../../ui-styles";

type G = { id: number; title: string; collectField: string | null };

const COLLECT_OPTS = collectTargets();

function GuideRow({ projectKey, g }: { projectKey: string; g: G }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Какое поле проекта соберёт клиент: дефолт из гайда, но можно переопределить прямо здесь при отправке.
  const [collect, setCollect] = useState<string>(g.collectField ?? "");
  function send() {
    setErr(null);
    start(async () => {
      const r = await createGuideTask(projectKey, g.id, collect);
      if (r.error) setErr(r.error);
      else { setDone(true); setTimeout(() => setDone(false), 4000); }
    });
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border-2)", borderRadius: 4, flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 160, fontSize: 14 }}>{g.title}</span>
      <select
        value={collect}
        onChange={(e) => setCollect(e.target.value)}
        title="Какие данные клиент впишет — уйдут в это поле проекта (с проверкой формата)"
        style={{ ...ui.input, width: "auto", minWidth: 210, maxWidth: 260, fontSize: 13 }}
      >
        <option value="">Без сбора данных</option>
        {COLLECT_OPTS.map((o) => <option key={o.value} value={o.value}>Собрать: {o.label.ru}</option>)}
      </select>
      {done ? (
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>Задача создана ✓</span>
      ) : (
        <button onClick={send} disabled={pending} style={{ ...ui.btn, opacity: pending ? 0.5 : 1, whiteSpace: "nowrap" }}>{pending ? "…" : "Создать задачу"}</button>
      )}
      {err && <span style={{ ...ui.monoLabel, textTransform: "none", color: "#ff5b5b", flexBasis: "100%" }}>{err}</span>}
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
        Выберите поле в «Собрать:» — под задачей у клиента появится поле ввода с проверкой формата,
        и введённое значение (токен/ссылка/почта) попадёт в это поле проекта.
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
