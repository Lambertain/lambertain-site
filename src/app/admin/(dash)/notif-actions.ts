"use server";

import { getPrincipal } from "@/lib/principal";
import { listUnreadNotifications, markNotificationRead, markAllNotificationsRead, markTaskNotificationsRead, type Notification } from "@/lib/db";

/** Непрочитанные уведомления текущего пользователя (для колокольчика). */
export async function myNotifications(): Promise<Notification[]> {
  const me = await getPrincipal();
  if (!me?.tgId) return [];
  return listUnreadNotifications(me.tgId).catch(() => []);
}

export async function readNotification(id: number): Promise<void> {
  const me = await getPrincipal();
  if (me?.tgId) await markNotificationRead(me.tgId, id).catch(() => {});
}

/** Прочитать все уведомления задачи (клик по уведомлению ведёт на задачу). */
export async function readTaskNotifications(taskId: string): Promise<void> {
  const me = await getPrincipal();
  if (me?.tgId) await markTaskNotificationsRead(me.tgId, taskId).catch(() => {});
}

export async function readAllNotifications(): Promise<void> {
  const me = await getPrincipal();
  if (me?.tgId) await markAllNotificationsRead(me.tgId).catch(() => {});
}
