"use client";

import { Star, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Cover } from "@/components/cover";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage, request } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import type { PhotoDTO } from "@/lib/types";

export function Gallery({
  dishId,
  photos,
  viewerUid,
  isOwner,
  onChanged,
}: {
  dishId: string;
  photos: PhotoDTO[];
  viewerUid: string | undefined;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  // Cover first, then the rest in the order they were added.
  const ordered = [...photos].sort((a, b) => Number(b.isCover) - Number(a.isCover));
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const current = ordered[Math.min(index, ordered.length - 1)];

  function go(i: number) {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast({ message: done });
      onChanged();
    } catch (err) {
      toast({ message: errorMessage(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const mine = current?.uploader?.uid === viewerUid;
  const canRemove = ordered.length > 1 && (isOwner || mine);
  const canCover = isOwner && !current?.isCover;

  return (
    <section aria-label="Photos">
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory overflow-x-auto md:mx-0 md:rounded-2xl"
      >
        {ordered.map((p, i) => (
          <div key={p.id} className="w-full shrink-0 snap-center md:overflow-hidden md:rounded-2xl">
            <Cover src={p.url} color={p.color} alt={`Photo ${i + 1} of ${ordered.length}`} ratio="aspect-[4/5]" priority={i === 0} className="max-h-[78dvh]" />
          </div>
        ))}
      </div>

      {ordered.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-none" role="tablist" aria-label="Choose photo">
          {ordered.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === index}
              aria-label={`Photo ${i + 1}`}
              onClick={() => go(i)}
              className={cn("h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-offset-2 ring-offset-bg transition", i === index ? "ring-2 ring-ink" : "opacity-70 hover:opacity-100")}
            >
              <Cover src={p.thumbUrl} color={p.color} ratio="aspect-square" />
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {current.uploader && ordered.length > 1 && (
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Avatar name={current.uploader.displayName} src={current.uploader.photoURL} size={22} />
              <span className="truncate font-medium">{current.uploader.displayName}</span>
              {current.createdAt && <span className="text-mute">{timeAgo(current.createdAt)}</span>}
            </div>
          )}
          <div className="ml-auto flex gap-1.5">
            {canCover && (
              <Button
                variant="soft"
                size="sm"
                disabled={busy}
                onClick={() => act(() => request(`/api/dishes/${dishId}/cover`, { method: "PUT", body: { logId: current.id } }), "Cover updated")}
              >
                <Star className="h-4 w-4" aria-hidden /> Make cover
              </Button>
            )}
            {canRemove && (
              <Button
                variant="dangerSoft"
                size="sm"
                disabled={busy}
                onClick={() => act(() => request(`/api/dishes/${dishId}/photos/${current.id}`, { method: "DELETE" }), "Photo removed")}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Remove
              </Button>
            )}
          </div>
        </div>
      )}
      {current?.notes && <p className="mt-2 text-[15px] leading-relaxed text-mute">{current.notes}</p>}
    </section>
  );
}
