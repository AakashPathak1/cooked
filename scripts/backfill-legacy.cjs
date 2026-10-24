#!/usr/bin/env node
/**
 * One-off: give older dish documents the fields the feed and leaderboard
 * queries sort and filter on. Firestore silently leaves out documents that
 * lack an orderBy/where field, so a dish without `createdAt` or `isPrivate`
 * would never show up.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/backfill-legacy.cjs          # dry run
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/backfill-legacy.cjs --apply  # write
 *
 * Only missing fields are written; existing values are never changed.
 */
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldPath } = require("firebase-admin/firestore");

const apply = process.argv.includes("--apply");
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const FIELDS = ["isPrivate", "createdAt", "updatedAt", "globalScore", "taggedUserIds", "likesCount"];

async function main() {
  let last = null;
  let scanned = 0;
  let patched = 0;
  const tally = {};

  for (;;) {
    let q = db.collection("dishes").orderBy(FieldPath.documentId()).select(...FIELDS).limit(300);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      scanned++;
      const d = doc.data();
      const patch = {};
      if (typeof d.isPrivate !== "boolean") patch.isPrivate = false;
      if (!d.createdAt) patch.createdAt = d.updatedAt || new Date();
      if (typeof d.globalScore !== "number") patch.globalScore = 1200;
      if (!Array.isArray(d.taggedUserIds)) patch.taggedUserIds = [];
      if (typeof d.likesCount !== "number") patch.likesCount = 0;
      const keys = Object.keys(patch);
      if (keys.length) {
        patched++;
        for (const k of keys) tally[k] = (tally[k] || 0) + 1;
        if (apply) batch.update(doc.ref, patch);
      }
    }
    if (apply) await batch.commit();
    last = snap.docs[snap.docs.length - 1];
  }

  console.log(`${apply ? "Updated" : "Would update"} ${patched} of ${scanned} dishes`, tally);
  if (!apply && patched) console.log("Re-run with --apply to write these changes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
