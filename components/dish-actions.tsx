"use client";

import { Bookmark, Heart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { errorMessage, request } from "@/lib/client/api";
import { cn } from "@/lib/cn";

/** Optimistic toggle state that re-syncs when the server value changes. */
function useToggle(initial: boolean, count: number) {
  const [on, setOn] = useState(initial);
  const [n, setN] = useState(count);
  const busy = useRef(false);
  useEffect(() => setOn(initial), [initial]);
  useEffect(() => setN(count), [count]);
  return { on, setOn, n, setN, busy };
}

export function LikeButton({
  dishId,
  liked,
  count,
  className,
}: {
  dishId: string;
  liked: boolean;
  count: number;
  className?: string;
}) {
  const toast = useToast();
  const { on, setOn, n, setN, busy } = useToggle(liked, count);
  const [pop, setPop] = useState(0);

  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    const next = !on;
    setOn(next);
    setN((v) => Math.max(0, v + (next ? 1 : -1)));
    if (next) setPop((p) => p + 1);
    try {
      const res = await request<{ liked: boolean; likesCount: number }>(`/api/dishes/${dishId}/like`, {
        method: "PUT",
        body: { liked: next },
      });
      setOn(res.liked);
      setN(res.likesCount);
    } catch (err) {
      setOn(!next);
      setN((v) => Math.max(0, v + (next ? -1 : 1)));
      toast({ message: errorMessage(err), tone: "error" });
    } finally {
      busy.current = false;
    }
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Unlike" : "Like"}
      className={cn("group inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium hover:bg-sunk", on ? "text-danger" : "text-mute", className)}
    >
      <Heart
        key={pop}
        className={cn("h-[22px] w-[22px]", on && "animate-like fill-current")}
        aria-hidden
      />
      <span className="tabular min-w-[1ch]">{n > 0 ? n : ""}</span>
    </button>
  );
}

export function SaveButton({ dishId, saved, className }: { dishId: string; saved: boolean; className?: string }) {
  const toast = useToast();
  const { on, setOn, busy } = useToggle(saved, 0);

  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    const next = !on;
    setOn(next);
    try {
      await request(`/api/dishes/${dishId}/save`, { method: "PUT", body: { saved: next } });
      if (next) toast({ message: "Saved to your list" });
    } catch (err) {
      setOn(!next);
      toast({ message: errorMessage(err), tone: "error" });
    } finally {
      busy.current = false;
    }
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Remove from saved" : "Save"}
      className={cn("inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-sunk", on ? "text-brand" : "text-mute", className)}
    >
      <Bookmark className={cn("h-[22px] w-[22px]", on && "fill-current")} aria-hidden />
    </button>
  );
}
