import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  getDocsFromServer,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { calculateElo, DEFAULT_RATING } from "./elo";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserDoc {
  uid: string;
  handle: string;
  displayName: string;
  photoURL: string;
  email: string;
  createdAt: Timestamp | null;
}

export interface DishDoc {
  id: string;
  creatorId: string;
  name: string;
  notes: string;
  recipeLink: string;
  taggedUserIds: string[];
  likesCount: number;
  createdAt: Timestamp | null;
  isPrivate: boolean;
  globalScore: number;
  coverPhotoURL: string;
  // Merged client-side for personal views — not stored in Firestore
  personalElo?: number;
  role?: "creator" | "tagged" | "tried";
}

export interface DishLogDoc {
  id: string;
  dishId: string;
  userId: string;
  photoURL: string;
  notes: string;
  createdAt: Timestamp | null;
}

export interface UserDishDoc {
  userId: string;
  dishId: string;
  role: "creator" | "tagged" | "tried";
}

export interface RatingDoc {
  id?: string;
  raterId: string;
  winnerId: string;
  loserId: string;
  createdAt: Timestamp | null;
}

export interface CommentDoc {
  id?: string;
  dishId: string;
  userId: string;
  text: string;
  createdAt: Timestamp | null;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function createUserDoc(user: {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const handle = (user.displayName ?? user.email ?? user.uid)
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 30);
    await setDoc(ref, {
      uid: user.uid,
      handle,
      displayName: user.displayName ?? "",
      photoURL: user.photoURL ?? "",
      email: user.email ?? "",
      createdAt: serverTimestamp(),
    });
  }
}

export async function getUserByUid(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

export async function getUserByHandle(handle: string): Promise<UserDoc | null> {
  const q = query(collection(db, "users"), where("handle", "==", handle), limit(1));
  const snaps = await getDocs(q);
  if (snaps.empty) return null;
  return snaps.docs[0].data() as UserDoc;
}

export async function getAllUsers(): Promise<UserDoc[]> {
  const snaps = await getDocs(collection(db, "users"));
  return snaps.docs.map((d) => d.data() as UserDoc);
}

// ─── Dishes ───────────────────────────────────────────────────────────────────

export async function createDish(data: {
  creatorId: string;
  name: string;
  photoURL: string;
  notes: string;
  recipeLink: string;
  taggedUserIds: string[];
  isPrivate?: boolean;
  initialElo?: number;
}): Promise<string> {
  const initialElo = data.initialElo ?? DEFAULT_RATING;

  // Create dish doc — no photoURL directly on dish
  const ref = await addDoc(collection(db, "dishes"), {
    creatorId: data.creatorId,
    name: data.name,
    notes: data.notes,
    recipeLink: data.recipeLink,
    taggedUserIds: data.taggedUserIds,
    isPrivate: data.isPrivate ?? false,
    globalScore: initialElo,
    coverPhotoURL: "",
    createdAt: serverTimestamp(),
    likesCount: 0,
  });
  const dishId = ref.id;

  // Creator: userDishes + userDishElos
  await Promise.all([
    setDoc(doc(db, "userDishes", `${data.creatorId}_${dishId}`), {
      userId: data.creatorId,
      dishId,
      role: "creator",
    }),
    setDoc(doc(db, "userDishElos", `${data.creatorId}_${dishId}`), {
      userId: data.creatorId,
      dishId,
      elo: initialElo,
    }),
  ]);

  // Tagged users get NO userDishes/userDishElos until they accept the tag.
  // Notifications are sent by the caller after this returns.

  // Create initial dishLog with the creator's photo → sets coverPhotoURL
  await createDishLog(dishId, data.creatorId, data.photoURL, data.notes, false);

  return dishId;
}

export async function getDish(dishId: string): Promise<DishDoc | null> {
  const snap = await getDoc(doc(db, "dishes", dishId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as DishDoc;
}

export async function getFeedDishes(limitCount = 20): Promise<DishDoc[]> {
  const q = query(
    collection(db, "dishes"),
    where("isPrivate", "==", false),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() } as DishDoc));
}

export async function getLeaderboardDishes(limitCount = 50): Promise<DishDoc[]> {
  const q = query(
    collection(db, "dishes"),
    where("isPrivate", "==", false),
    orderBy("globalScore", "desc"),
    limit(limitCount)
  );
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() } as DishDoc));
}

