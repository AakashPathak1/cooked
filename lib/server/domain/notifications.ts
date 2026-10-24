import "server-only";

import type { NotificationDTO, NotificationType, UserLite } from "@/lib/types";
import { now } from "../clock";
import { getStore } from "../store";
import { describeNotification } from "@/lib/notify-text";
import { sendPush } from "./push";
import { C, iso } from "./records";
import { getUsers } from "./users";

export interface NotifyInput {
  type: NotificationType;
  toUid: string;
  from: UserLite;
  dishId: string;
  dishName: string;
  preview?: string;
  /**
   * Use a deterministic id so repeating the action (like → unlike → like)
   * refreshes one notification instead of piling up new ones.
   */
  dedupe?: boolean;
}

const notificationId = (type: NotificationType, fromUid: string, dishId: string, toUid: string) =>
  `${type}_${fromUid}_${dishId}_${toUid}`;

/** Record a notification and push it to the recipient. Never throws. */
export async function notify(input: NotifyInput): Promise<void> {
  if (input.toUid === input.from.uid) return;
  try {
    const store = getStore();
    const data = {
      toUid: input.toUid,
      fromUid: input.from.uid,
      fromDisplayName: input.from.displayName,
      fromPhotoURL: input.from.photoURL,
      type: input.type,
      dishId: input.dishId,
      dishName: input.dishName,
      ...(input.preview ? { preview: input.preview.length > 140 ? `${input.preview.slice(0, 139)}…` : input.preview } : {}),
      read: false,
      createdAt: now(),
    };
    const batch = store.batch();
    if (input.dedupe) {
      batch.set(
        C.notifications,
        notificationId(input.type, input.from.uid, input.dishId, input.toUid),
        data
      );
    } else {
      batch.set(C.notifications, store.newId(), data);
    }
    await batch.commit();

    await sendPush(input.toUid, {
      title: "cooked",
      body: describeNotification(input.type, input.from.displayName, input.dishName, input.preview),
      url: `/dish/${input.dishId}`,
      tag: `${input.type}-${input.dishId}`,
    });
  } catch (err) {
    console.error("[notify] failed:", (err as Error).message);
  }
}

/** Undo a deduplicated notification (e.g. when someone un-likes). */
export async function retractNotification(
  type: NotificationType,
  fromUid: string,
  dishId: string,
  toUid: string
): Promise<void> {
  try {
    const batch = getStore().batch();
    batch.delete(C.notifications, notificationId(type, fromUid, dishId, toUid));
    await batch.commit();
  } catch (err) {
    console.error("[notify] retract failed:", (err as Error).message);
  }
}

export async function listNotifications(uid: string, limit = 50): Promise<NotificationDTO[]> {
  const rows = await getStore().query(C.notifications, {
    where: [{ field: "toUid", op: "==", value: uid }],
    orderBy: [{ field: "createdAt", dir: "desc" }],
    limit,
  });
  const users = await getUsers(rows.map((r) => String(r.data.fromUid ?? "")));

  return rows.map((row): NotificationDTO => {
    const d = row.data;
    const fromUid = String(d.fromUid ?? "");
    const from: UserLite = users.get(fromUid) ?? {
      uid: fromUid,
      handle: "",
      displayName: String(d.fromDisplayName ?? "Someone"),
      photoURL: String(d.fromPhotoURL ?? ""),
    };
    const type = (["like", "comment", "tag", "accepted", "tried"] as const).includes(
      d.type as NotificationType
    )
      ? (d.type as NotificationType)
      : "like";
    return {
      id: row.id,
      type,
      from,
      dishId: String(d.dishId ?? ""),
      dishName: String(d.dishName ?? ""),
      read: d.read === true,
      createdAt: iso(d.createdAt instanceof Date ? d.createdAt : null),
      ...(typeof d.preview === "string" ? { preview: d.preview } : {}),
    };
  });
}

export async function unreadCount(uid: string): Promise<number> {
  return getStore().count(C.notifications, [
    { field: "toUid", op: "==", value: uid },
    { field: "read", op: "==", value: false },
  ]);
}

export async function markAllRead(uid: string): Promise<number> {
  const store = getStore();
  const unread = await store.query(C.notifications, {
    where: [
      { field: "toUid", op: "==", value: uid },
      { field: "read", op: "==", value: false },
    ],
    limit: 200,
    select: ["read"],
  });
  if (unread.length === 0) return 0;
  const batch = store.batch();
  for (const n of unread) batch.update(C.notifications, n.id, { read: true });
  await batch.commit();
  return unread.length;
}
