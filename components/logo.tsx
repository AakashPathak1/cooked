import { cn } from "@/lib/cn";

/** A pot lid seen from above: the enamel-cobalt disc and its knob. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden>
      <circle cx="16" cy="17" r="13" fill="hsl(var(--brand))" />
      <circle cx="16" cy="17" r="9.2" fill="none" stroke="hsl(var(--brand-ink))" strokeOpacity=".45" strokeWidth="1.2" />
      <rect x="12.5" y="3.4" width="7" height="3.6" rx="1.8" fill="hsl(var(--ink))" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-[22px] font-extrabold leading-none tracking-tightest">cooked</span>
    </span>
  );
}
