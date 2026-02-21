"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useAuth } from "@/hooks/useAuth";
import { usePendingRatings } from "@/hooks/usePendingRatings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Navbar() {
  const { user } = useAuth();
  const { pending } = usePendingRatings();

  async function handleSignOut() {
    await signOut({ callbackUrl: "/signin" });
  }

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl tracking-tight">
          🍳 cooked
        </Link>

        {user && (
          <div className="flex items-center gap-3">
            <Link href="/upload">
              <Button variant="outline" size="sm">Upload</Button>
            </Link>

            <Link href="/rank" className="relative">
              <Button variant="outline" size="sm">Rank</Button>
              {pending.length > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {pending.length}
                </Badge>
              )}
            </Link>

            <Link href="/leaderboard">
              <Button variant="ghost" size="sm">Board</Button>
            </Link>

            <Link href={`/profile/${user.displayName?.toLowerCase().replace(/\s+/g, "_") ?? user.uid}`}>
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarImage src={user.photoURL ?? ""} />
                <AvatarFallback>{user.displayName?.[0] ?? "U"}</AvatarFallback>
              </Avatar>
            </Link>

            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
