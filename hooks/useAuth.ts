"use client";

import { useSession } from "next-auth/react";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
}

export function useAuth(): { user: AuthUser | null; loading: boolean } {
  const { data: session, status } = useSession();

  if (status === "loading") return { user: null, loading: true };
  if (!session?.user) return { user: null, loading: false };

  const u = session.user as { id?: string; name?: string | null; image?: string | null; email?: string | null };
  return {
    user: {
      uid: u.id ?? u.email ?? "unknown",
      displayName: u.name ?? null,
      photoURL: u.image ?? null,
      email: u.email ?? null,
    },
    loading: false,
  };
}
