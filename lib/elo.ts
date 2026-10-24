/**
 * Pure ELO maths. No I/O, safe to import from both server and client code.
 *
 * Ratings are stored as plain integers. The default of 1200 maps to a 5.0 on
 * the 0–10 display scale (see `lib/score.ts`).
 */

export const DEFAULT_RATING = 1200;
export const K_FACTOR = 32;

/**
 * Hard bounds on a stored rating. They are far outside anything reachable in
 * normal use (display scale is 1000–1400) but stop a single user from
 * dragging a dish's global average arbitrarily far by spamming comparisons.
 */
export const MIN_RATING = 900;
export const MAX_RATING = 1700;

export type DuelResult = "a" | "b" | "tie";

/** Probability that a player rated `ratingA` beats one rated `ratingB`. */
export function expected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function clampRating(rating: number): number {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(rating)));
}

export function newRating(oldRating: number, actual: number, expectedScore: number): number {
  return clampRating(oldRating + K_FACTOR * (actual - expectedScore));
}

export interface EloResult {
  winnerNewElo: number;
  loserNewElo: number;
}

/** Decisive result: `winnerElo` beat `loserElo`. */
export function calculateElo(winnerElo: number, loserElo: number): EloResult {
  return {
    winnerNewElo: newRating(winnerElo, 1, expected(winnerElo, loserElo)),
    loserNewElo: newRating(loserElo, 0, expected(loserElo, winnerElo)),
  };
}

/**
 * Resolve a head-to-head between dishes A and B, including ties. A tie scores
 * 0.5 for both sides, so the higher-rated dish gives up a little ground.
 */
export function resolveDuel(
  eloA: number,
  eloB: number,
  result: DuelResult
): { a: number; b: number } {
  const scoreA = result === "a" ? 1 : result === "b" ? 0 : 0.5;
  return {
    a: newRating(eloA, scoreA, expected(eloA, eloB)),
    b: newRating(eloB, 1 - scoreA, expected(eloB, eloA)),
  };
}

// ─── Quick ratings ───────────────────────────────────────────────────────────
// Asked when posting a dish or accepting a tag. Each one anchors the dish's
// starting rating, which later head-to-head duels then refine.

export const QUICK_RATINGS = {
  loved: 1360, // → 9.0
  good: 1280, //  → 7.0
  okay: 1200, //  → 5.0
  meh: 1100, //   → 2.5
} as const;

export type QuickRating = keyof typeof QUICK_RATINGS;

export const QUICK_RATING_KEYS = Object.keys(QUICK_RATINGS) as QuickRating[];

export const QUICK_RATING_OPTIONS: { key: QuickRating; label: string; hint: string }[] = [
  { key: "loved", label: "Loved it", hint: "Would make again tomorrow" },
  { key: "good", label: "Pretty good", hint: "Solid, no notes" },
  { key: "okay", label: "It was okay", hint: "Fine, forgettable" },
  { key: "meh", label: "Not for me", hint: "Wouldn't repeat it" },
];

/**
 * Arithmetic mean of a set of ratings, rounded to an integer. Empty input
 * falls back to the default rating.
 */
export function averageRating(ratings: number[]): number {
  if (ratings.length === 0) return DEFAULT_RATING;
  return Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length);
}
