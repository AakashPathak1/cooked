"use client";

import useSWR from "swr";
import type { UserLite } from "@/lib/types";

export interface MeResponse {
  user: UserLite | null;
  unread: number;
  push: { configured: boolean; subscribed: boolean };
}

/** The signed-in person, unread count and push status. Refreshes quietly. */
export function useMe() {
  const { data, mutate, isLoading } = useSWR<MeResponse>("/api/me", { refreshInterval: 60_000 });
  return { me: data?.user ?? null, unread: data?.unread ?? 0, push: data?.push, loading: isLoading, mutate };
}