export async function getPersonalDishes(
  uid: string,
  publicOnly = false
): Promise<DishDoc[]> {
  const q = query(collection(db, "userDishes"), where("userId", "==", uid));
  const udSnaps = await getDocs(q);

  const results: DishDoc[] = [];
  await Promise.all(
    udSnaps.docs.map(async (udDoc) => {
      const ud = udDoc.data() as UserDishDoc;
      const [dishSnap, eloSnap] = await Promise.all([
        getDoc(doc(db, "dishes", ud.dishId)),
        getDoc(doc(db, "userDishElos", `${uid}_${ud.dishId}`)),
      ]);
      // Skip if dish was deleted or filtered out
      if (!dishSnap.exists()) return;
      const dish = { id: dishSnap.id, ...dishSnap.data() } as DishDoc;
      if (publicOnly && dish.isPrivate) return;
      dish.personalElo = eloSnap.exists() ? eloSnap.data().elo : DEFAULT_RATING;
      dish.role = ud.role;
      results.push(dish);
    })
  );
  return results;
}

export async function updateDishPrivacy(
  dishId: string,
  userId: string,
  isPrivate: boolean
) {
  const dishRef = doc(db, "dishes", dishId);
  const snap = await getDoc(dishRef);
  if (!snap.exists() || snap.data().creatorId !== userId) return;
  await updateDoc(dishRef, { isPrivate });
}

export async function deleteDish(dishId: string, requestingUid: string) {
  const dishRef = doc(db, "dishes", dishId);
  const snap = await getDoc(dishRef);
  if (!snap.exists() || snap.data().creatorId !== requestingUid) return;

  // Delete the dish doc itself
  await deleteDoc(dishRef);

  // Delete owner's dishLogs
  const logsQ = query(
    collection(db, "dishLogs"),
    where("dishId", "==", dishId),
    where("userId", "==", requestingUid)
  );
  const logSnaps = await getDocs(logsQ);
  await Promise.all(logSnaps.docs.map((d) => deleteDoc(d.ref)));

  // Delete owner's userDishes + userDishElos
  await Promise.all([
    deleteDoc(doc(db, "userDishes", `${requestingUid}_${dishId}`)),
    deleteDoc(doc(db, "userDishElos", `${requestingUid}_${dishId}`)),
  ]);
}

// ─── Dish Logs ────────────────────────────────────────────────────────────────

export async function createDishLog(
  dishId: string,
  userId: string,
  photoURL: string,
  notes?: string,
  upsertUserDish = true
): Promise<string> {
  // Add log
  const ref = await addDoc(collection(db, "dishLogs"), {
    dishId,
    userId,
    photoURL,
    notes: notes ?? "",
    createdAt: serverTimestamp(),
  });

  // Update dish's coverPhotoURL to latest
  await updateDoc(doc(db, "dishes", dishId), { coverPhotoURL: photoURL });

  return ref.id;
}

// Called when a tagged user accepts the tag. initialElo is their quick rating anchor.
export async function acceptTag(uid: string, dishId: string, initialElo: number = DEFAULT_RATING): Promise<void> {
  await Promise.all([
    setDoc(doc(db, "userDishes", `${uid}_${dishId}`), { userId: uid, dishId, role: "tagged" }),
    setDoc(doc(db, "userDishElos", `${uid}_${dishId}`), { userId: uid, dishId, elo: initialElo }),
  ]);
  // Recompute global score to reflect this user's rating
  await recomputeGlobalScore(dishId);
}

// Owner edits the tagged users list. Returns newly added UIDs so caller can notify them.
export async function updateDishTags(
  dishId: string,
  ownerUid: string,
  newTaggedUserIds: string[]
): Promise<string[]> {
  const dishRef = doc(db, "dishes", dishId);
  const dishSnap = await getDoc(dishRef);
  if (!dishSnap.exists()) return [];
  if (dishSnap.data().creatorId !== ownerUid) throw new Error("Not authorized");

  const oldTagged: string[] = dishSnap.data().taggedUserIds ?? [];
  const added = newTaggedUserIds.filter((uid) => !oldTagged.includes(uid));
  const removed = oldTagged.filter((uid) => !newTaggedUserIds.includes(uid));

  await updateDoc(dishRef, { taggedUserIds: newTaggedUserIds });

  // Delete removed users' records (if they had accepted)
  await Promise.all(
    removed.flatMap((uid) => [
      deleteDoc(doc(db, "userDishes", `${uid}_${dishId}`)),
      deleteDoc(doc(db, "userDishElos", `${uid}_${dishId}`)),
    ])
  );

  return added; // caller sends notifications to these
}

