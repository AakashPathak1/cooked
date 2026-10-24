import "server-only";

import { QUICK_RATINGS, type QuickRating } from "@/lib/elo";
import { LIMITS } from "@/lib/schemas";
import type { UserLite } from "@/lib/types";
import { now } from "../clock";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { DELETE_FIELD, getStore } from "../store";
import { getMembership, requireOwnedDish, requireViewableDish } from "./access";
import { notify } from "./notifications";
import { reconcileCover } from "./photos";
import { C, memberId } from "./records";
import { globalScoreWith, readDishElos } from "./scores";
import { getUser, getUsers, type Viewer } from "./users";

/** The viewer as a `UserLite`, falling back to their session details. */
async function actorOf(viewer: Viewer): Promise<UserLite> {
  return (
    (await getUser(viewer.uid)) ?? {
      uid: viewer.uid,
      handle: "",
      displayName: viewer.name ?? "Someone",
      photoURL: viewer.image ?? "",
    }
  );
}

export interface PhotoPayload {
  photo: string;
  thumb: string;
  color: string | null;
}

// ─── Accepting a tag ─────────────────────────────────────────────────────────

export async function acceptTag(
  viewer: Viewer,
  dishId: string,
  quickRating: QuickRating
): Promise<{ elo: number }> {
  const dish = await requireViewableDish(viewer.uid, dishId);
  if (dish.creatorId === viewer.uid || !dish.taggedUserIds.includes(viewer.uid)) {
    throw badRequest("You haven't been tagged in this dish");
  }
  const elo = QUICK_RATINGS[quickRating];
  const store = getStore();

  await store.runTransaction(async (tx) => {
    if (await tx.get(C.userDishes, memberId(viewer.uid, dishId))) {
      throw conflict("You've already added this dish");
    }
    const elos = await readDishElos(tx, dishId);
    const score = globalScoreWith(elos, new Map([[viewer.uid, elo]]));

    tx.create(C.userDishes, memberId(viewer.uid, dishId), {
      userId: viewer.uid,
      dishId,
      role: "tagged",
    });
    tx.set(C.userDishElos, memberId(viewer.uid, dishId), {
      userId: viewer.uid,
      dishId,
      elo,
      n: 0,
    });
    if (score !== null) tx.update(C.dishes, dishId, { globalScore: score });
  });

  await notify({
    type: "accepted",
    toUid: dish.creatorId,
    from: await actorOf(viewer),
    dishId,
    dishName: dish.name,
    dedupe: true,
  });
  return { elo };
}

// ─── Trying someone else's dish ──────────────────────────────────────────────

export async function tryDish(
  viewer: Viewer,
  dishId: string,
  input: PhotoPayload & { notes: string; quickRating: QuickRating }
): Promise<{ elo: number; role: "tagged" | "tried" }> {
  const dish = await requireViewableDish(viewer.uid, dishId);
  if (dish.creatorId === viewer.uid) throw badRequest("This is your own dish");

  const store = getStore();
  const elo = QUICK_RATINGS[input.quickRating];
  const role = dish.taggedUserIds.includes(viewer.uid) ? "tagged" : "tried";
  const logId = store.newId();

  await store.runTransaction(async (tx) => {
    if (await tx.get(C.userDishes, memberId(viewer.uid, dishId))) {
      throw conflict("You've already added this dish");
    }
    const elos = await readDishElos(tx, dishId);
    const score = globalScoreWith(elos, new Map([[viewer.uid, elo]]));

    tx.create(C.dishLogs, logId, {
      dishId,
      userId: viewer.uid,
      photoURL: input.photo,
      thumbURL: input.thumb,
      color: input.color,
      notes: input.notes,
      createdAt: now(),
    });
    tx.create(C.userDishes, memberId(viewer.uid, dishId), { userId: viewer.uid, dishId, role });
    tx.set(C.userDishElos, memberId(viewer.uid, dishId), {
      userId: viewer.uid,
      dishId,
      elo,
      n: 0,
    });
    if (score !== null) tx.update(C.dishes, dishId, { globalScore: score });
  });

  await notify({
    type: role === "tagged" ? "accepted" : "tried",
    toUid: dish.creatorId,
    from: await actorOf(viewer),
    dishId,
    dishName: dish.name,
    dedupe: true,
  });
  return { elo, role };
}

