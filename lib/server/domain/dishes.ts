import "server-only";

import { QUICK_RATINGS, type QuickRating } from "@/lib/elo";
import type {
  CommentDTO,
  DishDetail,
  DishSummary,
  Paged,
  ParticipantDTO,
  PhotoDTO,
} from "@/lib/types";
import { now } from "../clock";
import { decodeCursor, encodeCursor } from "../cursor";
import { notFound } from "../errors";
import { getStore } from "../store";
import { getMembership, loadDish, requireOwnedDish, requireViewableDish } from "./access";
import { notify } from "./notifications";
import {
  C,
  DISH_FIELDS,
  LOG_FIELDS,
  iso,
  memberId,
  photoUrl,
  toDish,
  toElo,
  toLog,
  toMember,
  type DishRecord,
} from "./records";
import { summarize, loadViewerFlags, viewerStateFor } from "./summaries";
import { getUser, getUsers, getUsersOrPlaceholder } from "./users";
import type { Viewer } from "./users";

export const FEED_PAGE_SIZE = 12;
export const LEADERBOARD_PAGE_SIZE = 25;
const COMMENT_WINDOW = 50;

// ─── Feed & leaderboard ──────────────────────────────────────────────────────

export async function getFeed(
  viewerUid: string,
  cursor?: string | null,
  limit = FEED_PAGE_SIZE
): Promise<Paged<DishSummary>> {
  const cur = decodeCursor(cursor);
  const rows = await getStore().query(C.dishes, {
    where: [{ field: "isPrivate", op: "==", value: false }],
    orderBy: [{ field: "createdAt", dir: "desc" }],
    limit: limit + 1,
    startAfter: cur ? [new Date(Number(cur[0])), String(cur[1])] : undefined,
    select: [...DISH_FIELDS],
  });
  const page = rows.slice(0, limit).map(toDish);
  const items = await summarize(viewerUid, page);
  const last = page[page.length - 1];
  return {
    items,
    nextCursor:
      rows.length > limit && last?.createdAt
        ? encodeCursor([last.createdAt.getTime(), last.id])
        : null,
  };
}

export async function getLeaderboard(
  viewerUid: string,
  cursor?: string | null,
  limit = LEADERBOARD_PAGE_SIZE
): Promise<Paged<DishSummary>> {
  const cur = decodeCursor(cursor);
  const rows = await getStore().query(C.dishes, {
    where: [{ field: "isPrivate", op: "==", value: false }],
    orderBy: [{ field: "globalScore", dir: "desc" }],
    limit: limit + 1,
    startAfter: cur ? [Number(cur[0]), String(cur[1])] : undefined,
    select: [...DISH_FIELDS],
  });
  const page = rows.slice(0, limit).map(toDish);
  const items = await summarize(viewerUid, page);
  const last = page[page.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor([last.globalScore, last.id]) : null,
  };
}

// ─── Dish detail ─────────────────────────────────────────────────────────────

