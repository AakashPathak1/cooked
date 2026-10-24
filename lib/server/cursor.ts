/** Opaque pagination cursors: a base64url-encoded JSON tuple. */

export type CursorValue = string | number;

export function encodeCursor(values: CursorValue[]): string {
  return Buffer.from(JSON.stringify(values), "utf8").toString("base64url");
}

/** Returns null for anything malformed, so callers can treat it as page one. */
export function decodeCursor(raw: string | null | undefined): CursorValue[] | null {
  if (!raw || raw.length > 400) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 3) return null;
    if (!parsed.every((v) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v)))) {
      return null;
    }
    return parsed as CursorValue[];
  } catch {
    return null;
  }
}