// ─── Re-rank: reset a personal anchor ────────────────────────────────────────

export async function rerank(
  viewerUid: string,
  dishId: string,
  quickRating: QuickRating
): Promise<{ elo: number }> {
  await requireViewableDish(viewerUid, dishId);
  const elo = QUICK_RATINGS[quickRating];

  await getStore().runTransaction(async (tx) => {
    if (!(await tx.get(C.userDishes, memberId(viewerUid, dishId)))) {
      throw forbidden("Add this dish to your list before ranking it");
    }
    const elos = await readDishElos(tx, dishId);
    const score = globalScoreWith(elos, new Map([[viewerUid, elo]]));
    tx.set(C.userDishElos, memberId(viewerUid, dishId), {
      userId: viewerUid,
      dishId,
      elo,
      n: 0,
    });
    if (score !== null) tx.update(C.dishes, dishId, { globalScore: score });
  });
  return { elo };
}

// ─── Leaving a dish / declining a tag ────────────────────────────────────────

/**
 * Remove yourself from a dish: declines a pending tag, or withdraws your
 * rating and photos if you'd already joined. The creator can't leave (they
 * delete the dish instead).
 */
export async function leaveDish(viewerUid: string, dishId: string): Promise<void> {
  const dish = await requireViewableDish(viewerUid, dishId);
  if (dish.creatorId === viewerUid) throw badRequest("Delete the dish instead of leaving it");
  await removeParticipants(dishId, [viewerUid], (current) =>
    current.filter((uid) => uid !== viewerUid)
  );
}

/**
 * Shared by `leaveDish` and `setTags`: drop people's membership, ratings and
 * photos, update the tag list, and keep the global score and cover consistent.
 */
export async function removeParticipants(
  dishId: string,
  removeUids: string[],
  nextTagged: (current: string[]) => string[]
): Promise<void> {
  const store = getStore();

  const photoRows = removeUids.length
    ? await Promise.all(
        removeUids.map((uid) =>
          store.query(C.dishLogs, {
            where: [
              { field: "dishId", op: "==", value: dishId },
              { field: "userId", op: "==", value: uid },
            ],
            select: ["userId"],
          })
        )
      )
    : [];

  await store.runTransaction(async (tx) => {
    const dish = await tx.get(C.dishes, dishId, { select: ["taggedUserIds", "creatorId"] });
    if (!dish) throw notFound("Dish not found");
    const elos = await readDishElos(tx, dishId);
    const changes = new Map<string, number | null>(removeUids.map((uid) => [uid, null]));
    const score = globalScoreWith(elos, changes);

    const current = Array.isArray(dish.data.taggedUserIds)
      ? (dish.data.taggedUserIds as string[])
      : [];
    tx.update(C.dishes, dishId, {
      taggedUserIds: nextTagged(current),
      ...(score !== null ? { globalScore: score } : {}),
    });
    for (const uid of removeUids) {
      tx.delete(C.userDishes, memberId(uid, dishId));
      tx.delete(C.userDishElos, memberId(uid, dishId));
    }
    for (const rows of photoRows) for (const log of rows) tx.delete(C.dishLogs, log.id);
  });

  if (photoRows.some((rows) => rows.length > 0)) await reconcileCover(dishId);
}

// ─── Editing the tag list ────────────────────────────────────────────────────

