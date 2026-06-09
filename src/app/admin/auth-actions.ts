"use server";

import { redirect } from "next/navigation";
import { checkPassword, setSession, clearSession } from "@/lib/auth";

export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get("password") || "");
  if (!checkPassword(password)) {
    return { error: "Неверный пароль" };
  }
  await setSession("web");
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await clearSession();
  redirect("/admin/login");
}
