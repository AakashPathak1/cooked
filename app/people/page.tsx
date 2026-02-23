"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getAllUsers, getPersonalDishes, UserDoc } from "@/lib/firestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, ChevronRight } from "lucide-react";

interface UserWithStats extends UserDoc {
  dishCount: number;
  latestDishAt: number;
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
          const latestDishAt =
            dishes.length > 0
              ? Math.max(...dishes.map((d) => d.createdAt?.toMillis() ?? 0))
              : 0;
          return { ...u, dishCount: dishes.length, latestDishAt };
        })
      );
      // Sort by dish count desc, then by most recent dish as tiebreaker
      withStats.sort((a, b) =>
        b.dishCount !== a.dishCount
          ? b.dishCount - a.dishCount
          : b.latestDishAt - a.latestDishAt
      );
      setUsers(withStats);
      setFiltered(withStats);
      setFetching(false);
    }
    load();
  }, [user]);

  useEffect(() => {
    if (!query.trim()) { setFiltered(users); return; }
    const q = query.toLowerCase();
    setFiltered(
      users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          u.handle.toLowerCase().includes(q)
      )
    );
  }, [query, users]);

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mb-nav page-enter">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md z-40 px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold mb-3">People</h1>
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
        {filtered.map((u, i) => (
          <Link key={u.uid} href={`/profile/${u.handle}`}>
            <div
              className="flex items-center gap-3 py-3 px-3 rounded-2xl bg-white border border-gray-100 shadow-sm active:scale-[0.98] active:bg-gray-50 transition-all list-enter"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <Avatar className="h-12 w-12 shrink-0 ring-2 ring-gray-50">
                <AvatarImage src={u.photoURL} />
                <AvatarFallback className="bg-orange-100 text-orange-600 font-bold text-base">
                  {u.displayName?.[0] ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-tight truncate">{u.displayName}</p>
                <p className="text-xs text-gray-400 mt-0.5">@{u.handle}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <p className="font-bold text-sm leading-tight">{u.dishCount}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">dish{u.dishCount !== 1 ? "es" : ""}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </div>
            </div>
          </Link>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-20 fade-in">
            <p className="text-5xl mb-3 float">👤</p>
            <p className="text-gray-500 font-medium">No users found</p>
            {query && <p className="text-gray-400 text-sm mt-1">Try a different search</p>}
          </div>
        )}
      </div>
    </div>
  );
}
