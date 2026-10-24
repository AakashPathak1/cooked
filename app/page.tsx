"use client";

import { ChefHat } from "lucide-react";
import Link from "next/link";
import { FeedPost } from "@/components/dish-views";
import { LoadMore } from "@/components/infinite";
import { Shell } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Empty, ErrorState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaged } from "@/hooks/usePaged";
import type { DishSummary } from "@/lib/types";

function FeedSkeleton() {
  return (
    <div className="space-y-10" aria-label="Loading feed" aria-busy>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export default function FeedPage() {
  const feed = usePaged<DishSummary>("/api/feed");

  return (
    <Shell>
      {feed.loading ? (
        <FeedSkeleton />
      ) : feed.error ? (
        <ErrorState message={feed.error.message} onRetry={feed.refresh} />
      ) : feed.items.length === 0 ? (
        <Empty
          title="Nothing cooked yet"
          body="Photograph the next thing you make. Friends see it here, and it joins your ranking."
          action={
            <Button asChild size="lg">
              <Link href="/upload">
                <ChefHat className="h-5 w-5" aria-hidden /> Add your first dish
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">
          {feed.items.map((dish, i) => (
            <FeedPost key={dish.id} dish={dish} priority={i === 0} />
          ))}
          <LoadMore hasMore={feed.hasMore} loading={feed.loadingMore} onVisible={feed.loadMore} />
          {!feed.hasMore && (
            <p className="py-6 text-center text-sm text-mute">You&apos;re all caught up.</p>
          )}
        </div>
      )}
    </Shell>
  );
}
