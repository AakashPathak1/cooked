"use client";

import { ArrowLeft, ExternalLink, Link2, Lock, Share2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { LikeButton, SaveButton } from "@/components/dish-actions";
import { Comments } from "@/components/dish/comments";
import { Gallery } from "@/components/dish/gallery";
import { OwnerTools } from "@/components/dish/owner-tools";
import { ParticipationPanel } from "@/components/dish/participation";
import { Shell } from "@/components/nav";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Empty, ErrorState } from "@/components/ui/empty";
import { ScoreStamp } from "@/components/ui/score-stamp";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/useMe";
import { ApiError } from "@/lib/client/api";
import { hostnameOf, plural, safeHttpUrl, timeAgo } from "@/lib/format";
import type { DishDetail } from "@/lib/types";

export default function DishPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { me } = useMe();
  const { data: dish, error, mutate, isLoading } = useSWR<DishDetail>(`/api/dishes/${id}`, { revalidateOnFocus: false });

  async function share() {
    if (!dish) return;
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: dish.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast({ message: "Link copied" });
      }
    } catch {
      /* dismissed */
    }
  }

  const back = (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="-ml-2 mb-3 inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-mute hover:bg-sunk hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back
    </button>
  );

  if (error instanceof ApiError && error.status === 404) {
    return (
      <Shell>
        <Empty
          title="This dish isn't available"
          body="It may have been deleted, or it's private to someone else."
          action={
            <Button asChild>
              <Link href="/">Back to the feed</Link>
            </Button>
          }
        />
      </Shell>
    );
  }
  if (error) {
    return (
      <Shell>
        <ErrorState message={error.message} onRetry={() => mutate()} />
      </Shell>
    );
  }
  if (isLoading || !dish) {
    return (
      <Shell>
        {back}
        <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
        <Skeleton className="mt-5 h-8 w-2/3" />
        <Skeleton className="mt-3 h-20 w-full" />
      </Shell>
    );
  }

  const recipe = safeHttpUrl(dish.recipeLink);
  const v = dish.viewer;
  const others = dish.participants.filter((p) => p.role !== "creator");

  return (
    <Shell>
      {back}
      <Gallery dishId={dish.id} photos={dish.photos} viewerUid={me?.uid} isOwner={v.isOwner} onChanged={() => mutate()} />

      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[32px] font-extrabold leading-[1.05] tracking-tightest">{dish.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-mute">
            <Link
              href={dish.creator.handle ? `/profile/${dish.creator.handle}` : "#"}
              className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline"
            >
              <Avatar name={dish.creator.displayName} src={dish.creator.photoURL} size={20} />
              {dish.creator.displayName}
            </Link>
            {dish.createdAt && <time dateTime={dish.createdAt}>{timeAgo(dish.createdAt)}</time>}
            {dish.isPrivate && (
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" aria-hidden /> Private
              </span>
            )}
          </div>
        </div>
        <ScoreStamp elo={dish.elo} size="lg" label="Group score" />
      </div>

      <div className="-ml-2.5 mt-3 flex items-center">
        <LikeButton dishId={dish.id} liked={v.liked} count={dish.likesCount} />
        <SaveButton dishId={dish.id} saved={v.saved} />
        <Button variant="ghost" size="icon" aria-label="Share" onClick={share}>
          <Share2 className="h-5 w-5" aria-hidden />
        </Button>
        {v.isOwner && <OwnerTools dish={dish} onChanged={() => mutate()} />}
      </div>

      {(dish.notes || recipe) && (
        <div className="mt-4 space-y-3">
          {dish.notes && <p className="whitespace-pre-wrap text-[16px] leading-relaxed">{dish.notes}</p>}
          {recipe && (
            <a
              href={recipe}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-2 rounded-full bg-sunk px-4 py-2 text-sm font-medium hover:bg-line"
            >
              <Link2 className="h-4 w-4" aria-hidden /> Recipe on {hostnameOf(recipe)}
              <ExternalLink className="h-3.5 w-3.5 text-mute" aria-hidden />
            </a>
          )}
        </div>
      )}

      <div className="mt-6">
        <ParticipationPanel dish={dish} onChanged={() => mutate()} />
      </div>

      {others.length > 0 && (
        <section className="mt-9" aria-labelledby="who-h">
          <h2 id="who-h" className="mb-3 font-display text-xl font-bold">
            {plural(others.length + 1, "cook")}
          </h2>
          <ul className="divide-y divide-line/60">
            {dish.participants.map((p) => (
              <li key={p.user.uid} className="flex items-center gap-3 py-2.5">
                <Avatar name={p.user.displayName} src={p.user.photoURL} size={36} />
                <div className="min-w-0 flex-1">
                  <Link href={p.user.handle ? `/profile/${p.user.handle}` : "#"} className="block truncate text-[15px] font-semibold hover:underline">
                    {p.user.displayName}
                  </Link>
                  <p className="text-sm text-mute">
                    {p.status === "pending" ? "Hasn't answered yet" : p.role === "creator" ? "Made it" : p.role === "tagged" ? "Cooked it too" : "Tried it"}
                  </p>
                </div>
                {p.elo !== null ? (
                  <ScoreStamp elo={p.elo} size="sm" label={`${p.user.displayName}'s score`} />
                ) : (
                  <span className="text-sm text-mute">Pending</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-9">
        <Comments
          dishId={dish.id}
          comments={dish.comments}
          truncated={dish.commentsTruncated}
          viewerUid={me?.uid}
          isOwner={v.isOwner}
          onChanged={() => mutate()}
        />
      </div>
    </Shell>
  );
}
