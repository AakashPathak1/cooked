"use client";

import Link from "next/link";
import { DishDoc } from "@/lib/firestore";
import { eloTier } from "@/lib/eloDisplay";

interface TierListProps {
  dishes: DishDoc[];
}

const TIER_ORDER = ["S", "A", "B", "C", "D"];

const TIER_STYLES: Record<string, string> = {
  S: "bg-emerald-500",
  A: "bg-blue-500",
  B: "bg-amber-400",
  C: "bg-orange-400",
  D: "bg-red-400",
};

export function TierList({ dishes }: TierListProps) {
  if (dishes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-3xl mb-2">🍽️</p>
        <p className="text-gray-400 text-sm">No dishes yet.</p>
      </div>
    );
  }

  const groups: Record<string, DishDoc[]> = { S: [], A: [], B: [], C: [], D: [] };
  dishes.forEach((d) => {
    const score = d.personalElo ?? d.globalScore ?? 1200;
    const tier = eloTier(score);
    groups[tier.label].push(d);
  });

  const activeTiers = TIER_ORDER.filter((t) => groups[t].length > 0);

  return (
    <div className="space-y-2">
      {activeTiers.map((tierLabel) => (
        <div key={tierLabel} className="flex items-stretch gap-2 rounded-2xl overflow-hidden border border-gray-100">
          {/* Tier label */}
          <div className={`${TIER_STYLES[tierLabel]} text-white font-bold text-lg w-11 flex items-center justify-center shrink-0`}>
            {tierLabel}
          </div>

          {/* Dish thumbnails */}
          <div className="flex flex-wrap gap-2 p-2 flex-1 bg-white min-h-[64px] items-center">
            {groups[tierLabel]
              .sort((a, b) => {
                const sa = a.personalElo ?? a.globalScore ?? 1200;
                const sb = b.personalElo ?? b.globalScore ?? 1200;
                return sb - sa;
              })
              .map((dish) => (
                <Link key={dish.id} href={`/dish/${dish.id}`}>
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-100" title={dish.name}>
                    {dish.coverPhotoURL ? (
                      <img src={dish.coverPhotoURL} alt={dish.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
                    )}
                  </div>
                </Link>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
