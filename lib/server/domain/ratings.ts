import "server-only";

import { DEFAULT_RATING, resolveDuel } from "@/lib/elo";
import { pickPair, type PairCandidate } from "@/lib/pairing";
import type { DuelDish, DuelPair, RateResult } from "@/lib/types";
import { now } from "../clock";
import { badRequest, forbidden } from "../errors";
import { getStore } from "../store";
import { C, DISH_FIELDS, coverUrl, memberId, toDish, toElo, type DishRecord } from "./records";
import { globalScoreWith, readDishElos } from "./scores";

interface Entry extends PairCandidate {
  dish: DishRecord;
}

/** The viewer's own pool, with dishes that no longer exist dropped. */
async function personalEntries(uid: string): Promise<Entry[]> {
  const store = getStore();
  const elos = (
    await store.query(C.userDishElos, {
      where: [{ field: "userId", op: "==", value: uid }],
    })
  ).map(toElo);
  const docs = await store.getMany(
    C.dishes,
    elos.map((e) => e.dishId),
    { select: [...DISH_FIELDS] }
  );
  const out: Entry[] = [];
  elos.forEach((e, i) => {
    const doc = docs[i];
    if (doc) out.push({ id: e.dishId, elo: e.elo, n: e.n, dish: toDish(doc) });
  });
  return out;
}

const toDuelDish = (e: Entry): DuelDish => ({
  id: e.id,
  name: e.dish.name,
  coverUrl: coverUrl(e.dish),
  coverColor: e.dish.coverColor,
  personalElo: e.elo,
});

function toPair(pair: [Entry, Entry] | null): DuelPair | null {
  return pair ? { a: toDuelDish(pair[0]), b: toDuelDish(pair[1]) } : null;
}

export async function suggestPair(
  uid: string,
  options: { focusId?: string; exclude?: string[] } = {}
): Promise<DuelPair | null> {
  const entries = await personalEntries(uid);
  return toPair(pickPair(entries, options) as [Entry, Entry] | null);
}

export async function recordDuel(
  uid: string,
  input: { a: string; b: string; result: "a" | "b" | "tie"; focusId?: string; exclude: string[] }
): Promise<RateResult> {
  if (input.a === input.b) throw badRequest("Pick two different dishes");
  const store = getStore();

  const changes = await store.runTransaction(async (tx) => {
    const [ma, mb, ea, eb] = await Promise.all([
      tx.get(C.userDishes, memberId(uid, input.a), { select: ["userId"] }),
      tx.get(C.userDishes, memberId(uid, input.b), { select: ["userId"] }),
      tx.get(C.userDishElos, memberId(uid, input.a)),
      tx.get(C.userDishElos, memberId(uid, input.b)),
    ]);
    if (!ma || !mb) throw forbidden("You can only compare dishes in your own list");
    const [poolA, poolB] = await Promise.all([
      readDishElos(tx, input.a),
      readDishElos(tx, input.b),
    ]);

    const before = {
      a: ea ? toElo(ea) : { elo: DEFAULT_RATING, n: 0 },
      b: eb ? toElo(eb) : { elo: DEFAULT_RATING, n: 0 },
    };
    const after = resolveDuel(before.a.elo, before.b.elo, input.result);
    const scoreA = globalScoreWith(poolA, new Map([[uid, after.a]]));
    const scoreB = globalScoreWith(poolB, new Map([[uid, after.b]]));

    tx.set(C.userDishElos, memberId(uid, input.a), {
      userId: uid,
      dishId: input.a,
      elo: after.a,
      n: before.a.n + 1,
    });
    tx.set(C.userDishElos, memberId(uid, input.b), {
      userId: uid,
      dishId: input.b,
      elo: after.b,
      n: before.b.n + 1,
    });
    if (scoreA !== null) tx.update(C.dishes, input.a, { globalScore: scoreA });
    if (scoreB !== null) tx.update(C.dishes, input.b, { globalScore: scoreB });

    const tie = input.result === "tie";
    const winner = input.result === "b" ? input.b : input.a;
    const loser = winner === input.a ? input.b : input.a;
    tx.create(C.ratings, store.newId(), {
      raterId: uid,
      winnerId: winner,
      loserId: loser,
      tie,
      createdAt: now(),
    });

    return [
      { dishId: input.a, before: before.a.elo, after: after.a },
      { dishId: input.b, before: before.b.elo, after: after.b },
    ];
  });

  const seen = [...input.exclude, [input.a, input.b].sort().join("|")];
  const next = await suggestPair(uid, { focusId: input.focusId, exclude: seen });
  return { changes, next };
}
