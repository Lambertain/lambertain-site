/**
 * Активный бэкенд задач — собственная БД портала (Postgres). YouTrack убран.
 */
import type { TasksBackend } from "./types";
import { postgresBackend } from "./postgres";

export function getBackend(): TasksBackend {
  return postgresBackend;
}

export * from "./types";
