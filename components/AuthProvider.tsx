"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, ReactNode } from "react";
import { createUserDoc } from "@/lib/firestore";

// Inner component that syncs the session user into Firestore
function UserDocSync() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;
    const u = session.user as { id?: string; name?: string | null; image?: string | null; email?: string | null };
    createUserDoc({
      uid: u.id ?? u.email ?? "unknown",
      displayName: u.name ?? null,
      photoURL: u.image ?? null,
      email: u.email ?? null,
    }).catch(console.error);
  }, [session]);

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <UserDocSync />
      {children}
    </SessionProvider>
  );
}
