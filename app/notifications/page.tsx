"use client";

import Link from "next/link";
import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { PageTitle, Shell } from "@/components/nav";
import { Avatar } from "@/components/ui/avatar";
import { Empty, ErrorState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { request } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { describeNotification } from "@/lib/notify-text";
import type { NotificationDTO } from "@/lib/types";

export default function NotificationsPage() {
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, error, mutate } = useSWR<{ items: NotificationDTO[]; unread: number }>("/api/notifications", {
    revalidateOnFocus: true,
  });

  // Opening the page marks everything as seen, but keep the unread styling
  // for this visit so people can see what's new.
  useEffect(() => {
    if (!data || data.unread === 0) return;
    const t = setTimeout(() => {
      void request("/api/notifications/read", { method: "POST" })
        .then(() => mutateGlobal("/api/me"))
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [data, mutateGlobal]);

  return (
    <Shell>
      <PageTitle title="Activity" />
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : !data ? (
        <div className="space-y-3" aria-busy>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : data.items.length === 0 ? (
        <Empty title="No activity yet" body="Likes, comments and tags on your dishes will show up here." />
      ) : (
        <ul className="-mx-2">
          {data.items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.dishId ? `/dish/${n.dishId}` : "/"}
                className={cn("flex items-start gap-3 rounded-2xl px-2 py-3 hover:bg-sunk", !n.read && "bg-brand-soft/60")}
              >
                <Avatar name={n.from.displayName} src={n.from.photoURL} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug">{describeNotification(n.type, n.from.displayName, n.dishName, n.preview)}</p>
                  {n.createdAt && <p className="mt-0.5 text-sm text-mute">{timeAgo(n.createdAt)}</p>}
                </div>
                {!n.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
