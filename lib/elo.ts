const DEFAULT_RATING = 1200;
const K_FACTOR = 32;

export function expected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function newRating(oldRating: number, actual: number, expectedScore: number): number {
  return Math.round(oldRating + K_FACTOR * (actual - expectedScore));
}

export interface EloResult {
  winnerNewElo: number;
  loserNewElo: number;
}

export function calculateElo(winnerElo: number, loserElo: number): EloResult {
  const expectedWinner = expected(winnerElo, loserElo);
  const expectedLoser = expected(loserElo, winnerElo);

  return {
    winnerNewElo: newRating(winnerElo, 1, expectedWinner),
    loserNewElo: newRating(loserElo, 0, expectedLoser),
  };
}

// Quick initial rating anchors — asked when posting or accepting a tag.
// Maps to a 0–10 display score: loved=9.0, good=7.0, okay=5.0, meh=2.5
export const QUICK_RATINGS = {
  loved: 1360, // → 9.0
  good:  1280, // → 7.0
  okay:  1200, // → 5.0
  meh:   1100, // → 2.5
} as const;

export type QuickRating = keyof typeof QUICK_RATINGS;

export const QUICK_RATING_OPTIONS: { key: QuickRating; emoji: string; label: string }[] = [
  { key: "loved", emoji: "🤩", label: "Loved it" },
  { key: "good",  emoji: "😊", label: "Pretty good" },
  { key: "okay",  emoji: "😐", label: "It was okay" },
  { key: "meh",   emoji: "😕", label: "Didn't love it" },
];

export { DEFAULT_RATING };
