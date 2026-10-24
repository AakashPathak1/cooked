"use client";

import { QUICK_RATINGS, QUICK_RATING_OPTIONS, type QuickRating } from "@/lib/elo";
import { cn } from "@/lib/cn";
import { ScoreStamp } from "@/components/ui/score-stamp";

/** First-impression rating that seeds a dish's score before any duels. */
export function RatingPicker({
  value,
  onChange,
  name = "rating",
}: {
  value: QuickRating | null;
  onChange: (v: QuickRating) => void;
  name?: string;
}) {
  return (
    <div role="radiogroup" aria-label="How was it?" className="grid grid-cols-2 gap-2.5">
      {QUICK_RATING_OPTIONS.map((o) => {
        const selected = value === o.key;
        return (
          <label
            key={o.key}
            className={cn(
              "relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-brand/40",
              selected ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-mute/50"
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.key}
              checked={selected}
              onChange={() => onChange(o.key)}
              className="sr-only"
            />
            <ScoreStamp elo={QUICK_RATINGS[o.key]} size="sm" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{o.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-mute">{o.hint}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
