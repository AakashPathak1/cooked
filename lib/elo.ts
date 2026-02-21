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

export { DEFAULT_RATING };
