/**
 * A deliberately narrow document-store interface. All domain logic is written
 * against this, which gives us two implementations:
 *
 *  - `admin.ts`  – production, backed by Firestore through firebase-admin
 *  - `memory.ts` – an in-memory fake used by unit tests and the dev demo mode
 *
 * Only the Firestore features the app really uses are exposed, and the
 * memory store reproduces the sharp edges that matter (documents missing an
 * `orderBy` field are excluded; transactions must read before they write).
 */

/** Values are plain JSON plus `Date` (stored as Firestore Timestamps). */
export type DocData = Record<string, unknown>;

export interface StoredDoc {
  id: string;
  data: DocData;
}

export type WhereOp = "==" | "!=" | "in" | "array-contains" | ">" | ">=" | "<" | "<=";

export interface Where {
  field: string;
  op: WhereOp;
  value: unknown;
}

export interface OrderBy {
  /** Use `"__id__"` to order by document id. */
  field: string;
  dir?: "asc" | "desc";
}

export interface ReadOptions {
  /**
   * Only return these top-level fields. Used to avoid transferring the large
   * base64 image fields when they are not needed.
   */
  select?: string[];
}

export interface Query extends ReadOptions {
  where?: Where[];
  orderBy?: OrderBy[];
  limit?: number;
  /**
   * Cursor values aligned with `orderBy` (plus the document id as the final
   * element). Always pass the full tuple so ties on the sort field are never
   * skipped.
   */
  startAfter?: unknown[];
}

/** Sentinel for `update()` that removes a field. */
export const DELETE_FIELD: unique symbol = Symbol("cooked.deleteField");

export interface Reader {
  get(collection: string, id: string, options?: ReadOptions): Promise<StoredDoc | null>;
  /** Results line up with `ids`; missing documents are `null`. */
  getMany(collection: string, ids: string[], options?: ReadOptions): Promise<(StoredDoc | null)[]>;
  query(collection: string, query?: Query): Promise<StoredDoc[]>;
}

/** Writes are queued synchronously and applied on commit. */
export interface Writer {
  /** Fails if the document already exists. */
  create(collection: string, id: string, data: DocData): void;
  /** Full overwrite. */
  set(collection: string, id: string, data: DocData): void;
  /** Merge top-level fields. Fails if the document does not exist. */
  update(collection: string, id: string, patch: Record<string, unknown>): void;
  delete(collection: string, id: string): void;
}

export interface Tx extends Reader, Writer {}

export interface Batch extends Writer {
  commit(): Promise<void>;
}

export interface Store extends Reader {
  count(collection: string, where?: Where[]): Promise<number>;
  newId(): string;
  /** Reads must all happen before the first write inside `fn`. */
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /**
   * Queued writes applied together. Very large batches are split into
   * several commits, so do not rely on atomicity beyond ~400 operations.
   */
  batch(): Batch;
}

export class AlreadyExistsError extends Error {
  constructor(collection: string, id: string) {
    super(`Document ${collection}/${id} already exists`);
    this.name = "AlreadyExistsError";
  }
}

export class NotFoundError extends Error {
  constructor(collection: string, id: string) {
    super(`Document ${collection}/${id} not found`);
    this.name = "NotFoundError";
  }
}

/** `in` queries are limited to 30 values by Firestore. */
export const IN_QUERY_LIMIT = 30;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
