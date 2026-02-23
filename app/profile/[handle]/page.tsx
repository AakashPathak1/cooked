"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getUserByHandle, getPersonalDishes, UserDoc, DishDoc } from "@/lib/firestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { eloToRating, scoreColor } from "@/lib/eloDisplay";

type SortMode = "date" | "score";

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [dishes, setDishes] = useState<DishDoc[]>([]);
  const [fetching, setFetching] = useState(true);
  const [sort, setSort] = useState<SortMode>("score");

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  useEffect(() => {
    if (!handle) return;
    async function load() {
      const u = await getUserByHandle(handle as string);
      if (!u) { setFetching(false); return; }
      setProfile(u);
      const d = await getPersonalDishes(u.uid, true);
      setDishes(d);
      setFetching(false);
    }
    load();
  }, [handle]);

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-400">User not found.</p>
      </div>
    );
  }

  // Solo: dishes the user created with nobody else tagged
  const soloDishes = dishes.filter(
    (d) => d.role === "creator" && (d.taggedUserIds?.length ?? 0) === 0
  );
  // Tagged: dishes they created and tagged someone in, OR were tagged in by someone else
  const taggedDishes = dishes.filter(
    (d) =>
      (d.role === "creator" && (d.taggedUserIds?.length ?? 0) > 0) ||
      d.role === "tagged"
  );

  const sorted = [...dishes].sort((a, b) => {
    if (sort === "score") {
      const sa = a.personalElo ?? a.globalScore ?? 1200;
      const sb = b.personalElo ?? b.globalScore ?? 1200;
      return sb - sa;
    }
    // date: newest first
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });

  return (
    <div className="mb-nav page-enter">
      {/* Sticky header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md z-40 px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold">@{profile.handle}</h1>
      </div>

      {/* Profile info */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-4">
        <Avatar className="h-20 w-20 ring-2 ring-orange-100">
          <AvatarImage src={profile.photoURL} />
          <AvatarFallback className="text-2xl bg-orange-100 text-orange-600">
            {profile.displayName?.[0] ?? "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{profile.displayName}</h2>
          <div className="flex gap-6 mt-2">
            <div className="text-center">
              <p className="font-bold text-lg leading-tight">{soloDishes.length}</p>
              <p className="text-[10px] text-gray-400 leading-tight">Solo</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg leading-tight">{taggedDishes.length}</p>
              <p className="text-[10px] text-gray-400 leading-tight">Tagged</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sort toggle */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <button
          onClick={() => setSort("score")}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${sort === "score" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}
        >
          By score
        </button>
        <button
          onClick={() => setSort("date")}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${sort === "date" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}
        >
          By date
        </button>
      </div>

      {/* Photo grid */}
      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-3xl mb-2">🍽️</p>
          <p className="text-gray-400 text-sm">No public dishes yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5">
          {sorted.map((dish, i) => {
            const dishScore = dish.globalScore ?? 1200;
            const rating = eloToRating(dishScore);
            return (
              <Link key={dish.id} href={`/dish/${dish.id}`}>
                <div
                  className="relative aspect-square bg-gray-100 active:opacity-75 transition-opacity card-enter"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {dish.coverPhotoURL ? (
                    <img src={dish.coverPhotoURL} alt={dish.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
                  )}
                  <div
                    className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center shadow"
                    style={{ backgroundColor: scoreColor(dishScore) }}
                  >
                    <span className="text-white text-[10px] font-bold">{rating}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
