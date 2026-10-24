/**
 * Display helpers: turn raw ELO into the 0–10 score, tier letter and colour
 * that the UI shows. Pure functions, shared by server and client.
 */

const SCALE_MIN = 1000;
const SCALE_SPAN = 400;

/** Maps ELO to a continuous 0–10 value. 1200 → 5.0, 1360 → 9.0, 1400+ → 10. */
export function eloToScore(elo: number): number {
  const raw = ((elo - SCALE_MIN) / SCALE_SPAN) * 10;
  return Math.min(10, Math.max(0, raw));
}

/** Same as `eloToScore`, formatted with one decimal ("7.4"). */
export function eloToRating(elo: number): string {
  return eloToScore(elo).toFixed(1);
}

export type TierLetter = "S" | "A" | "B" | "C" | "D";

export const TIER_ORDER: TierLetter[] = ["S", "A", "B", "C", "D"];

export const TIER_THRESHOLDS: Record<TierLetter, number> = {
  S: 1400,
  A: 1300,
  B: 1200,
  C: 1100,
  D: -Infinity,
};

export function eloTier(elo: number): TierLetter {
  for (const letter of TIER_ORDER) {
    if (elo >= TIER_THRESHOLDS[letter]) return letter;
  }
  return "D";
}

// ─── Colour ──────────────────────────────────────────────────────────────────
// A warm, food-toned ramp instead of a raw red→green hue sweep. Stops sit at
// 0, 2.5, 5, 7.5 and 10 on the display scale and are interpolated in RGB.

const RAMP: { at: number; rgb: [number, number, number] }[] = [
  { at: 0, rgb: [0xa8, 0x32, 0x2a] }, //   brick
  { at: 2.5, rgb: [0xcc, 0x5f, 0x2c] }, // terracotta
  { at: 5, rgb: [0xd0, 0x9a, 0x22] }, //   mustard
  { at: 7.5, rgb: [0x7b, 0x96, 0x3a] }, // olive
  { at: 10, rgb: [0x2d, 0x7a, 0x4b] }, //  herb green
];

function toHex(n: number): string {
  return Math.round(n).toString(16).padStart(2, "0");
}

export function scoreColor(elo: number): string {
  const s = eloToScore(elo);
  let lo = RAMP[0];
  let hi = RAMP[RAMP.length - 1];
  for (let i = 0; i < RAMP.length - 1; i++) {
    if (s >= RAMP[i].at && s <= RAMP[i + 1].at) {
      lo = RAMP[i];
      hi = RAMP[i + 1];
      break;
    }
  }
  const t = hi.at === lo.at ? 0 : (s - lo.at) / (hi.at - lo.at);
  const [r, g, b] = lo.rgb.map((c, i) => c + (hi.rgb[i] - c) * t);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Readable text colour (near-black or white) for a given background hex. */
export function onColor(hex: string): "#1d1814" | "#ffffff" {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.38 ? "#1d1814" : "#ffffff";
}
