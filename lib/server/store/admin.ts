import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import {
  FieldPath,
  FieldValue,
  type DocumentReference,
  Timestamp,
  getFirestore,
  type Firestore,
  type Query as FsQuery,
  type Transaction as FsTransaction,
  type WriteBatch as FsWriteBatch,
} from "firebase-admin/firestore";

import { ConfigError, loadServiceAccount } from "../config";
import {
  DELETE_FIELD,
  chunk,
  isValidDocId,
  type Batch,
  type DocData,
  type OrderBy,
  type Query,
  type ReadOptions,
  type Store,
  type StoredDoc,
  type Tx,
  type Where,
} from "./types";

const APP_NAME = "cooked-admin";
/** Firestore allows 500 writes per batch; stay comfortably below. */
const BATCH_SIZE = 400;

function getApp(): App {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  const account = loadServiceAccount();
  if (account) {
    return initializeApp(
      { credential: cert(account), projectId: account.projectId },
      APP_NAME
    );
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp(
      { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-cooked" },
      APP_NAME
    );
  }
  throw new ConfigError(
    "Firebase Admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY " +
      "(Firebase console → Project settings → Service accounts → Generate new private key)."
  );
}

let configured = false;

function getDb(): Firestore {
  const db = getFirestore(getApp());
  if (!configured) {
    db.settings({ ignoreUndefinedProperties: true });
    configured = true;
  }
  return db;
}

// ─── Value conversion ────────────────────────────────────────────────────────

function decode(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, decode(v)])
    );
  }
  return value;
}

function decodeDoc(snap: FirebaseFirestore.DocumentSnapshot): StoredDoc | null {
  if (!snap.exists) return null;
  return { id: snap.id, data: decode(snap.data()) as DocData };
}

function encodePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = v === DELETE_FIELD ? FieldValue.delete() : v;
  }
  return out;
}

function fieldRef(field: string): string | FieldPath {
  return field === "__id__" ? FieldPath.documentId() : field;
}

function orderFor(query: Query): OrderBy[] {
  const order = [...(query.orderBy ?? [])];
  const needsExplicitId = query.startAfter !== undefined && !order.some((o) => o.field === "__id__");
  if (needsExplicitId) {
    // The SDK only accepts value cursors that line up with explicit orderBy
    // clauses, so make the implicit document-id tiebreak explicit.
    order.push({ field: "__id__", dir: order.length ? (order[order.length - 1].dir ?? "asc") : "asc" });
  }
  return order;
}

function buildQuery(db: Firestore, collection: string, query: Query = {}): FsQuery {
  let ref: FsQuery = db.collection(collection);
  for (const w of query.where ?? []) {
    ref = ref.where(fieldRef(w.field), w.op, w.value);
  }
  for (const o of orderFor(query)) {
    ref = ref.orderBy(fieldRef(o.field), o.dir ?? "asc");
  }
  if (query.select) ref = ref.select(...query.select);
  if (query.startAfter) ref = ref.startAfter(...query.startAfter);
  if (query.limit !== undefined) ref = ref.limit(query.limit);
  return ref;
}

// ─── Store ───────────────────────────────────────────────────────────────────

type Op =
  | { kind: "create"; col: string; id: string; data: DocData }
  | { kind: "set"; col: string; id: string; data: DocData }
  | { kind: "update"; col: string; id: string; patch: Record<string, unknown> }
  | { kind: "delete"; col: string; id: string };

/** The write methods that `Transaction` and `WriteBatch` have in common. */
interface WriteTarget {
  create(ref: DocumentReference, data: FirebaseFirestore.DocumentData): unknown;
  set(ref: DocumentReference, data: FirebaseFirestore.DocumentData): unknown;
  update(ref: DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>): unknown;
  delete(ref: DocumentReference): unknown;
}

