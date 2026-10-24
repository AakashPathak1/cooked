"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A photo that reserves its space and shows the picture's dominant colour
 * until the bytes arrive, then fades in. Falls back to a plain tile if the
 * image fails.
 */
export function Cover({
  src,
  color,
  alt = "",
  className,
  ratio = "aspect-[4/5]",
  priority,
}: {
  src: string | null;
  color?: string | null;
  alt?: string;
  className?: string;
  ratio?: string;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <div
      className={cn("relative w-full overflow-hidden bg-sunk", ratio, className)}
      style={{ backgroundColor: color ?? undefined }}
    >
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}
