import { api } from "@/lib/server/http";
import { getUser } from "@/lib/server/domain/users";
import { unreadCount } from "@/lib/server/domain/notifications";
import { hasSubscription, isPushConfigured } from "@/lib/server/domain/push";

export const dynamic = "force-dynamic";

export const GET = api({}, async ({ viewer }) => {
  const [user, unread, subscribed] = await Promise.all([
    getUser(viewer.uid),
    unreadCount(viewer.uid),
    hasSubscription(viewer.uid),
  ]);
  return { user, unread, push: { configured: isPushConfigured(), subscribed } };
});
