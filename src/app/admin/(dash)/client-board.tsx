"use client";

import { useState } from "react";
import { TaskTabs, type BoardTask } from "./task-tabs";
import type { Locale } from "@/lib/i18n";

type Proj = { key: string; name: string; hasNew?: boolean };

/**
 * Клиентский дашборд: карточка проекта СВЕРХУ и табы задач СНИЗУ делят один выбранный проект.
 * Раньше карточка была статична (всегда первый проект), а фильтр в табах — свой → при переключении
 * проекта внизу карточка вверху «застревала». Теперь выбор общий.
 * projectCards — предрендеренные на сервере карточки по ключу проекта (для feedback-проекта карточки нет → не показываем).
 */
export function ClientBoard({
  projectCards,
  header,
  tasks,
  projects,
  locale,
  canEditStatus,
  canDelete,
  canStart,
  empty,
  feedbackKey,
}: {
  projectCards: Record<string, React.ReactNode>;
  header: React.ReactNode;
  tasks: BoardTask[];
  projects: Proj[];
  locale: Locale;
  canEditStatus: boolean;
  canDelete: boolean;
  canStart: boolean;
  empty: string;
  feedbackKey?: string;
}) {
  // "" = «Всі задачі» (по всех проектах) — выбрано по умолчанию.
  const [activeProject, setActiveProject] = useState<string>("");

  // Карточку проекта (инфо/доступы) показываем: выбран конкретный проект → его карточка; на «Всі задачі»
  // у клиента с ОДНИМ проектом — всё равно его карточку (иначе клиент не видел инфо проекта вообще, пока
  // не догадается кликнуть таб проекта). Несколько проектов на «Всі» — не навязываем (выберет нужный).
  const cardKeys = Object.keys(projectCards);
  const activeCard = activeProject ? projectCards[activeProject] : cardKeys.length === 1 ? projectCards[cardKeys[0]] : null;

  return (
    <div>
      {activeCard && <div style={{ marginBottom: 18 }}>{activeCard}</div>}
      {header}
      <TaskTabs
        tasks={tasks}
        projects={projects}
        locale={locale}
        canEditStatus={canEditStatus}
        canDelete={canDelete}
        canStart={canStart}
        empty={empty}
        feedbackKey={feedbackKey}
        activeProject={activeProject}
        onProjectChange={setActiveProject}
        allowAll
      />
    </div>
  );
}
