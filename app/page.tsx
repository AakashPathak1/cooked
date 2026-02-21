"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getFeedDishes, DishDoc } from "@/lib/firestore";
import { DishCard } from "@/components/DishCard";
import { Plus } from "lucide-react";
import Link from "next/link";

export default function FeedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [dishes, setDishes] = useState<DishDoc[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getFeedDishes(20).then(setDishes).finally(() => setFetching(false));
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">🍳 cooked</h1>
          <Link href="/upload">
            <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center shadow shadow-orange-200">
              <Plus className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
          </Link>
        </div>
      </div>

      <div className="px-4 pt-3">
        {dishes.map((dish) => (
          <DishCard key={dish.id} dish={dish} />
        ))}

        {dishes.length === 0 && (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🍽️</p>
            <p className="font-semibold text-gray-700">Nothing here yet</p>
            <p className="text-sm text-gray-400 mt-1">Be the first to post a dish</p>
          </div>
        )}
      </div>
    </div>
  );
}
