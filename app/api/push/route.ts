import { pushSubscriptionSchema, pushUnsubscribeSchema } from "@/lib/schemas";
import {
  hasSubscription,
  isPushConfigured,
  removeSubscription,
  saveSubscription,
} from "@/lib/server/domain/push";
import { api, limits } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = api({}, async ({ viewer }) => ({
  configured: isPushConfigured(),
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  subscribed: await hasSubscription(viewer.uid),
}));

export const POST = api({ schema: pushSubscriptionSchema, limit: limits.write }, async ({ viewer, body }) => {
  await saveSubscription(viewer.uid, body);
});

export const DELETE = api({ schema: pushUnsubscribeSchema, limit: limits.write }, async ({ viewer, body }) => {
  await removeSubscription(viewer.uid, body.endpoint);
});
