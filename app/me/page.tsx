"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getPersonalDishes, getPendingTags, DishDoc } from "@/lib/firestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { eloToRating, scoreColor } from "@/lib/eloDisplay";
import { Plus, CalendarDays, Trophy, ChevronRight, Tag } from "lucide-react";

type SortMode = "date" | "elo";

export default function MePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [dishes, setDishes] = useState<DishDoc[]>([]);
  const [pendingTags, setPendingTags] = useState<DishDoc[]>([]);
  const [fetching, setFetching] = useState(true);
  const [sort, setSort] = useState<SortMode>("date");

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getPersonalDishes(user.uid),
      getPendingTags(user.uid),
    ]).then(([d, p]) => {
      setDishes(d);
      setPendingTags(p);
    }).finally(() => setFetching(false));
  }, [user]);

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Stats
  const totalDishes = dishes.length;
  // Collab = you tagged someone (creator with taggedUserIds) OR someone tagged you (role === "tagged")
  const collaborated = dishes.filter(
    (d) => d.role === "tagged" || (d.role === "creator" && d.taggedUserIds?.length > 0)
  ).length;

  // Sorted list
  const sorted = [...dishes].sort((a, b) => {
    if (sort === "elo") {
      return (b.personalElo ?? b.globalScore) - (a.personalElo ?? a.globalScore);
    }
    // date — newest first
    const ta = a.createdAt?.toMillis() ?? 0;
    const tb = b.createdAt?.toMillis() ?? 0;
    return tb - ta;
  });

  return (
    <div className="mb-nav">
      {/* Header */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-sm z-40 px-4 pt-12 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Me</h1>
          <Link href="/upload">
            <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center shadow shadow-orange-200">
              <Plus className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
          </Link>
        </div>
      </div>

      {/* Profile info */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-4">
        <Avatar className="h-18 w-18 border-2 border-gray-100" style={{ height: 72, width: 72 }}>
          <AvatarImage src={user?.photoURL ?? ""} />
          <AvatarFallback className="text-2xl">{user?.displayName?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{user?.displayName}</h2>
          <p className="text-sm text-gray-400">@{user?.displayName?.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="mx-4 mb-4 grid grid-cols-2 gap-2">
        <StatBox label="Dishes" value={totalDishes} />
        <StatBox label="Collabs" value={collaborated} />
      </div>

      {/* Pending tags — dishes tagged in but not yet accepted */}
      {pendingTags.length > 0 && (
        <div className="px-4 mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Tag className="h-3.5 w-3.5 text-orange-500" />
            <p className="text-sm font-semibold text-gray-700">
              Incoming tags
            </p>
            <span className="ml-auto bg-orange-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
              {pendingTags.length}
            </span>
          </div>
          <div className="space-y-2">
            {pendingTags.map((dish) => (
              <Link key={dish.id} href={`/dish/${dish.id}`}>
                <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-3 py-2.5 active:bg-orange-100 transition-colors">
                  {dish.coverPhotoURL ? (
                    <img src={dish.coverPhotoURL} alt={dish.name} className="h-12 w-12 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center text-xl shrink-0">🍽️</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">{dish.name}</p>
                    <p className="text-xs text-orange-500 mt-0.5">Tap to rate &amp; add to your profile</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-orange-400 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sort toggle */}
      <div className="px-4 mb-3 flex items-center gap-2">
        <p className="text-sm font-semibold text-gray-700 flex-1">Your dishes</p>
        <div className="flex bg-gray-100 rounded-xl p-0.5">
          <button
            onClick={() => setSort("date")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sort === "date" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
            }`}
          >
            <CalendarDays className="h-3 w-3" /> Date
          </button>
          <button
            onClick={() => setSort("elo")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sort === "elo" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
            }`}
          >
            <Trophy className="h-3 w-3" /> Score
          </button>
        </div>
      </div>

      {/* Dish grid */}
      {sorted.length === 0 ? (
        <div className="text-center py-16 px-4">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="font-semibold text-gray-700">No dishes yet</p>
          <p className="text-sm text-gray-400 mt-1">Upload one or get tagged by a friend</p>
          <Link href="/upload">
            <button className="mt-4 px-6 py-3 bg-orange-500 text-white font-semibold rounded-2xl shadow-lg shadow-orange-200 text-sm">
              Upload a dish
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5 px-4">
          {sorted.map((dish) => {
            const score = dish.personalElo ?? dish.globalScore ?? 1200;
            const rating = eloToRating(score);
            return (
              <Link key={dish.id} href={`/dish/${dish.id}`}>
                <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  {dish.coverPhotoURL ? (
                    <img src={dish.coverPhotoURL} alt={dish.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
                  )}
                  {/* Score badge — smooth gradient */}
                  <div
                    className="absolute bottom-1 right-1 rounded-full h-7 w-7 flex items-center justify-center shadow"
                    style={{ backgroundColor: scoreColor(score) }}
                  >
                    <span className="text-white text-[8px] font-bold leading-none">{rating}</span>
                  </div>
                  {/* Role pill */}
                  {dish.role === "tagged" && (
                    <div className="absolute top-1 left-1 bg-blue-500 rounded-full px-1.5 py-0.5">
                      <span className="text-white text-[8px] font-bold">collab</span>
                    </div>
                  )}
                  {dish.role === "tried" && (
                    <div className="absolute top-1 left-1 bg-purple-500 rounded-full px-1.5 py-0.5">
                      <span className="text-white text-[8px] font-bold">tried</span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-2xl py-3 flex flex-col items-center gap-0.5">
      <p className="text-xl font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
