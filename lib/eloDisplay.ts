export function eloTier(elo: number) {
  if (elo >= 1400) return { label: "S", color: "bg-emerald-500", text: "text-emerald-500" };
  if (elo >= 1300) return { label: "A", color: "bg-blue-500", text: "text-blue-500" };
  if (elo >= 1200) return { label: "B", color: "bg-amber-400", text: "text-amber-500" };
  if (elo >= 1100) return { label: "C", color: "bg-orange-400", text: "text-orange-400" };
  return { label: "D", color: "bg-red-400", text: "text-red-400" };
}

export function eloToRating(elo: number): string {
  // Maps ELO to a 0–10 rating. 1200 = 5.0, 1360 = 9.0, 1400 = 10.0
  const rating = Math.min(10, Math.max(0, ((elo - 1000) / 400) * 10));
  return rating.toFixed(1);
}

// Returns a Tailwind bg class representing a green→red gradient by score.
// Used for score badge backgrounds on cards and dish pages.
export function scoreBgClass(elo: number): string {
  const rating = Math.min(10, Math.max(0, ((elo - 1000) / 400) * 10));
  if (rating >= 8)   return "bg-green-500";
  if (rating >= 6.5) return "bg-lime-500";
  if (rating >= 5)   return "bg-amber-500";
  if (rating >= 3)   return "bg-orange-500";
  return "bg-red-500";
}
