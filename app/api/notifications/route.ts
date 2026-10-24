import { listNotifications, unreadCount } from "@/lib/server/domain/notifications";
import { api } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = api({}, async ({ viewer }) => {
  const [items, unread] = await Promise.all([listNotifications(viewer.uid), unreadCount(viewer.uid)]);
  return { items, unread };
});
