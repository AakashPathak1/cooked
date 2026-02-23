"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  getActivityForUser,
  markNotificationsRead,
  ActivityItem,
} from "@/lib/firestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, MessageCircle } from "lucide-react";

function timeAgo(timestamp: ActivityItem["createdAt"]): string {
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
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getActivityForUser(user.uid).then(setActivities).finally(() => setFetching(false));
    // Clear unread badge
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
        <h1 className="text-xl font-bold">Activity</h1>
      </div>

      <div className="divide-y divide-gray-50">
        {activities.map((item) => (
          <Link key={item.id} href={`/dish/${item.dishId}`}>
            <div className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors">
              {/* Avatar with type badge */}
              <div className="relative shrink-0">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={item.fromPhotoURL} />
                  <AvatarFallback className="bg-orange-100 text-orange-600 font-semibold">
                    {item.fromDisplayName?.[0] ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <div className={`absolute -bottom-0.5 -right-0.5 rounded-full p-1 ${item.type === "like" ? "bg-red-500" : "bg-orange-500"}`}>
                  {item.type === "like"
                    ? <Heart className="h-2.5 w-2.5 text-white fill-white" />
                    : <MessageCircle className="h-2.5 w-2.5 text-white" />
                  }
                </div>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">
                  <span className="font-semibold">{item.fromDisplayName}</span>
                  {item.type === "like" ? " liked " : " commented on "}
                  <span className="font-semibold">{item.dishName}</span>
                </p>
                {item.type === "comment" && item.commentText && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">"{item.commentText}"</p>
                )}
                {item.createdAt && (
                  <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.createdAt)}</p>
                )}
              </div>
            </div>
          </Link>
        ))}

        {activities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-5xl">🔔</p>
            <p className="text-gray-500 font-medium">No activity yet</p>
            <p className="text-gray-400 text-sm">You'll see likes and comments here</p>
          </div>
        )}
      </div>
    </div>
  );
}
