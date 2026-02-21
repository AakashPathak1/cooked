"use client";

import { useState, useEffect } from "react";
import { recordComparison, DishDoc } from "@/lib/firestore";
import { useAuth } from "@/hooks/useAuth";

interface PairwiseComparisonProps {
  dishes: DishDoc[];
  onComplete: () => void;
  highlightDishId?: string;  // newly added dish — always appears in first few pairs
  completeLabel?: string;
}

function buildPairs(dishes: DishDoc[], highlightId?: string): [DishDoc, DishDoc][] {
  const pairs: [DishDoc, DishDoc][] = [];
  for (let i = 0; i < dishes.length - 1; i++) {
    pairs.push([dishes[i], dishes[i + 1]]);
  }
  // Shuffle
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  // If we have a highlight dish, ensure it's in the first pair
  if (highlightId) {
    const idx = pairs.findIndex(([a, b]) => a.id === highlightId || b.id === highlightId);
    if (idx > 0) [pairs[0], pairs[idx]] = [pairs[idx], pairs[0]];
  }
  return pairs.slice(0, Math.min(5, pairs.length));
}

export function PairwiseComparison({
  dishes,
  onComplete,
  highlightDishId,
  completeLabel = "Back to Me",
}: PairwiseComparisonProps) {
  const { user } = useAuth();
  const [pairs, setPairs] = useState<[DishDoc, DishDoc][]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  useEffect(() => {
    if (dishes.length >= 2) {
      setPairs(buildPairs(dishes, highlightDishId));
    }
  }, [dishes, highlightDishId]);

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold">All ranked!</h2>
        <p className="text-gray-500">Your personal scores updated.</p>
        <button
          onClick={onComplete}
          className="mt-4 px-8 py-3 bg-orange-500 text-white font-semibold rounded-2xl shadow-lg shadow-orange-200"
        >
          {completeLabel}
        </button>
      </div>
    );
  }

  if (pairs.length === 0 || index >= pairs.length) return null;

  const [left, right] = pairs[index];
  const total = pairs.length;

  async function pick(pickedDish: DishDoc, otherDish: DishDoc) {
    if (!user || loading) return;
    setWinner(pickedDish.id);
    setLoading(true);
    try {
      await recordComparison(user.uid, pickedDish.id, otherDish.id);
      await new Promise((r) => setTimeout(r, 350));
      setWinner(null);
      if (index + 1 >= total) {
        setDone(true);
      } else {
        setIndex((i) => i + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  function skip() {
    if (index + 1 >= total) setDone(true);
    else setIndex((i) => i + 1);
  }

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 font-medium shrink-0">{index + 1}/{total}</span>
      </div>

      <p className="text-center text-sm font-medium text-gray-500">Which do you prefer?</p>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3">
        {[left, right].map((dish, i) => {
          const isWinner = winner === dish.id;
          const isNew = dish.id === highlightDishId;
          return (
            <button
              key={dish.id}
              disabled={loading}
              onClick={() => pick(dish, i === 0 ? right : left)}
              className={`relative rounded-2xl overflow-hidden border-2 transition-all active:scale-95 disabled:opacity-70 ${
                isWinner ? "border-orange-500 scale-[0.97]" : "border-transparent"
              }`}
            >
              {/* Photo */}
              <div className="aspect-square bg-gray-100">
                {dish.coverPhotoURL ? (
                  <img src={dish.coverPhotoURL} alt={dish.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
                )}
              </div>

              {/* "New" badge */}
              {isNew && (
                <div className="absolute top-2 left-2 bg-orange-500 rounded-full px-2 py-0.5">
                  <span className="text-white text-[10px] font-bold">New</span>
                </div>
              )}

              {/* Name */}
              <div className="p-2.5 bg-white">
                <p className="font-semibold text-sm leading-snug line-clamp-2 text-left">{dish.name}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Skip */}
      <button
        type="button"
        disabled={loading}
        onClick={skip}
        className="w-full py-2 text-sm text-gray-400 font-medium"
      >
        Skip this pair
      </button>
    </div>
  );
}
