import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton animate-shimmer rounded-xl", className)} />;
}
