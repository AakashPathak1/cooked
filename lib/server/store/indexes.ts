import type { Query } from "./types";

export interface IndexField {
  fieldPath: string;
  order?: string;
  arrayConfig?: string;
}
export interface IndexDef {
  collectionGroup: string;
  fields: IndexField[];
}

const EQUALITY = new Set(["==", "in", "array-contains"]);

/**
 * Firestore rejects (FAILED_PRECONDITION) any query that needs a composite
 * index which has not been deployed. Emulating that here keeps in-memory
 * tests honest. Returns a description of the missing index, or null.
 *
 * Model: equality filters plus a single orderBy on one of them, or a sole
 * ordering/range on one field, are served by automatic single-field indexes.
 * Anything else needs a composite index whose leading fields are the equality
 * fields (any order) followed by the orderBy fields with matching directions.
 */
export function missingIndex(collection: string, query: Query, indexes: IndexDef[]): string | null {
  const order = (query.orderBy ?? []).filter((o) => o.field !== "__id__");
  const where = query.where ?? [];
  const equality = [...new Set(where.filter((w) => EQUALITY.has(w.op) && w.field !== "__id__").map((w) => w.field))];
  const ranges = [...new Set(where.filter((w) => !EQUALITY.has(w.op)).map((w) => w.field))];

  const orderFields = order.filter((o) => !equality.includes(o.field));
  const needsComposite =
    (equality.length > 0 && orderFields.length > 0) ||
    orderFields.length > 1 ||
    (ranges.length > 0 && equality.length > 0) ||
    ranges.length > 1 ||
    (ranges.length === 1 && orderFields.length > 0 && orderFields[0].field !== ranges[0]);
  if (!needsComposite) return null;

  const want = [
    ...equality.map((f) => ({ f, dir: null as string | null })),
    ...(ranges.length && !orderFields.length ? ranges.map((f) => ({ f, dir: "asc" as string | null })) : []),
    ...orderFields.map((o) => ({ f: o.field, dir: o.dir ?? "asc" })),
  ];
  const eqCount = equality.length;

  const ok = indexes.some((idx) => {
    if (idx.collectionGroup !== collection || idx.fields.length !== want.length) return false;
    const lead = idx.fields.slice(0, eqCount).map((f) => f.fieldPath);
    if (!equality.every((f) => lead.includes(f))) return false;
    return idx.fields.slice(eqCount).every((f, i) => {
      const w = want[eqCount + i];
      const dir = f.order === "DESCENDING" ? "desc" : "asc";
      return f.fieldPath === w.f && (w.dir === null || w.dir === dir);
    });
  });
  if (ok) return null;

  return `${collection}: ${want
    .map((w) => `${w.f}${w.dir ? ` ${w.dir.toUpperCase()}` : ""}`)
    .join(", ")}`;
}
