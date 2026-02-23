import webpush from "web-push";

function getWebPush() {
  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL ?? "mailto:admin@cooked.app";
  if (!pubKey || !privKey) {
    throw new Error("VAPID keys not configured");
  }
  webpush.setVapidDetails(email, pubKey, privKey);
  return webpush;
}

export async function sendPushNotification(
  subscription: webpush.PushSubscription,
  payload: { title: string; body: string; url?: string; icon?: string }
) {
  try {
    const wp = getWebPush();
    await wp.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err: unknown) {
    const e = err as { statusCode?: number };
    if (e?.statusCode === 410) return "expired";
    console.error("Push error:", err);
    return false;
  }
}
