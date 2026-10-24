import "server-only";

import { averageRating } from "@/lib/elo";
import type { Reader } from "../store";
import { C, toElo, type EloRecord } from "./records";

/** Every participant's personal rating for a dish. */
export async function readDishElos(reader: Reader, dishId: string): Promise<EloRecord[]> {
  const rows = await reader.query(C.userDishElos, {
    where: [{ field: "dishId", op: "==", value: dishId }],
    select: ["userId", "dishId", "elo", "n"],
  });
  return rows.map(toElo);
}

/**
 * The dish's global score: the mean of its participants' ratings, after
 * applying pending changes. `changes` maps uid → new rating, or `null` to
 * drop that participant.
 */
export function globalScoreWith(
  current: EloRecord[],
  changes: Map<string, number | null>
): number | null {
  const merged = new Map<string, number>();
  for (const e of current) merged.set(e.userId, e.elo);
  for (const [uid, elo] of changes) {
    if (elo === null) merged.delete(uid);
    else merged.set(uid, elo);
  }
  if (merged.size === 0) return null;
  return averageRating([...merged.values()]);
}
