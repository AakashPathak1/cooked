import {
  AlreadyExistsError,
  DELETE_FIELD,
  isValidDocId,
  NotFoundError,
  type Batch,
  type DocData,
  type OrderBy,
  type Query,
  type ReadOptions,
  type Store,
  type StoredDoc,
  type Tx,
  type Where,
  type Writer,
} from "./types";
import { missingIndex, type IndexDef } from "./indexes";

type Collection = Map<string, DocData>;

type Op =
  | { kind: "create"; col: string; id: string; data: DocData }
  | { kind: "set"; col: string; id: string; data: DocData }
  | { kind: "update"; col: string; id: string; patch: Record<string, unknown> }
  | { kind: "delete"; col: string; id: string };

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Comparable primitive for a stored value (Dates compare by time). */
function key(value: unknown): number | string | boolean | null | undefined {
  if (value instanceof Date) return value.getTime();
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

/** Firestore orders null < boolean < number < string. Good enough here. */
function typeRank(v: ReturnType<typeof key>): number {
  if (v === null) return 0;
  if (typeof v === "boolean") return 1;
  if (typeof v === "number") return 2;
  return 3;
}

function compare(a: unknown, b: unknown): number {
  const ka = key(a);
  const kb = key(b);
  const ra = typeRank(ka);
  const rb = typeRank(kb);
  if (ra !== rb) return ra - rb;
  if (ka === kb) return 0;
  return (ka as number | string) < (kb as number | string) ? -1 : 1;
}

function fieldValue(id: string, data: DocData, field: string): unknown {
  return field === "__id__" ? id : data[field];
}

function matches(id: string, data: DocData, w: Where): boolean {
  const actual = fieldValue(id, data, w.field);
  switch (w.op) {
    case "==":
      return actual !== undefined && compare(actual, w.value) === 0;
    case "!=":
      return actual !== undefined && compare(actual, w.value) !== 0;
    case "in":
      return (
        actual !== undefined &&
        Array.isArray(w.value) &&
        w.value.some((candidate) => compare(actual, candidate) === 0)
      );
    case "array-contains":
      return Array.isArray(actual) && actual.some((item) => compare(item, w.value) === 0);
    case ">":
      return actual !== undefined && compare(actual, w.value) > 0;
    case ">=":
      return actual !== undefined && compare(actual, w.value) >= 0;
    case "<":
      return actual !== undefined && compare(actual, w.value) < 0;
    case "<=":
      return actual !== undefined && compare(actual, w.value) <= 0;
  }
}

function effectiveOrder(query: Query): OrderBy[] {
  const order = [...(query.orderBy ?? [])];
  if (!order.some((o) => o.field === "__id__")) {
    // Firestore always tie-breaks on document id, in the direction of the
    // last explicit ordering.
    order.push({ field: "__id__", dir: order.length ? (order[order.length - 1].dir ?? "asc") : "asc" });
  }
  return order;
}

function runQuery(col: Collection | undefined, query: Query = {}): StoredDoc[] {
  if (!col) return [];
  const order = effectiveOrder(query);
  const explicitFields = (query.orderBy ?? []).map((o) => o.field).filter((f) => f !== "__id__");

  let rows = [...col.entries()].filter(([id, data]) => {
    // A document without a value for an orderBy field is not returned.
    for (const f of explicitFields) if (data[f] === undefined) return false;
    return (query.where ?? []).every((w) => matches(id, data, w));
  });

  rows.sort(([ida, a], [idb, b]) => {
    for (const o of order) {
      const diff = compare(fieldValue(ida, a, o.field), fieldValue(idb, b, o.field));
      if (diff !== 0) return o.dir === "desc" ? -diff : diff;
    }
    return 0;
  });

  if (query.startAfter) {
    const cursor = query.startAfter;
    rows = rows.filter(([id, data]) => {
      for (let i = 0; i < cursor.length && i < order.length; i++) {
        const diff = compare(fieldValue(id, data, order[i].field), cursor[i]);
        if (diff !== 0) return order[i].dir === "desc" ? diff < 0 : diff > 0;
      }
      return false; // equal on the whole cursor prefix → not "after"
    });
  }

  if (query.limit !== undefined) rows = rows.slice(0, query.limit);
  return rows.map(([id, data]) => ({ id, data: project(clone(data), query.select) }));
}

function project(data: DocData, select?: string[]): DocData {
  if (!select) return data;
  const out: DocData = {};
  for (const field of select) if (data[field] !== undefined) out[field] = data[field];
  return out;
}

export class MemoryStore implements Store {
  private cols = new Map<string, Collection>();
  private idCounter = 0;
  private txQueue: Promise<unknown> = Promise.resolve();

  /**
   * When provided, queries that real Firestore would reject for lack of a
   * composite index throw instead of silently succeeding.
   */
  constructor(private readonly indexes?: IndexDef[]) {}

  private checkIndex(col: string, query?: Query): void {
    if (!this.indexes || !query) return;
    const missing = missingIndex(col, query, this.indexes);
    if (missing) {
      throw new Error(`9 FAILED_PRECONDITION: The query requires an index (${missing}). Add it to firestore.indexes.json.`);
    }
  }

  /** Test helper: read raw document data without going through the API. */
  peek(col: string, id: string): DocData | undefined {
    const data = this.cols.get(col)?.get(id);
    return data ? clone(data) : undefined;
  }

  /** Test helper: every document in a collection. */
  dump(col: string): StoredDoc[] {
    return runQuery(this.cols.get(col));
  }

  newId(): string {
    this.idCounter += 1;
    // Looks like a Firestore auto-id and sorts in creation order.
    return `mem${this.idCounter.toString().padStart(8, "0")}x${Math.random().toString(36).slice(2, 8)}`;
  }

  async get(col: string, id: string, options?: ReadOptions): Promise<StoredDoc | null> {
    if (!isValidDocId(id)) return null;
    const data = this.cols.get(col)?.get(id);
    return data ? { id, data: project(clone(data), options?.select) } : null;
  }

  async getMany(col: string, ids: string[], options?: ReadOptions): Promise<(StoredDoc | null)[]> {
    return Promise.all(ids.map((id) => this.get(col, id, options)));
  }

  async query(col: string, query?: Query): Promise<StoredDoc[]> {
    this.checkIndex(col, query);
    return runQuery(this.cols.get(col), query);
  }

  async count(col: string, where?: Where[]): Promise<number> {
    return runQuery(this.cols.get(col), { where }).length;
  }

  private apply(ops: Op[]): void {
    // Validate everything first so a failing op cannot leave a partial write.
    const staged = new Map<string, DocData | null>();
    const lookup = (col: string, id: string): DocData | null => {
      const k = `${col}/${id}`;
      if (staged.has(k)) return staged.get(k) ?? null;
      return this.cols.get(col)?.get(id) ?? null;
    };

    for (const op of ops) {
      const k = `${op.col}/${op.id}`;
      const existing = lookup(op.col, op.id);
      switch (op.kind) {
        case "create":
          if (existing) throw new AlreadyExistsError(op.col, op.id);
          staged.set(k, clone(op.data));
          break;
        case "set":
          staged.set(k, clone(op.data));
          break;
        case "update": {
          if (!existing) throw new NotFoundError(op.col, op.id);
          const next = clone(existing);
          for (const [field, value] of Object.entries(op.patch)) {
            if (value === DELETE_FIELD) delete next[field];
            else if (value !== undefined) next[field] = clone(value);
          }
          staged.set(k, next);
          break;
        }
        case "delete":
          staged.set(k, null);
          break;
      }
    }

    for (const [k, data] of staged) {
      const slash = k.indexOf("/");
      const col = k.slice(0, slash);
      const id = k.slice(slash + 1);
      if (data === null) {
        this.cols.get(col)?.delete(id);
      } else {
        if (!this.cols.has(col)) this.cols.set(col, new Map());
        this.cols.get(col)!.set(id, stripUndefined(data));
      }
    }
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    // Serialise transactions, which is the strongest guarantee Firestore gives.
    const run = async (): Promise<T> => {
      const ops: Op[] = [];
      let wrote = false;
      const guard = () => {
        if (wrote) {
          throw new Error(
            "Firestore transactions require all reads to be executed before all writes."
          );
        }
      };
      const queue = (op: Op) => {
        wrote = true;
        ops.push(op);
      };
      const tx: Tx = {
        get: async (col, id, o) => (guard(), this.get(col, id, o)),
        getMany: async (col, ids, o) => (guard(), this.getMany(col, ids, o)),
        query: async (col, q) => (guard(), this.query(col, q)),
        create: (col, id, data) => queue({ kind: "create", col, id, data }),
        set: (col, id, data) => queue({ kind: "set", col, id, data }),
        update: (col, id, patch) => queue({ kind: "update", col, id, patch }),
        delete: (col, id) => queue({ kind: "delete", col, id }),
      };
      const result = await fn(tx);
      this.apply(ops);
      return result;
    };
    const next = this.txQueue.then(run, run);
    this.txQueue = next.catch(() => undefined);
    return next;
  }

  batch(): Batch {
    const ops: Op[] = [];
    const writer: Writer = {
      create: (col, id, data) => void ops.push({ kind: "create", col, id, data }),
      set: (col, id, data) => void ops.push({ kind: "set", col, id, data }),
      update: (col, id, patch) => void ops.push({ kind: "update", col, id, patch }),
      delete: (col, id) => void ops.push({ kind: "delete", col, id }),
    };
    return {
      ...writer,
      commit: async () => this.apply(ops),
    };
  }
}

function stripUndefined(data: DocData): DocData {
  const out: DocData = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = v;
  return out;
}
