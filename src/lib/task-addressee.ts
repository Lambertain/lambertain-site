/**
 * Кому фактически адресована задача / где «мяч» — пометка для КОМАНДЫ (super/admin/разработчик).
 * Клиенту НЕ показываем. Решает путаницу: сразу видно, ушла ли задача клиенту или она внутренняя
 * (админу / разработчик сам себе) — чтобы не ждать ответа клиента по задаче, которую он не видел.
 *
 * Опора — флаги создания (task-intake.ts): internal (клиент видит/не видит), clientAction/ownerAction
 * (ждёт действия), и кейс «разработчик → вопрос клиенту» = contributor сам себе + internal:false.
 */
import type { Role } from "./tasks/types";

export type AddresseeKey = "clientWait" | "ownerWait" | "internalSelf" | "internalAdmin" | "fromClient" | "team";

/** Видит ли клиент задачу / где «мяч» — для цвета бейджа. */
export type AddresseeTone = "client" | "wait" | "internal" | "team";

interface AddresseeInput {
  internal?: boolean;
  reporter?: { login: string; role: Role } | null;
  assignee?: { login: string } | null;
  clientAction?: string | null;
  ownerAction?: string | null;
}

export function taskAddressee(task: AddresseeInput): AddresseeKey {
  const r = task.reporter, a = task.assignee;
  const selfDev = !!r?.login && !!a?.login && r.login === a.login && (r.role === "contributor" || r.role === "employee");
  if (task.clientAction) return "clientWait";                 // клиент должен зарегистрировать/дать данные (видит, жмёт «Готово»)
  if (task.ownerAction) return "ownerWait";                   // ops-шаг владельца — клиент не видит
  if (task.internal) return selfDev ? "internalSelf" : "internalAdmin"; // внутренняя — клиент не видит
  // internal:false ниже — клиент видит задачу.
  if (selfDev) return "clientWait";                           // разработчик сам себе + НЕ internal = вопрос клиенту (recipient:client)
  if (r?.role === "client") return "fromClient";              // клиент поставил — он видит и трекает
  return "team";                                              // обычная: админ → разработчику (клиент видит, наш рабочий элемент)
}

export const ADDRESSEE_TONE: Record<AddresseeKey, AddresseeTone> = {
  clientWait: "wait",
  ownerWait: "wait",
  internalSelf: "internal",
  internalAdmin: "internal",
  fromClient: "client",
  team: "team",
};

/** i18n-ключ подписи бейджа. */
export const ADDRESSEE_LABEL: Record<AddresseeKey, string> = {
  clientWait: "addr.clientWait",
  ownerWait: "addr.ownerWait",
  internalSelf: "addr.internalSelf",
  internalAdmin: "addr.internal",
  fromClient: "addr.fromClient",
  team: "addr.team",
};
