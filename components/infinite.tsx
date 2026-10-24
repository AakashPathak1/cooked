"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

/** Calls `onVisible` when scrolled near; also renders a manual fallback button. */
export function LoadMore({ hasMore, loading, onVisible }: { hasMore: boolean; loading: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cb.current();
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex h-16 items-center justify-center">
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-mute" aria-label="Loading more" />
      ) : (
        <button onClick={onVisible} className="text-sm font-medium text-mute hover:text-ink">
          Load more
        </button>
      )}
    </div>
  );
}
