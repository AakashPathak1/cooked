import type { NotificationType } from "./types";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** One-line human description used in push bodies and the activity list. */
export function describeNotification(
  type: NotificationType,
  fromName: string,
  dishName: string,
  preview?: string
): string {
  const who = clip(fromName || "Someone", 40);
  const dish = clip(dishName || "a dish", 60);
  switch (type) {
    case "like":
      return `${who} liked ${dish}`;
    case "comment":
      return preview ? `${who} on ${dish}: ${clip(preview, 80)}` : `${who} commented on ${dish}`;
    case "tag":
      return `${who} tagged you in ${dish}`;
    case "accepted":
      return `${who} added ${dish} to their dishes`;
    case "tried":
      return `${who} tried ${dish}`;
  }
}
