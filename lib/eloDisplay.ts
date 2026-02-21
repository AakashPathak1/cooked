export function eloTier(elo: number) {
  if (elo >= 1400) return { label: "S", color: "bg-emerald-500", text: "text-emerald-500" };
  if (elo >= 1300) return { label: "A", color: "bg-blue-500", text: "text-blue-500" };
  if (elo >= 1200) return { label: "B", color: "bg-amber-400", text: "text-amber-500" };
  if (elo >= 1100) return { label: "C", color: "bg-orange-400", text: "text-orange-400" };
  return { label: "D", color: "bg-red-400", text: "text-red-400" };
}

export function eloToRating(elo: number): string {
  // Maps ELO to a 0–10 rating. 1200 = 6.0, 1400 = 10.0
  const rating = Math.min(10, Math.max(0, ((elo - 1000) / 400) * 10));
  return rating.toFixed(1);
}
