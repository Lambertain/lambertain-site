"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { checkPassword, setSession, clearSession } from "@/lib/auth";

export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get("password") || "");
  if (!checkPassword(password)) {
    return { error: "wrong" };
  }
  await setSession("web");
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await clearSession();
  redirect("/admin/login");
}

/** Превью интерфейса роли админом ("" = обычный админ). */
export async function setViewAs(role: "" | "client" | "contributor"): Promise<void> {
  const store = await cookies();
  if (role) store.set("view_as", role, { httpOnly: true, sameSite: "lax", path: "/" });
  else store.delete("view_as");
  redirect("/admin");
}
