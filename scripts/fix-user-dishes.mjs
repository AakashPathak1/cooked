// Run with: node --env-file=.env.local scripts/fix-user-dishes.mjs
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, doc, getDoc, getDocs,
  setDoc, deleteDoc, updateDoc, query, where,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const DEFAULT_RATING = 1200;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  console.log("Fetching all dishes...");
  const dishSnaps = await getDocs(collection(db, "dishes"));
  const dishes = dishSnaps.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Found ${dishes.length} dishes`);

  console.log("Fetching all dishLogs...");
  const logSnaps = await getDocs(collection(db, "dishLogs"));
  const logsByDish = {};
  logSnaps.docs.forEach((d) => {
    const { dishId, userId } = d.data();
    if (!logsByDish[dishId]) logsByDish[dishId] = [];
    if (!logsByDish[dishId].includes(userId)) logsByDish[dishId].push(userId);
  });
  console.log(`Found ${logSnaps.size} logs across ${Object.keys(logsByDish).length} dishes`);

  let fixed = 0;

  for (const dish of dishes) {
    const { id: dishId, creatorId, taggedUserIds = [] } = dish;
    process.stdout.write(`\nProcessing dish "${dish.name}" (${dishId})...`);

    // Build expected user→role map
    const expected = {};
    expected[creatorId] = "creator";
    for (const uid of taggedUserIds) {
      if (uid !== creatorId) expected[uid] = "tagged";
    }
    for (const uid of (logsByDish[dishId] ?? [])) {
      if (!expected[uid]) expected[uid] = "tried";
    }

    // Fetch existing userDishes for this dish
    const udSnaps = await getDocs(
      query(collection(db, "userDishes"), where("dishId", "==", dishId))
    );
    const existing = {};
    udSnaps.docs.forEach((d) => { existing[d.data().userId] = d.id; });

    // Remove stale records
    for (const [uid, docId] of Object.entries(existing)) {
      if (!expected[uid]) {
        await deleteDoc(doc(db, "userDishes", docId));
        console.log(`  REMOVED stale userDishes for uid=${uid}`);
        fixed++;
      }
    }

    // Upsert missing/wrong records
    for (const [uid, role] of Object.entries(expected)) {
      const udRef = doc(db, "userDishes", `${uid}_${dishId}`);
      const udSnap = await getDoc(udRef);
      if (!udSnap.exists() || udSnap.data().role !== role) {
        await setDoc(udRef, { userId: uid, dishId, role });
        console.log(`  UPSERTED userDishes uid=${uid} role=${role}`);
        fixed++;
      }
      const eloRef = doc(db, "userDishElos", `${uid}_${dishId}`);
      const eloSnap = await getDoc(eloRef);
      if (!eloSnap.exists()) {
        await setDoc(eloRef, { userId: uid, dishId, elo: DEFAULT_RATING });
        console.log(`  CREATED userDishElos uid=${uid}`);
        fixed++;
      }
    }

    // Fix taggedUserIds: all non-creator expected users
    const correctTagged = Object.keys(expected).filter((uid) => uid !== creatorId);
    const correctSet = new Set(correctTagged);
    const same = taggedUserIds.length === correctTagged.length &&
      taggedUserIds.every((u) => correctSet.has(u));
    if (!same) {
      await updateDoc(doc(db, "dishes", dishId), { taggedUserIds: correctTagged });
      console.log(`  FIXED taggedUserIds: [${correctTagged.join(", ")}]`);
      fixed++;
    }
  }

  console.log(`\n\nDone. ${fixed} records fixed across ${dishes.length} dishes.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
