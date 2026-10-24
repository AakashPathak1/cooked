/** Pure logic for choosing which two dishes to compare next. */

export interface PairCandidate {
  id: string;
  elo: number;
  /** Duels this dish has already been through. */
  n: number;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Prefer the least-compared dish (or `focusId`), matched against the closest
 * rating among dishes it hasn't been paired with this session. Close ratings
 * make for the most informative duels. Returns null when nothing is left.
 */
export function pickPair(
  items: PairCandidate[],
  options: { focusId?: string; exclude?: string[]; rng?: () => number } = {}
): [PairCandidate, PairCandidate] | null {
  const rng = options.rng ?? Math.random;
  const seen = new Set(options.exclude ?? []);
  if (items.length < 2) return null;

  const open = (x: PairCandidate) =>
    items.filter((y) => y.id !== x.id && !seen.has(pairKey(x.id, y.id)));

  let anchors: PairCandidate[];
  const focus = options.focusId ? items.find((i) => i.id === options.focusId) : undefined;
  if (focus) {
    anchors = [focus];
  } else {
    const least = Math.min(...items.map((i) => i.n));
    anchors = items.filter((i) => i.n === least);
    // If the least-compared dishes have run out of opponents, widen out.
    anchors = [...anchors, ...items.filter((i) => i.n !== least)];
  }

  for (const [index, anchor] of anchors.entries()) {
    const opponents = open(anchor);
    if (opponents.length === 0) continue;
    const gap = (o: PairCandidate) => Math.abs(o.elo - anchor.elo);
    const best = Math.min(...opponents.map(gap));
    const closest = opponents.filter((o) => gap(o) <= best + 15);
    const pickFrom = index === 0 || focus ? closest : opponents;
    const opponent = pickFrom[Math.floor(rng() * pickFrom.length)];
    return rng() < 0.5 ? [anchor, opponent] : [opponent, anchor];
  }
  return null;
}