export async function setTags(
  viewer: Viewer,
  dishId: string,
  userIds: string[]
): Promise<{ added: string[]; removed: string[] }> {
  const dish = await requireOwnedDish(viewer.uid, dishId);

  const wanted = [...new Set(userIds)].filter((uid) => uid !== viewer.uid);
  const real = await getUsers(wanted);
  const next = wanted.filter((uid) => real.has(uid));

  const added = next.filter((uid) => !dish.taggedUserIds.includes(uid));
  const removed = dish.taggedUserIds.filter((uid) => !next.includes(uid));

  if (removed.length > 0) {
    await removeParticipants(dishId, removed, () => next);
  } else {
    const batch = getStore().batch();
    batch.update(C.dishes, dishId, { taggedUserIds: next, updatedAt: now() });
    await batch.commit();
  }

  const actor = await actorOf(viewer);
  await Promise.all(
    added.map((toUid) =>
      notify({ type: "tag", toUid, from: actor, dishId, dishName: dish.name, dedupe: true })
    )
  );
  return { added, removed };
}

// ─── Photos ──────────────────────────────────────────────────────────────────

export async function addPhoto(
  viewer: Viewer,
  dishId: string,
  input: PhotoPayload & { notes: string }
): Promise<{ id: string }> {
  const dish = await requireViewableDish(viewer.uid, dishId);
  const member = await getMembership(viewer.uid, dishId);
  if (!member) throw forbidden("Add this dish to your list before adding photos");

  const store = getStore();
  const existing = await store.query(C.dishLogs, {
    where: [{ field: "dishId", op: "==", value: dishId }],
    select: ["userId"],
  });
  if (existing.length >= LIMITS.photosPerDish) throw badRequest("This dish has reached its photo limit");
  if (existing.filter((l) => l.data.userId === viewer.uid).length >= LIMITS.photosPerUserPerDish) {
    throw badRequest(`You can add up to ${LIMITS.photosPerUserPerDish} photos to a dish`);
  }

  const logId = store.newId();
  const t = now();
  const batch = store.batch();
  batch.create(C.dishLogs, logId, {
    dishId,
    userId: viewer.uid,
    photoURL: input.photo,
    thumbURL: input.thumb,
    color: input.color,
    notes: input.notes,
    createdAt: t,
  });
  // The poster's new photo becomes the cover; other people's photos don't
  // take over someone else's dish.
  if (dish.creatorId === viewer.uid) {
    batch.update(C.dishes, dishId, {
      coverLogId: logId,
      coverColor: input.color,
      coverVersion: t.getTime(),
      coverPhotoURL: DELETE_FIELD,
    });
  }
  await batch.commit();
  return { id: logId };
}

export async function removePhoto(viewerUid: string, dishId: string, logId: string): Promise<void> {
  const dish = await requireViewableDish(viewerUid, dishId);
  const store = getStore();
  const logs = await store.query(C.dishLogs, {
    where: [{ field: "dishId", op: "==", value: dishId }],
    select: ["userId"],
  });
  const log = logs.find((l) => l.id === logId);
  if (!log) throw notFound("Photo not found");
  if (log.data.userId !== viewerUid && dish.creatorId !== viewerUid) {
    throw forbidden("You can only remove your own photos");
  }
  if (logs.length <= 1) throw badRequest("A dish needs at least one photo");

  const batch = store.batch();
  batch.delete(C.dishLogs, logId);
  await batch.commit();
  await reconcileCover(dishId);
}

export async function setCover(viewerUid: string, dishId: string, logId: string): Promise<void> {
  await requireOwnedDish(viewerUid, dishId);
  const store = getStore();
  const log = await store.get(C.dishLogs, logId, { select: ["dishId", "color"] });
  if (!log || log.data.dishId !== dishId) throw notFound("Photo not found");

  const batch = store.batch();
  batch.update(C.dishes, dishId, {
    coverLogId: logId,
    coverColor: (log.data.color as string | undefined) ?? null,
    coverVersion: now().getTime(),
    coverPhotoURL: DELETE_FIELD,
  });
  await batch.commit();
}
