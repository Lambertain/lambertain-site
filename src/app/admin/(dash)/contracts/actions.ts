"use server";

import { requireAdmin } from "@/lib/principal";
import {
  createContractor, updateContractor, deleteContractor,
  createTemplate, updateTemplate, deleteTemplate,
  getTemplate, getContractor, createContract, deleteContract,
  type ContractorInput,
} from "@/lib/db";
import { renderContract, formatUaDate } from "@/lib/contracts";
import { revalidatePath } from "next/cache";

// ——— ФОПы-исполнители ———
export async function saveContractor(input: ContractorInput & { id?: number }): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  if (!input.name.trim()) return { error: "Назва ФОПа порожня" };
  const data: ContractorInput = {
    name: input.name.trim(), address: input.address, ipn: input.ipn, iban: input.iban,
    bank_name: input.bank_name, bank_mfo: input.bank_mfo, bank_edrpou: input.bank_edrpou, phone: input.phone,
  };
  if (input.id) await updateContractor(input.id, data);
  else await createContractor(data);
  revalidatePath("/admin/contracts");
  return { ok: true };
}
export async function removeContractor(id: number): Promise<{ ok: boolean }> {
  await requireAdmin();
  await deleteContractor(id);
  revalidatePath("/admin/contracts");
  return { ok: true };
}

// ——— Шаблоны ———
export async function saveTemplate(input: { id?: number; title: string; lang?: string; body: string }): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  if (!input.title.trim()) return { error: "Назва шаблону порожня" };
  if (!input.body.trim()) return { error: "Текст шаблону порожній" };
  const lang = input.lang?.trim() || "uk";
  if (input.id) await updateTemplate(input.id, input.title.trim(), lang, input.body);
  else await createTemplate(input.title.trim(), lang, input.body);
  revalidatePath("/admin/contracts");
  return { ok: true };
}
export async function removeTemplate(id: number): Promise<{ ok: boolean }> {
  await requireAdmin();
  await deleteTemplate(id);
  revalidatePath("/admin/contracts");
  return { ok: true };
}

// ——— Договоры ———
export interface NewContractInput {
  templateId: number;
  contractorId: number;
  number: string;
  date: string;
  city: string;
  title: string;
  clientRequisites: string;
  vars: Record<string, string>;
}
export async function createContractAction(input: NewContractInput): Promise<{ id?: number; error?: string }> {
  await requireAdmin();
  const tpl = await getTemplate(input.templateId);
  if (!tpl) return { error: "Шаблон не знайдено" };
  const contractor = await getContractor(input.contractorId);
  if (!contractor) return { error: "Виконавця (ФОП) не знайдено" };
  const body = renderContract(tpl.body, {
    contractor,
    clientRequisites: input.clientRequisites,
    number: input.number,
    date: formatUaDate(input.date),
    city: input.city,
    vars: input.vars,
  });
  const id = await createContract({
    number: input.number || null,
    contract_date: input.date || null,
    city: input.city || null,
    title: input.title?.trim() || tpl.title,
    template_id: tpl.id,
    contractor_id: contractor.id,
    client_requisites: input.clientRequisites || null,
    vars: input.vars,
    body,
  });
  revalidatePath("/admin/contracts");
  return { id };
}
export async function removeContract(id: number): Promise<{ ok: boolean }> {
  await requireAdmin();
  await deleteContract(id);
  revalidatePath("/admin/contracts");
  return { ok: true };
}
