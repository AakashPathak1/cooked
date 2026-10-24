import { Lock } from "lucide-react";
import Link from "next/link";
import { Cover } from "@/components/cover";
import { LikeButton, SaveButton } from "@/components/dish-actions";
import { Avatar } from "@/components/ui/avatar";
import { ScoreStamp } from "@/components/ui/score-stamp";
import { cn } from "@/lib/cn";
import { plural, timeAgo } from "@/lib/format";
import type { DishSummary } from "@/lib/types";

/** A dish in the feed: the photo leads, everything else stays quiet. */
export function FeedPost({ dish, priority }: { dish: DishSummary; priority?: boolean }) {
  const href = `/dish/${dish.id}`;
  return (
    <article className="pb-2">
      <header className="mb-2.5 flex items-center gap-2.5">
        <Link href={dish.creator.handle ? `/profile/${dish.creator.handle}` : "#"} className="flex min-w-0 items-center gap-2.5">
          <Avatar name={dish.creator.displayName} src={dish.creator.photoURL} size={32} />
          <span className="truncate text-sm font-semibold">{dish.creator.displayName}</span>
        </Link>
        {dish.createdAt && (
          <time dateTime={dish.createdAt} className="shrink-0 text-sm text-mute">
            {timeAgo(dish.createdAt)}
          </time>
        )}
        {dish.isPrivate && <Lock className="ml-auto h-4 w-4 text-mute" aria-label="Private" />}
      </header>

      <Link href={href} className="relative block overflow-hidden rounded-2xl" aria-label={dish.name}>
        <Cover src={dish.coverUrl} color={dish.coverColor} priority={priority} />
        <ScoreStamp elo={dish.elo} size="md" label="Group score" className="absolute bottom-3 left-3" />
      </Link>

      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold leading-snug tracking-tight">
            <Link href={href} className="hover:underline">
              {dish.name}
            </Link>
          </h2>
          {dish.taggedCount > 0 && (
            <p className="mt-0.5 text-sm text-mute">Cooked with {plural(dish.taggedCount, "friend")}</p>
          )}
        </div>
        <div className="-mr-2 flex shrink-0 items-center">
          <LikeButton dishId={dish.id} liked={dish.viewer.liked} count={dish.likesCount} />
          <SaveButton dishId={dish.id} saved={dish.viewer.saved} />
        </div>
      </div>

      {dish.viewer.pendingTag && (
        <Link
          href={href}
          className="mt-3 block rounded-xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand hover:brightness-95"
        >
          {dish.creator.displayName} tagged you. Add your take.
        </Link>
      )}
    </article>
  );
}

/** Square tile for profile grids. `personal` shows the owner's own rating instead. */
export function DishTile({ dish, personal, rank }: { dish: DishSummary; personal?: boolean; rank?: number }) {
  const elo = personal && dish.personalElo !== null ? dish.personalElo : dish.elo;
  return (
    <Link href={`/dish/${dish.id}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl">
        <Cover src={dish.coverUrl} color={dish.coverColor} ratio="aspect-square" className="transition-transform duration-300 group-hover:scale-[1.03]" />
        <ScoreStamp elo={elo} size="sm" className="absolute bottom-2 right-2" label={personal ? "Their score" : "Group score"} />
        {dish.isPrivate && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
            <Lock className="h-3.5 w-3.5" aria-label="Private" />
          </span>
        )}
        {rank !== undefined && (
          <span className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/60 px-1.5 text-xs font-bold text-white tabular">
            {rank}
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-sm font-semibold">{dish.name}</p>
    </Link>
  );
}

/** One line of the leaderboard. */
export function LeaderRow({ dish, rank }: { dish: DishSummary; rank: number }) {
  return (
    <li>
      <Link href={`/dish/${dish.id}`} className="flex items-center gap-3.5 rounded-2xl py-2 pr-2 hover:bg-sunk md:-mx-2 md:px-2">
        <span
          className={cn(
            "w-7 shrink-0 text-center font-display text-xl font-extrabold tabular",
            rank <= 3 ? "text-ink" : "text-mute"
          )}
        >
          {rank}
        </span>
        <div className="w-16 shrink-0 overflow-hidden rounded-xl">
          <Cover src={dish.coverUrl} color={dish.coverColor} ratio="aspect-square" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] font-bold leading-tight">{dish.name}</p>
          <p className="mt-0.5 truncate text-sm text-mute">{dish.creator.displayName}</p>
        </div>
        <ScoreStamp elo={dish.elo} size="md" label="Group score" />
      </Link>
    </li>
  );
}
