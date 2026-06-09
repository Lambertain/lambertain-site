/**
 * Выбор активного бэкенда задач.
 * Меняется одной переменной TASKS_BACKEND (по умолчанию youtrack).
 * Когда появится postgres.ts — добавить сюда ветку, UI не трогать.
 */
import type { TasksBackend } from "./types";
import { youtrackBackend } from "./youtrack";

export function getBackend(): TasksBackend {
  const kind = process.env.TASKS_BACKEND || "youtrack";
  switch (kind) {
    case "youtrack":
      return youtrackBackend;
    default:
      throw new Error(`Неизвестный TASKS_BACKEND: ${kind}`);
  }
}

export * from "./types";