// Delete a dish log — only the dish owner can call this now
export async function deleteDishLog(logId: string, dishId: string, requestingUid: string): Promise<void> {
  const logRef = doc(db, "dishLogs", logId);
  const logSnap = await getDoc(logRef);
  if (!logSnap.exists()) return;
  if (logSnap.data().userId !== requestingUid) throw new Error("Not authorized");

  await deleteDoc(logRef);

  // Use getDocsFromServer to bypass local cache — getDocs can return the
  // just-deleted doc if Firestore's cache hasn't been flushed yet
  const remainingSnap = await getDocsFromServer(
    query(collection(db, "dishLogs"), where("dishId", "==", dishId))
  );

  // Recompute coverPhotoURL: pick most recent remaining log
  const sorted = remainingSnap.docs
    .map((d) => ({ photoURL: d.data().photoURL as string, ts: (d.data().createdAt as Timestamp | null)?.toMillis() ?? 0 }))
    .sort((a, b) => b.ts - a.ts);
  const newCover = sorted[0]?.photoURL ?? "";
  await updateDoc(doc(db, "dishes", dishId), { coverPhotoURL: newCover });
}

export async function getDishLogs(dishId: string): Promise<DishLogDoc[]> {
  // No orderBy — avoids requiring a composite index; sort client-side instead
  const q = query(collection(db, "dishLogs"), where("dishId", "==", dishId));
  const snaps = await getDocs(q);
  const logs = snaps.docs.map((d) => ({ id: d.id, ...d.data() } as DishLogDoc));
  // Sort by createdAt asc client-side
  return logs.sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
}

// ─── ELO Updates ─────────────────────────────────────────────────────────────

export async function recomputeGlobalScore(dishId: string) {
  const q = query(collection(db, "userDishElos"), where("dishId", "==", dishId));
  const snaps = await getDocs(q);
  if (snaps.empty) return;
  const elos = snaps.docs.map((d) => d.data().elo as number);
  const avg = Math.round(elos.reduce((a, b) => a + b, 0) / elos.length);
  await updateDoc(doc(db, "dishes", dishId), { globalScore: avg });
}

export async function recordComparison(
  raterId: string,
  winnerDishId: string,
  loserDishId: string
) {
  const winnerEloRef = doc(db, "userDishElos", `${raterId}_${winnerDishId}`);
  const loserEloRef = doc(db, "userDishElos", `${raterId}_${loserDishId}`);

  const [winnerSnap, loserSnap] = await Promise.all([
    getDoc(winnerEloRef),
    getDoc(loserEloRef),
  ]);

  const winnerElo: number = winnerSnap.exists() ? winnerSnap.data().elo : DEFAULT_RATING;
  const loserElo: number = loserSnap.exists() ? loserSnap.data().elo : DEFAULT_RATING;

  const { winnerNewElo, loserNewElo } = calculateElo(winnerElo, loserElo);

  // Update rater's personal ELOs
  await Promise.all([
    setDoc(winnerEloRef, { userId: raterId, dishId: winnerDishId, elo: winnerNewElo }),
    setDoc(loserEloRef, { userId: raterId, dishId: loserDishId, elo: loserNewElo }),
  ]);

  // Recompute global scores for both dishes (avg of all user ELOs)
  await Promise.all([
    recomputeGlobalScore(winnerDishId),
    recomputeGlobalScore(loserDishId),
  ]);

  // Save rating record
  await addDoc(collection(db, "ratings"), {
    raterId,
    winnerId: winnerDishId,
    loserId: loserDishId,
    createdAt: serverTimestamp(),
  });
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function toggleLike(uid: string, dishId: string): Promise<boolean> {
  const ref = doc(db, "likes", `${uid}_${dishId}`);
  const snap = await getDoc(ref);
  const dishRef = doc(db, "dishes", dishId);
  if (snap.exists()) {
    await deleteDoc(ref);
    await updateDoc(dishRef, { likesCount: increment(-1) });
    return false;
  } else {
    await setDoc(ref, { userId: uid, dishId, createdAt: serverTimestamp() });
    await updateDoc(dishRef, { likesCount: increment(1) });
    return true;
  }
}

export async function isLiked(uid: string, dishId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "likes", `${uid}_${dishId}`));
  return snap.exists();
}

