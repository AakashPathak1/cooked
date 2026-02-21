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
}): Promise<string> {
  // Create dish doc — no photoURL directly on dish
  const ref = await addDoc(collection(db, "dishes"), {
    creatorId: data.creatorId,
    name: data.name,
    notes: data.notes,
    recipeLink: data.recipeLink,
    taggedUserIds: data.taggedUserIds,
    isPrivate: data.isPrivate ?? false,
    globalScore: DEFAULT_RATING,
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
      elo: DEFAULT_RATING,
    }),
  ]);

  // Tagged users: userDishes + userDishElos
  await Promise.all(
    data.taggedUserIds.flatMap((uid) => [
      setDoc(doc(db, "userDishes", `${uid}_${dishId}`), {
        userId: uid,
        dishId,
        role: "tagged",
      }),
      setDoc(doc(db, "userDishElos", `${uid}_${dishId}`), {
        userId: uid,
        dishId,
        elo: DEFAULT_RATING,
      }),
    ])
  );

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

  if (upsertUserDish) {
    // Add to user's personal list if not already there
    const udRef = doc(db, "userDishes", `${userId}_${dishId}`);
    const udSnap = await getDoc(udRef);
    if (!udSnap.exists()) {
      await setDoc(udRef, { userId, dishId, role: "tried" });
    }

    // Init personal ELO if not already there
    const eloRef = doc(db, "userDishElos", `${userId}_${dishId}`);
    const eloSnap = await getDoc(eloRef);
    if (!eloSnap.exists()) {
      await setDoc(eloRef, { userId, dishId, elo: DEFAULT_RATING });
    }
  }

  return ref.id;
}

export async function getDishLogs(dishId: string): Promise<DishLogDoc[]> {
  const q = query(
    collection(db, "dishLogs"),
    where("dishId", "==", dishId),
    orderBy("createdAt", "asc")
  );
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() } as DishLogDoc));
}

// ─── ELO Updates ─────────────────────────────────────────────────────────────

async function recomputeGlobalScore(dishId: string) {
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
    await setDoc(ref, { userId: uid, dishId });
    await updateDoc(dishRef, { likesCount: increment(1) });
    return true;
  }
}

export async function isLiked(uid: string, dishId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "likes", `${uid}_${dishId}`));
  return snap.exists();
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
