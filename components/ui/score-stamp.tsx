import { cn } from "@/lib/cn";
import { eloToRating, eloTier, onColor, scoreColor } from "@/lib/score";

const SIZES = {
  xs: { box: "h-7 min-w-7 px-1.5 text-[12px]", tier: false },
  sm: { box: "h-9 min-w-9 px-2 text-[14px]", tier: false },
  md: { box: "h-12 w-12 text-[18px]", tier: false },
  lg: { box: "h-20 w-20 text-[30px]", tier: true },
} as const;

/**
 * The score as an enamel disc. Its colour comes from the same warm ramp
 * everywhere so a glance tells you how good a dish is.
 */
export function ScoreStamp({
  elo,
  size = "md",
  className,
  label,
}: {
  elo: number;
  size?: keyof typeof SIZES;
  className?: string;
  /** Spoken label, e.g. "Group score". */
  label?: string;
}) {
  const bg = scoreColor(elo);
  const s = SIZES[size];
  const rating = eloToRating(elo);
  return (
    <span
      role="img"
      aria-label={`${label ?? "Score"} ${rating} out of 10, tier ${eloTier(elo)}`}
      className={cn(
        "relative inline-flex shrink-0 flex-col items-center justify-center rounded-full font-display font-extrabold leading-none tracking-tight tabular shadow-[inset_0_0_0_2px_rgb(255_255_255/0.22)]",
        s.box,
        className
      )}
      style={{ backgroundColor: bg, color: onColor(bg) }}
    >
      {rating === "10.0" ? "10" : rating}
      {s.tier && <span className="mt-0.5 text-[11px] font-bold opacity-80">Tier {eloTier(elo)}</span>}
    </span>
  );
}
