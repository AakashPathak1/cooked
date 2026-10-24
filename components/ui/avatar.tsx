"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { initial } from "@/lib/format";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

/** Deterministic muted background per name so initials are distinguishable. */
function tint(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 32% 42%)`;
}

export function Avatar({ name, src, size = 36, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: showImage ? undefined : tint(name || "?") }}
      aria-hidden={!name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initial(name)
      )}
    </span>
  );
}
