"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getPersonalDishes, DishDoc } from "@/lib/firestore";
import { PairwiseComparison } from "@/components/PairwiseComparison";
import Link from "next/link";

export default function RankPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [dishes, setDishes] = useState<DishDoc[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getPersonalDishes(user.uid)
      .then(setDishes)
      .finally(() => setFetching(false));
  }, [user]);

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (dishes.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center mb-nav">
        <p className="text-5xl">🤷</p>
        <p className="font-semibold text-gray-700">Not enough dishes to compare yet.</p>
        <p className="text-sm text-gray-400">Upload a dish or try one to start ranking.</p>
        <Link href="/upload">
          <button className="mt-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-2xl shadow-lg shadow-orange-200">
            Upload a dish
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-nav">
      {/* Header */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-sm z-40 px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold">⚔️ Rank</h1>
        <p className="text-xs text-gray-400 mt-0.5">Pick the dish you think is better</p>
      </div>

      <div className="px-4 pt-4">
        <PairwiseComparison dishes={dishes} onComplete={() => router.push("/me")} />
      </div>
    </div>
  );
}