export async function getDishDetail(viewerUid: string, dishId: string): Promise<DishDetail> {
  const dish = await requireViewableDish(viewerUid, dishId);
  const store = getStore();
  const byDish = [{ field: "dishId", op: "==" as const, value: dishId }];

  const [logRows, commentRows, memberRows, eloRows, flags, myElos] = await Promise.all([
    store.query(C.dishLogs, { where: byDish, select: [...LOG_FIELDS] }),
    store.query(C.comments, {
      where: byDish,
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit: COMMENT_WINDOW + 1,
    }),
    store.query(C.userDishes, { where: byDish }),
    store.query(C.userDishElos, { where: byDish, select: ["userId", "dishId", "elo", "n"] }),
    loadViewerFlags(viewerUid, [dishId]),
    store.query(C.userDishElos, {
      where: [{ field: "userId", op: "==", value: viewerUid }],
      select: ["userId", "dishId", "elo", "n"],
    }),
  ]);

  const logs = logRows
    .map(toLog)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  const commentsTruncated = commentRows.length > COMMENT_WINDOW;
  const comments = commentRows.slice(0, COMMENT_WINDOW).reverse();
  const members = memberRows.map(toMember);
  const elos = new Map(eloRows.map(toElo).map((e) => [e.userId, e.elo]));

  const memberUids = new Set(members.map((m) => m.userId));
  const pendingUids = dish.taggedUserIds.filter((uid) => !memberUids.has(uid) && uid !== dish.creatorId);

  const users = await getUsersOrPlaceholder([
    dish.creatorId,
    ...members.map((m) => m.userId),
    ...pendingUids,
    ...logs.map((l) => l.userId),
    ...comments.map((c) => String(c.data.userId ?? "")),
  ]);

  // Legacy dishes have no explicit cover; their cover was the newest photo.
  const coverLogId = dish.coverLogId ?? logs[logs.length - 1]?.id ?? null;

  const photos: PhotoDTO[] = logs.map((log) => {
    const version = log.createdAt?.getTime() ?? 0;
    return {
      id: log.id,
      uploader: users.get(log.userId) ?? null,
      url: photoUrl(log.id, "full", version),
      thumbUrl: photoUrl(log.id, "thumb", version),
      color: log.color,
      notes: log.notes,
      createdAt: iso(log.createdAt),
      isCover: log.id === coverLogId,
    };
  });

  const commentDtos: CommentDTO[] = comments.map((row) => ({
    id: row.id,
    user: users.get(String(row.data.userId ?? "")) ?? null,
    text: String(row.data.text ?? ""),
    createdAt: iso(row.data.createdAt instanceof Date ? row.data.createdAt : null),
  }));

  const participants: ParticipantDTO[] = [
    ...members.map(
      (m): ParticipantDTO => ({
        user: users.get(m.userId)!,
        role: m.role,
        elo: elos.get(m.userId) ?? null,
        status: "accepted",
      })
    ),
    ...pendingUids.map(
      (uid): ParticipantDTO => ({
        user: users.get(uid)!,
        role: "tagged",
        elo: null,
        status: "pending",
      })
    ),
  ].sort((a, b) => {
    const rank = (p: ParticipantDTO) => (p.role === "creator" ? 0 : p.status === "accepted" ? 1 : 2);
    return rank(a) - rank(b) || (b.elo ?? 0) - (a.elo ?? 0);
  });

  const state = viewerStateFor(viewerUid, dish, flags);
  const myElo = elos.get(viewerUid) ?? null;
  const pool = myElos.map(toElo);
  const personalRank =
    state.role && myElo !== null
      ? {
          position: 1 + pool.filter((e) => e.elo > myElo).length,
          total: pool.length,
        }
      : null;

  return {
    id: dish.id,
    name: dish.name,
    notes: dish.notes,
    recipeLink: dish.recipeLink,
    isPrivate: dish.isPrivate,
    createdAt: iso(dish.createdAt),
    creator: users.get(dish.creatorId)!,
    elo: dish.globalScore,
    likesCount: dish.likesCount,
    photos,
    comments: commentDtos,
    commentsTruncated,
    participants,
    viewer: {
      ...state,
      isOwner: dish.creatorId === viewerUid,
      personalElo: myElo,
      personalRank,
      canTry: dish.creatorId !== viewerUid && !state.role,
    },
  };
}

export async function getLikers(viewerUid: string, dishId: string) {
  await requireViewableDish(viewerUid, dishId);
  const rows = await getStore().query(C.likes, {
    where: [{ field: "dishId", op: "==", value: dishId }],
    limit: 200,
    select: ["userId"],
  });
  const users = await getUsers(rows.map((r) => String(r.data.userId ?? "")));
  return [...users.values()];
}

// ─── Create / update / delete ────────────────────────────────────────────────

export interface NewDishInput {
  name: string;
  notes: string;
  recipeLink: string;
  taggedUserIds: string[];
  isPrivate: boolean;
  quickRating: QuickRating;
  photo: string;
  thumb: string;
  color: string | null;
}

