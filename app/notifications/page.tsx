"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getNotifications, markNotificationsRead, NotificationDoc } from "@/lib/firestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, MessageCircle } from "lucide-react";

function timeAgo(timestamp: NotificationDoc["createdAt"]): string {
  if (!timestamp) return "";
  const now = Date.now();
  const then = timestamp.toMillis ? timestamp.toMillis() : Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getNotifications(user.uid).then(setNotifications).finally(() => setFetching(false));
    // Mark all as read after viewing
    markNotificationsRead(user.uid);
  }, [user]);

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mb-nav">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md z-40 px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold">Notifications</h1>
      </div>

      <div className="divide-y divide-gray-50">
        {notifications.map((notif) => (
          <Link key={notif.id} href={`/dish/${notif.dishId}`}>
            <div className={`flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors ${!notif.read ? "bg-orange-50/60" : ""}`}>
              {/* Avatar */}
              <div className="relative shrink-0">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={notif.fromPhotoURL} />
                  <AvatarFallback className="bg-orange-100 text-orange-600 font-semibold">
                    {notif.fromDisplayName?.[0] ?? "?"}
                  </AvatarFallback>
                </Avatar>
                {/* Icon badge */}
                <div className={`absolute -bottom-0.5 -right-0.5 rounded-full p-1 ${notif.type === "like" ? "bg-red-500" : "bg-orange-500"}`}>
                  {notif.type === "like"
                    ? <Heart className="h-2.5 w-2.5 text-white fill-white" />
                    : <MessageCircle className="h-2.5 w-2.5 text-white" />
                  }
                </div>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">
                  <span className="font-semibold">{notif.fromDisplayName}</span>
                  {notif.type === "like" ? " liked your dish " : " commented on "}
                  <span className="font-semibold">{notif.dishName}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{timeAgo(notif.createdAt)}</p>
              </div>

              {/* Unread dot */}
              {!notif.read && (
                <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              )}
            </div>
          </Link>
        ))}

        {notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-5xl">🔔</p>
            <p className="text-gray-500 font-medium">No notifications yet</p>
            <p className="text-gray-400 text-sm">You'll see likes and comments here</p>
          </div>
        )}
      </div>
    </div>
  );
}
