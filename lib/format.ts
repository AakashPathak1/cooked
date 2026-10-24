/** Relative time like "just now", "5m", "3h", "2d", "Mar 4". */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m`;
  if (diff < 86_400) return `${Math.round(diff / 3600)}h`;
  if (diff < 7 * 86_400) return `${Math.round(diff / 86_400)}d`;
  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(new Date(then).getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}),
  });
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** First character of a name for avatar fallbacks, safe for emoji / empty. */
export function initial(name: string | null | undefined): string {
  const first = Array.from((name ?? "").trim())[0];
  return first ? first.toUpperCase() : "?";
}

/**
 * Only allow http(s) URLs through to `href` attributes. React does not block
 * `javascript:` URLs, so any user-supplied link must pass through this.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Hostname for display next to recipe links ("seriouseats.com"). */
export function hostnameOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
