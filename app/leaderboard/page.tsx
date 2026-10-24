"use client";

import { LeaderRow } from "@/components/dish-views";
import { LoadMore } from "@/components/infinite";
import { PageTitle, Shell } from "@/components/nav";
import { Empty, ErrorState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaged } from "@/hooks/usePaged";
import type { DishSummary } from "@/lib/types";

export default function LeaderboardPage() {
  const board = usePaged<DishSummary>("/api/leaderboard");
  return (
    <Shell>
      <PageTitle title="Top dishes" sub="Ranked by everyone who has cooked or tried them." />
      {board.loading ? (
        <div className="space-y-3" aria-busy>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full" />
          ))}
        </div>
      ) : board.error ? (
        <ErrorState message={board.error.message} onRetry={board.refresh} />
      ) : board.items.length === 0 ? (
        <Empty title="No rankings yet" body="Once dishes are added and compared, the best ones rise to the top." />
      ) : (
        <>
          <ol className="divide-y divide-line/60">
            {board.items.map((dish, i) => (
              <LeaderRow key={dish.id} dish={dish} rank={i + 1} />
            ))}
          </ol>
          <LoadMore hasMore={board.hasMore} loading={board.loadingMore} onVisible={board.loadMore} />
        </>
      )}
    </Shell>
  );
}
