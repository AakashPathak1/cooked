import "server-only";

import { createHash } from "node:crypto";
import { now } from "../clock";
import { getStore } from "../store";
import { C } from "./records";

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
}

/** Sends one payload to one subscription. Replaceable in tests. */
export type PushTransport = (sub: PushSub, payload: string) => Promise<void>;

let transportOverride: PushTransport | null = null;
export function setPushTransport(t: PushTransport | null): void {
  transportOverride = t;
}

const MAX_DEVICES = 5;
const SEND_TIMEOUT_MS = 3000;

export function isPushConfigured(): boolean {
  return Boolean(
    transportOverride || (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
  );
}

const subId = (uid: string, endpoint: string) =>
  `${uid}_${createHash("sha1").update(endpoint).digest("hex").slice(0, 20)}`;

async function defaultTransport(sub: PushSub, payload: string): Promise<void> {
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? "mailto:admin@cooked.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  await webpush.sendNotification(sub, payload, { TTL: 3600, timeout: SEND_TIMEOUT_MS });
}

export async function saveSubscription(uid: string, sub: PushSub): Promise<void> {
  const store = getStore();
  const id = subId(uid, sub.endpoint);
  const mine = await store.query(C.pushSubscriptions, { where: [{ field: "uid", op: "==", value: uid }] });

  const batch = store.batch();
  batch.set(C.pushSubscriptions, id, {
    uid,
    endpoint: sub.endpoint,
    subscription: { endpoint: sub.endpoint, keys: sub.keys },
    updatedAt: now(),
  });

  // Keep the most recently updated devices only.
  const others = mine
    .filter((d) => d.id !== id)
    .sort(
      (a, b) =>
        ((b.data.updatedAt as Date | undefined)?.getTime() ?? 0) -
        ((a.data.updatedAt as Date | undefined)?.getTime() ?? 0)
    );
  for (const stale of others.slice(MAX_DEVICES - 1)) batch.delete(C.pushSubscriptions, stale.id);
  await batch.commit();
}

/** Remove one device, or every device for the user when no endpoint is given. */
export async function removeSubscription(uid: string, endpoint?: string): Promise<void> {
  const store = getStore();
  const mine = await store.query(C.pushSubscriptions, { where: [{ field: "uid", op: "==", value: uid }] });
  const batch = store.batch();
  for (const doc of mine) {
    const sub = doc.data.subscription as { endpoint?: string } | undefined;
    if (!endpoint || sub?.endpoint === endpoint || doc.data.endpoint === endpoint) {
      batch.delete(C.pushSubscriptions, doc.id);
    }
  }
  await batch.commit();
}

export async function hasSubscription(uid: string): Promise<boolean> {
  return (
    (await getStore().count(C.pushSubscriptions, [{ field: "uid", op: "==", value: uid }])) > 0
  );
}

/**
 * Fire a push to every device the user registered. Never throws: push is a
 * nicety and must not fail the action that triggered it.
 */
export async function sendPush(uid: string, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    const store = getStore();
    const docs = await store.query(C.pushSubscriptions, {
      where: [{ field: "uid", op: "==", value: uid }],
      limit: 10,
    });
    if (docs.length === 0) return;

    const body = JSON.stringify(payload);
    const send = transportOverride ?? defaultTransport;

    await Promise.all(
      docs.map(async (doc) => {
        const raw = doc.data.subscription as Partial<PushSub> | undefined;
        if (!raw?.endpoint || !raw.keys) return;
        try {
          await Promise.race([
            send({ endpoint: raw.endpoint, keys: raw.keys }, body),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("push timeout")), SEND_TIMEOUT_MS + 500)
            ),
          ]);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            const cleanup = store.batch();
            cleanup.delete(C.pushSubscriptions, doc.id);
            await cleanup.commit();
          } else {
            console.error("[push] delivery failed:", (err as Error).message);
          }
        }
      })
    );
  } catch (err) {
    console.error("[push] failed:", (err as Error).message);
  }
}
