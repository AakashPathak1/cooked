"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getLeaderboardDishes, getUserByUid, DishDoc, UserDoc } from "@/lib/firestore";
import { eloToRating, scoreColor } from "@/lib/eloDisplay";
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
    <div className="mb-nav page-enter">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md z-40 px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold">🏆 Leaderboard</h1>
        <p className="text-xs text-gray-400 mt-0.5">Top public dishes by score</p>
      </div>

      <div className="px-4 pt-3 space-y-2">
        {dishes.map((dish, i) => {
          const score = dish.globalScore ?? 1200;
          const rating = eloToRating(score);
          const rankEmoji = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
          return (
            <Link key={dish.id} href={`/dish/${dish.id}`}>
              <div
                className="flex items-center gap-3 py-2.5 px-3 rounded-2xl bg-white border border-gray-100 shadow-sm active:scale-[0.98] active:bg-gray-50 transition-all card-enter"
                style={{ animationDelay: `${i * 35}ms` }}
              >
                {/* Rank */}
                <div className="w-8 flex items-center justify-center shrink-0">
                  {rankEmoji ? (
                    <span className="text-lg">{rankEmoji}</span>
                  ) : (
                    <span className="text-sm font-bold text-gray-300">{i + 1}</span>
                  )}
                </div>

                {/* Photo */}
                <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0 shadow-sm">
                  {dish.coverPhotoURL ? (
                    <img src={dish.coverPhotoURL} alt={dish.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg">🍽️</div>
                  )}
                </div>

                {/* Name + creator */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{dish.name}</p>
                  {creators[dish.creatorId] && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Avatar className="h-3.5 w-3.5">
                        <AvatarImage src={creators[dish.creatorId].photoURL} />
                        <AvatarFallback className="text-[6px]">
                          {creators[dish.creatorId].displayName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-gray-400 truncate">
                        {creators[dish.creatorId].displayName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Score badge — gradient */}
                <div
                  className="rounded-full h-11 w-11 flex items-center justify-center shadow-sm shrink-0"
                  style={{ backgroundColor: scoreColor(score) }}
                >
                  <span className="text-white text-xs font-bold">{rating}</span>
                </div>
              </div>
            </Link>
          );
        })}

        {dishes.length === 0 && (
          <div className="text-center py-20 fade-in">
            <p className="text-5xl mb-3 float">🍽️</p>
            <p className="text-gray-500 font-medium">No public dishes yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
