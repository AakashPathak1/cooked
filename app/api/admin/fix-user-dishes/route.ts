import { NextResponse } from "next/server";
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc,
  query, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEFAULT_RATING } from "@/lib/elo";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // 1. Fetch every dish
    const dishSnaps = await getDocs(collection(db, "dishes"));
    const dishes = dishSnaps.docs.map((d) => ({ id: d.id, ...d.data() } as {
      id: string; creatorId: string; taggedUserIds: string[];
    }));

    // 2. Fetch every dishLog grouped by dishId
    const logSnaps = await getDocs(collection(db, "dishLogs"));
    const logsByDish: Record<string, string[]> = {};
    logSnaps.docs.forEach((d) => {
      const { dishId, userId } = d.data() as { dishId: string; userId: string };
      if (!logsByDish[dishId]) logsByDish[dishId] = [];
      if (!logsByDish[dishId].includes(userId)) logsByDish[dishId].push(userId);
    });

    let fixed = 0;

    for (const dish of dishes) {
      const { id: dishId, creatorId, taggedUserIds = [] } = dish;

      // Collect the full expected set of user→role for this dish
      const expected: Record<string, "creator" | "tagged" | "tried"> = {};
      expected[creatorId] = "creator";
      for (const uid of taggedUserIds) {
        if (uid !== creatorId) expected[uid] = "tagged";
      }
      // Anyone who has a log and isn't creator/tagged → "tried"
      for (const uid of (logsByDish[dishId] ?? [])) {
        if (!expected[uid]) expected[uid] = "tried";
      }

      // Fetch existing userDishes for this dish
      const udSnaps = await getDocs(
        query(collection(db, "userDishes"), where("dishId", "==", dishId))
      );
      const existing: Record<string, string> = {};
      udSnaps.docs.forEach((d) => { existing[d.data().userId] = d.id; });

      // Remove stale records (user no longer in expected set)
      for (const [uid, docId] of Object.entries(existing)) {
        if (!expected[uid]) {
          await deleteDoc(doc(db, "userDishes", docId));
          fixed++;
        }
      }

      // Upsert missing records
      for (const [uid, role] of Object.entries(expected)) {
        const udRef = doc(db, "userDishes", `${uid}_${dishId}`);
        const udSnap = await getDoc(udRef);
        if (!udSnap.exists() || udSnap.data().role !== role) {
          await setDoc(udRef, { userId: uid, dishId, role });
          fixed++;
        }
        // Ensure ELO record exists
        const eloRef = doc(db, "userDishElos", `${uid}_${dishId}`);
        const eloSnap = await getDoc(eloRef);
        if (!eloSnap.exists()) {
          await setDoc(eloRef, { userId: uid, dishId, elo: DEFAULT_RATING });
          fixed++;
        }
      }

      // Fix taggedUserIds: ensure all "tried" log users are present if they have logs,
      // and remove any uid from taggedUserIds that no longer has any logs AND role != "tagged"
      // (i.e. was auto-tagged via try but has since deleted their log)
      const logUsers = logsByDish[dishId] ?? [];
      const correctTagged = taggedUserIds.filter((uid) => {
        // Keep if explicitly tagged (had a userDishes record with role="tagged" originally)
        // We'll keep anyone who's either in expected as "tagged" or "tried"
        return expected[uid] !== undefined && uid !== creatorId;
      });
      // Add any "tried" users missing from taggedUserIds
      for (const uid of Object.keys(expected)) {
        if (uid !== creatorId && !correctTagged.includes(uid)) {
          correctTagged.push(uid);
        }
      }
      // Only update if changed
      const correctSet = new Set(correctTagged);
      const same = taggedUserIds.length === correctTagged.length && taggedUserIds.every((u) => correctSet.has(u));
      if (!same) {
        await updateDoc(doc(db, "dishes", dishId), { taggedUserIds: correctTagged });
        fixed++;
      }
    }

    return NextResponse.json({ ok: true, fixed, dishes: dishes.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
