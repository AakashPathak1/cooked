"use client";

import useSWRInfinite from "swr/infinite";
import type { Paged } from "@/lib/types";

/** Cursor-paginated list over `/api/...` endpoints that return `Paged<T>`. */
export function usePaged<T>(endpoint: string) {
  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<Paged<T>>(
    (index, previous) => {
      if (previous && !previous.nextCursor) return null;
      return index === 0 ? endpoint : `${endpoint}?cursor=${encodeURIComponent(previous!.nextCursor!)}`;
    },
    { revalidateFirstPage: false, revalidateOnFocus: false }
  );
  const items = data ? data.flatMap((p) => p.items) : [];
  const last = data?.[data.length - 1];
  return {
    items,
    error: error as Error | undefined,
    loading: isLoading,
    loadingMore: isValidating && size > 1 && !!data && data.length < size,
    hasMore: Boolean(last?.nextCursor),
    loadMore: () => setSize(size + 1),
    refresh: () => mutate(),
  };
}