export async function createDish(viewer: Viewer, input: NewDishInput): Promise<{ id: string }> {
  const store = getStore();
  const actor = await getUser(viewer.uid);
  if (!actor) throw notFound("Your profile hasn't been set up yet. Try reloading.");

  // Drop self, duplicates and ids that don't belong to a real user.
  const wanted = [...new Set(input.taggedUserIds)].filter((uid) => uid !== viewer.uid);
  const real = await getUsers(wanted);
  const tagged = wanted.filter((uid) => real.has(uid));

  const dishId = store.newId();
  const logId = store.newId();
  const t = now();
  const elo = QUICK_RATINGS[input.quickRating];

  const batch = store.batch();
  batch.create(C.dishes, dishId, {
    creatorId: viewer.uid,
    name: input.name,
    notes: input.notes,
    recipeLink: input.recipeLink,
    taggedUserIds: tagged,
    likesCount: 0,
    isPrivate: input.isPrivate,
    globalScore: elo,
    coverLogId: logId,
    coverVersion: t.getTime(),
    coverColor: input.color,
    createdAt: t,
    updatedAt: t,
  });
  batch.create(C.dishLogs, logId, {
    dishId,
    userId: viewer.uid,
    photoURL: input.photo,
    thumbURL: input.thumb,
    color: input.color,
    notes: "",
    createdAt: t,
  });
  batch.create(C.userDishes, memberId(viewer.uid, dishId), {
    userId: viewer.uid,
    dishId,
    role: "creator",
  });
  batch.create(C.userDishElos, memberId(viewer.uid, dishId), {
    userId: viewer.uid,
    dishId,
    elo,
    n: 0,
  });
  await batch.commit();

  await Promise.all(
    tagged.map((toUid) =>
      notify({ type: "tag", toUid, from: actor, dishId, dishName: input.name, dedupe: true })
    )
  );
  return { id: dishId };
}

export interface DishPatch {
  name?: string;
  notes?: string;
  recipeLink?: string;
  isPrivate?: boolean;
}

export async function updateDish(viewerUid: string, dishId: string, patch: DishPatch): Promise<void> {
  await requireOwnedDish(viewerUid, dishId);
  const batch = getStore().batch();
  batch.update(C.dishes, dishId, { ...patch, updatedAt: now() });
  await batch.commit();
}

/** Remove a dish and everything that hangs off it. Callers check ownership. */
export async function deleteDishCascade(dishId: string): Promise<void> {
  const store = getStore();
  const byDish = [{ field: "dishId", op: "==" as const, value: dishId }];
  const idOnly = { select: ["dishId"] };

  const [logs, members, elos, likes, comments, saved, notifications, wins, losses] =
    await Promise.all([
      store.query(C.dishLogs, { where: byDish, ...idOnly }),
      store.query(C.userDishes, { where: byDish, ...idOnly }),
      store.query(C.userDishElos, { where: byDish, ...idOnly }),
      store.query(C.likes, { where: byDish, ...idOnly }),
      store.query(C.comments, { where: byDish, ...idOnly }),
      store.query(C.saved, { where: byDish, ...idOnly }),
      store.query(C.notifications, { where: byDish, ...idOnly }),
      store.query(C.ratings, {
        where: [{ field: "winnerId", op: "==", value: dishId }],
        select: ["winnerId"],
      }),
      store.query(C.ratings, {
        where: [{ field: "loserId", op: "==", value: dishId }],
        select: ["loserId"],
      }),
    ]);

  const batch = store.batch();
  const drop = (col: string, rows: { id: string }[]) => rows.forEach((r) => batch.delete(col, r.id));
  drop(C.dishLogs, logs);
  drop(C.userDishes, members);
  drop(C.userDishElos, elos);
  drop(C.likes, likes);
  drop(C.comments, comments);
  drop(C.saved, saved);
  drop(C.notifications, notifications);
  drop(C.ratings, wins);
  drop(C.ratings, losses);
  // The dish itself goes last so a partial failure can simply be retried.
  batch.delete(C.dishes, dishId);
  await batch.commit();
}

export async function deleteDish(viewerUid: string, dishId: string): Promise<void> {
  await requireOwnedDish(viewerUid, dishId);
  await deleteDishCascade(dishId);
}

// ─── Convenience for other modules ───────────────────────────────────────────

export async function getDishOrThrow(dishId: string): Promise<DishRecord> {
  const dish = await loadDish(dishId);
  if (!dish) throw notFound("Dish not found");
  return dish;
}

export { getMembership };