export async function getLikers(dishId: string): Promise<{ users: UserDoc[]; total: number }> {
  const q = query(collection(db, "likes"), where("dishId", "==", dishId));
  const snaps = await getDocs(q);
  const total = snaps.size;
  const uids = snaps.docs.map((d) => d.data().userId as string);
  const resolved = await Promise.all(uids.map((uid) => getUserByUid(uid)));
  return { users: resolved.filter(Boolean) as UserDoc[], total };
}

// Returns dishes where uid is in taggedUserIds but hasn't accepted yet (no userDishes record).
export async function getPendingTags(uid: string): Promise<DishDoc[]> {
  const q = query(
    collection(db, "dishes"),
    where("taggedUserIds", "array-contains", uid)
  );
  const snaps = await getDocs(q);
  const allTagged = snaps.docs.map((d) => ({ id: d.id, ...d.data() } as DishDoc));

  const pending: DishDoc[] = [];
  await Promise.all(
    allTagged.map(async (dish) => {
      if (dish.creatorId === uid) return; // skip own dishes
      const udSnap = await getDoc(doc(db, "userDishes", `${uid}_${dish.id}`));
      if (!udSnap.exists()) pending.push(dish);
    })
  );
  return pending;
}

// ─── Activity feed ────────────────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  type: NotificationType;
  fromUid: string;
  fromDisplayName: string;
  fromPhotoURL: string;
  dishId: string;
  dishName: string;
  commentText?: string;
  createdAt: Timestamp | null;
}

export async function getActivityForUser(uid: string): Promise<ActivityItem[]> {
  // Get user's created dishes
  const dishSnaps = await getDocs(
    query(collection(db, "dishes"), where("creatorId", "==", uid))
  );
  const dishes = dishSnaps.docs.map((d) => ({ id: d.id, ...d.data() } as DishDoc));
  if (dishes.length === 0) return [];

  const dishIds = dishes.map((d) => d.id);
  const dishNameMap: Record<string, string> = {};
  dishes.forEach((d) => { dishNameMap[d.id] = d.name; });

  // Firestore 'in' supports up to 10 items — chunk accordingly
  const chunks: string[][] = [];
  for (let i = 0; i < dishIds.length; i += 10) chunks.push(dishIds.slice(i, i + 10));

  const [likeSnaps, commentSnaps] = await Promise.all([
    Promise.all(chunks.map((chunk) =>
      getDocs(query(collection(db, "likes"), where("dishId", "in", chunk)))
    )).then((res) => res.flatMap((r) => r.docs)),
    Promise.all(chunks.map((chunk) =>
      getDocs(query(collection(db, "comments"), where("dishId", "in", chunk)))
    )).then((res) => res.flatMap((r) => r.docs)),
  ]);

  // Filter out the owner's own activity
  const likes = likeSnaps.filter((d) => d.data().userId !== uid);
  const comments = commentSnaps.filter((d) => d.data().userId !== uid);

  // Fetch user data for all actors
  const actorUids = Array.from(new Set([
    ...likes.map((d) => d.data().userId as string),
    ...comments.map((d) => d.data().userId as string),
  ]));
  const userMap: Record<string, UserDoc> = {};
  await Promise.all(actorUids.map(async (actorUid) => {
    const u = await getUserByUid(actorUid);
    if (u) userMap[actorUid] = u;
  }));

  const activities: ActivityItem[] = [];

  for (const snap of likes) {
    const data = snap.data();
    const fromUser = userMap[data.userId];
    if (!fromUser) continue;
    activities.push({
      id: snap.id,
      type: "like",
      fromUid: data.userId,
      fromDisplayName: fromUser.displayName || fromUser.handle,
      fromPhotoURL: fromUser.photoURL || "",
      dishId: data.dishId,
      dishName: dishNameMap[data.dishId] ?? "",
      createdAt: (data.createdAt as Timestamp) ?? null,
    });
  }

  for (const snap of comments) {
    const data = snap.data();
    const fromUser = userMap[data.userId];
    if (!fromUser) continue;
    activities.push({
      id: snap.id,
      type: "comment",
      fromUid: data.userId,
      fromDisplayName: fromUser.displayName || fromUser.handle,
      fromPhotoURL: fromUser.photoURL || "",
      dishId: data.dishId,
      dishName: dishNameMap[data.dishId] ?? "",
      commentText: data.text,
      createdAt: (data.createdAt as Timestamp) ?? null,
    });
  }

  // Sort by createdAt desc; items with no timestamp go last
  activities.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return b.createdAt.toMillis() - a.createdAt.toMillis();
  });

  return activities.slice(0, 100);
}

