"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getAllUsers, getPersonalDishes, UserDoc } from "@/lib/firestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { eloToRating } from "@/lib/eloDisplay";
import { Search } from "lucide-react";

interface UserWithStats extends UserDoc {
  dishCount: number;
  bestScore: string | null;
}

export default function PeoplePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [filtered, setFiltered] = useState<UserWithStats[]>([]);
  const [query, setQuery] = useState("");
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const allUsers = await getAllUsers();
      const withStats = await Promise.all(
        allUsers.map(async (u) => {
          const dishes = await getPersonalDishes(u.uid, true);
          const bestScore = dishes.length > 0
            ? eloToRating(Math.max(...dishes.map((d) => d.personalElo ?? d.globalScore ?? 1200)))
            : null;
          return { ...u, dishCount: dishes.length, bestScore };
        })
      );
      // Sort by dish count desc
      withStats.sort((a, b) => b.dishCount - a.dishCount);
      setUsers(withStats);
      setFiltered(withStats);
      setFetching(false);
    }
    load();
  }, [user]);

  useEffect(() => {
    if (!query.trim()) { setFiltered(users); return; }
    const q = query.toLowerCase();
    setFiltered(users.filter((u) =>
      u.displayName.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q)
    ));
  }, [query, users]);

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mb-nav">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md z-40 px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold mb-3">People</h1>
        {/* Search */}
        <div className="flex items-center gap-2 bg-gray-100 rounded-2xl px-3 py-2.5">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name or handle…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
          />
        </div>
      </div>

      <div className="px-4 pt-3 space-y-2">
        {filtered.map((u) => (
          <Link key={u.uid} href={`/profile/${u.handle}`}>
            <div className="flex items-center gap-3 py-3 px-3 rounded-2xl bg-white border border-gray-100 shadow-sm active:bg-gray-50 transition-colors">
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarImage src={u.photoURL} />
                <AvatarFallback className="bg-orange-100 text-orange-600 font-semibold">
                  {u.displayName?.[0] ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{u.displayName}</p>
                <p className="text-xs text-gray-400">@{u.handle}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-sm">{u.dishCount}</p>
                <p className="text-xs text-gray-400">dishes</p>
              </div>
              {u.bestScore && (
                <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shadow shadow-orange-200 shrink-0">
                  <span className="text-white text-xs font-bold">{u.bestScore}</span>
                </div>
              )}
            </div>
          </Link>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-3xl mb-2">👤</p>
            <p className="text-gray-400 text-sm">No users found</p>
          </div>
        )}
      </div>
    </div>
  );
}
