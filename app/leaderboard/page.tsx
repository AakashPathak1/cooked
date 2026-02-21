"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getLeaderboardDishes, getUserByUid, DishDoc, UserDoc } from "@/lib/firestore";
import { eloTier, eloToRating } from "@/lib/eloDisplay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function LeaderboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [dishes, setDishes] = useState<DishDoc[]>([]);
  const [creators, setCreators] = useState<Record<string, UserDoc>>({});
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getLeaderboardDishes(50).then(async (d) => {
      setDishes(d);
      const uniqueCreatorIds = Array.from(new Set(d.map((dish) => dish.creatorId)));
      const userMap: Record<string, UserDoc> = {};
      await Promise.all(
        uniqueCreatorIds.map(async (uid) => {
          const u = await getUserByUid(uid);
          if (u) userMap[uid] = u;
        })
      );
      setCreators(userMap);
    }).finally(() => setFetching(false));
  }, [user]);

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
      <div className="sticky top-0 bg-white/90 backdrop-blur-sm z-40 px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold">🏆 Leaderboard</h1>
        <p className="text-xs text-gray-400 mt-0.5">Public dishes ranked by avg ELO</p>
      </div>

      <div className="px-4 pt-3 space-y-2">
        {dishes.map((dish, i) => {
          const tier = eloTier(dish.globalScore ?? 1200);
          const rating = eloToRating(dish.globalScore ?? 1200);
          return (
            <Link key={dish.id} href={`/dish/${dish.id}`}>
              <div className="flex items-center gap-3 py-2.5 px-3 rounded-2xl bg-white border border-gray-100 shadow-sm active:bg-gray-50 transition-colors">
                {/* Rank */}
                <span className="text-base font-bold text-gray-400 w-7 text-center shrink-0">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                </span>

                {/* Photo */}
                <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  {dish.coverPhotoURL ? (
                    <img src={dish.coverPhotoURL} alt={dish.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">🍽️</div>
                  )}
                </div>

                {/* Name + creator */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{dish.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {creators[dish.creatorId] && (
                      <>
                        <Avatar className="h-3.5 w-3.5">
                          <AvatarImage src={creators[dish.creatorId].photoURL} />
                          <AvatarFallback className="text-[6px]">{creators[dish.creatorId].displayName?.[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-gray-400 truncate">{creators[dish.creatorId].displayName}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Tier badge */}
                <div className={`${tier.color} rounded-full h-10 w-10 flex flex-col items-center justify-center shadow shrink-0`}>
                  <span className="text-white text-[10px] font-bold leading-none">{tier.label}</span>
                  <span className="text-white text-[9px] leading-none opacity-80">{rating}</span>
                </div>
              </div>
            </Link>
          );
        })}

        {dishes.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🍽️</p>
            <p className="text-gray-500 font-medium">No public dishes yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