// ─── Saves ────────────────────────────────────────────────────────────────────

export async function toggleSave(uid: string, dishId: string): Promise<boolean> {
  const ref = doc(db, "saved", `${uid}_${dishId}`);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  } else {
    await setDoc(ref, { userId: uid, dishId });
    return true;
  }
}

export async function isSaved(uid: string, dishId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "saved", `${uid}_${dishId}`));
  return snap.exists();
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function addComment(dishId: string, userId: string, text: string) {
  await addDoc(collection(db, "comments"), {
    dishId,
    userId,
    text,
    createdAt: serverTimestamp(),
  });
}

export async function getComments(dishId: string): Promise<CommentDoc[]> {
  const q = query(
    collection(db, "comments"),
    where("dishId", "==", dishId),
    orderBy("createdAt", "asc")
  );
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() } as CommentDoc));
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = "like" | "comment" | "tried" | "tag" | "accepted";

export interface NotificationDoc {
  id: string;
  toUid: string;
  fromUid: string;
  fromDisplayName: string;
  fromPhotoURL: string;
  type: NotificationType;
  dishId: string;
  dishName: string;
  read: boolean;
  createdAt: Timestamp | null;
}

export async function createNotification(data: {
  toUid: string;
  fromUid: string;
  fromDisplayName: string;
  fromPhotoURL: string;
  type: NotificationType;
  dishId: string;
  dishName: string;
}): Promise<void> {
  // Don't notify yourself
  if (data.toUid === data.fromUid) return;
  await addDoc(collection(db, "notifications"), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function getNotifications(uid: string): Promise<NotificationDoc[]> {
  const q = query(
    collection(db, "notifications"),
    where("toUid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationDoc));
}

export async function markNotificationsRead(uid: string): Promise<void> {
  const q = query(
    collection(db, "notifications"),
    where("toUid", "==", uid),
    where("read", "==", false)
  );
  const snaps = await getDocs(q);
  await Promise.all(snaps.docs.map((d) => updateDoc(d.ref, { read: true })));
}

export async function getUnreadNotificationCount(uid: string): Promise<number> {
  const q = query(
    collection(db, "notifications"),
    where("toUid", "==", uid),
    where("read", "==", false)
  );
  const snaps = await getDocs(q);
  return snaps.size;
}

// ─── Push subscriptions ───────────────────────────────────────────────────────

export async function savePushSubscription(
  uid: string,
  subscription: PushSubscription
): Promise<void> {
  await setDoc(doc(db, "pushSubscriptions", uid), {
    uid,
    subscription: JSON.parse(JSON.stringify(subscription)),
    updatedAt: serverTimestamp(),
  });
}

export async function removePushSubscription(uid: string): Promise<void> {
  await deleteDoc(doc(db, "pushSubscriptions", uid));
}

// ─── Legacy: user ELOs (kept for any existing data) ──────────────────────────

export async function getUserElosForDishes(
  uid: string,
  dishIds: string[]
): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  await Promise.all(
    dishIds.map(async (dishId) => {
      const snap = await getDoc(doc(db, "userDishElos", `${uid}_${dishId}`));
      results[dishId] = snap.exists() ? snap.data().elo : DEFAULT_RATING;
    })
  );
  return results;
}