function applyOp(db: Firestore, txOrBatch: FsTransaction | FsWriteBatch, op: Op): void {
  const target = txOrBatch as unknown as WriteTarget;
  const ref = db.collection(op.col).doc(op.id);
  switch (op.kind) {
    case "create":
      target.create(ref, op.data);
      break;
    case "set":
      target.set(ref, op.data);
      break;
    case "update":
      target.update(ref, encodePatch(op.patch));
      break;
    case "delete":
      target.delete(ref);
      break;
  }
}

export class AdminStore implements Store {
  private get db(): Firestore {
    return getDb();
  }

  newId(): string {
    return this.db.collection("_ids").doc().id;
  }

  async get(collection: string, id: string, options?: ReadOptions): Promise<StoredDoc | null> {
    const [doc] = await this.getMany(collection, [id], options);
    return doc;
  }

  async getMany(
    collection: string,
    ids: string[],
    options?: ReadOptions
  ): Promise<(StoredDoc | null)[]> {
    if (ids.length === 0) return [];
    const valid = ids.filter(isValidDocId);
    const found = new Map<string, StoredDoc | null>();
    if (valid.length > 0) {
      const refs = valid.map((id) => this.db.collection(collection).doc(id));
      const snaps = options?.select
        ? await this.db.getAll(...refs, { fieldMask: options.select })
        : await this.db.getAll(...refs);
      snaps.forEach((snap) => found.set(snap.id, decodeDoc(snap)));
    }
    return ids.map((id) => found.get(id) ?? null);
  }

  async query(collection: string, query?: Query): Promise<StoredDoc[]> {
    const snap = await buildQuery(this.db, collection, query).get();
    return snap.docs.map((d) => ({ id: d.id, data: decode(d.data()) as DocData }));
  }

  async count(collection: string, where?: Where[]): Promise<number> {
    const snap = await buildQuery(this.db, collection, { where }).count().get();
    return snap.data().count;
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const db = this.db;
    return db.runTransaction(async (t) => {
      const txGetMany = async (col: string, ids: string[], o?: ReadOptions) => {
        if (ids.length === 0) return [];
        const valid = ids.filter(isValidDocId);
        const found = new Map<string, StoredDoc | null>();
        if (valid.length > 0) {
          const refs = valid.map((id) => db.collection(col).doc(id));
          const snaps = o?.select
            ? await t.getAll(...refs, { fieldMask: o.select })
            : await t.getAll(...refs);
          snaps.forEach((snap) => found.set(snap.id, decodeDoc(snap)));
        }
        return ids.map((id) => found.get(id) ?? null);
      };
      const tx: Tx = {
        get: async (col, id, o) => {
          const [doc] = await txGetMany(col, [id], o);
          return doc;
        },
        getMany: (col, ids, o) => txGetMany(col, ids, o),
        query: async (col, q) => {
          const snap = await t.get(buildQuery(db, col, q));
          return snap.docs.map((d) => ({ id: d.id, data: decode(d.data()) as DocData }));
        },
        create: (col, id, data) => applyOp(db, t, { kind: "create", col, id, data }),
        set: (col, id, data) => applyOp(db, t, { kind: "set", col, id, data }),
        update: (col, id, patch) => applyOp(db, t, { kind: "update", col, id, patch }),
        delete: (col, id) => applyOp(db, t, { kind: "delete", col, id }),
      };
      return fn(tx);
    });
  }

  batch(): Batch {
    const db = this.db;
    const ops: Op[] = [];
    return {
      create: (col, id, data) => void ops.push({ kind: "create", col, id, data }),
      set: (col, id, data) => void ops.push({ kind: "set", col, id, data }),
      update: (col, id, patch) => void ops.push({ kind: "update", col, id, patch }),
      delete: (col, id) => void ops.push({ kind: "delete", col, id }),
      commit: async () => {
        for (const group of chunk(ops, BATCH_SIZE)) {
          const batch = db.batch();
          for (const op of group) applyOp(db, batch, op);
          await batch.commit();
        }
      },
    };
  }
}
