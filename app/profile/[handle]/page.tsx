"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getUserByHandle, getPersonalDishes, UserDoc, DishDoc } from "@/lib/firestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TierList } from "@/components/TierList";
import { eloTier, eloToRating } from "@/lib/eloDisplay";

type Tab = "grid" | "tierlist";

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [dishes, setDishes] = useState<DishDoc[]>([]);
  const [fetching, setFetching] = useState(true);
  const [tab, setTab] = useState<Tab>("grid");

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  useEffect(() => {
    if (!handle) return;
    async function load() {
      const u = await getUserByHandle(handle as string);
      if (!u) { setFetching(false); return; }
      setProfile(u);
      // Show their public personal dishes (their personalElo on each)
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

  const bestScore = dishes.length > 0
    ? Math.max(...dishes.map((d) => d.personalElo ?? d.globalScore ?? 1200))
    : null;

  return (
    <div className="mb-nav">
      {/* Header */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-sm z-40 px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold">@{profile.handle}</h1>
      </div>

      {/* Profile info */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-4">
        <Avatar className="h-20 w-20 border-2 border-gray-100">
          <AvatarImage src={profile.photoURL} />
          <AvatarFallback className="text-2xl">{profile.displayName?.[0] ?? "U"}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{profile.displayName}</h2>
          <div className="flex gap-5 mt-2">
            <div className="text-center">
              <p className="font-bold text-lg leading-tight">{dishes.length}</p>
              <p className="text-xs text-gray-400">dishes</p>
            </div>
            {bestScore !== null && (
              <div className="text-center">
                <p className="font-bold text-lg leading-tight">{eloToRating(bestScore)}</p>
                <p className="text-xs text-gray-400">best</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-4">
        <button
          onClick={() => setTab("grid")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === "grid" ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-400"}`}
        >
          Dishes
        </button>
        <button
          onClick={() => setTab("tierlist")}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === "tierlist" ? "text-orange-500 border-b-2 border-orange-500" : "text-gray-400"}`}
        >
          Tier List
        </button>
      </div>

      <div className="px-4 pt-3">
        {tab === "grid" && (
          <>
            {dishes.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-3xl mb-2">🍽️</p>
                <p className="text-gray-400 text-sm">No public dishes yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                {dishes.map((dish) => {
                  const score = dish.personalElo ?? dish.globalScore ?? 1200;
                  const tier = eloTier(score);
                  return (
                    <Link key={dish.id} href={`/dish/${dish.id}`}>
                      <div className="relative aspect-square bg-gray-100">
                        {dish.coverPhotoURL ? (
                          <img src={dish.coverPhotoURL} alt={dish.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
                        )}
                        <div className={`absolute bottom-1 right-1 ${tier.color} rounded-full h-6 w-6 flex items-center justify-center shadow`}>
                          <span className="text-white text-[8px] font-bold">{tier.label}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "tierlist" && <TierList dishes={dishes} />}
      </div>
    </div>
  );
}
