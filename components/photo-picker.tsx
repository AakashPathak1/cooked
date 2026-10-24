"use client";

import { Camera, ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageError, processImage, type ProcessedImage } from "@/lib/client/image";
import { cn } from "@/lib/cn";

/** Pick or take a photo; hands back processed JPEGs ready to upload. */
export function PhotoPicker({
  value,
  onChange,
  error,
  className,
}: {
  value: ProcessedImage | null;
  onChange: (img: ProcessedImage | null) => void;
  error?: string | null;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      onChange(await processImage(file));
    } catch (err) {
      setProblem(err instanceof ImageError ? err.message : "That photo couldn't be processed. Try another.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  useEffect(() => setProblem(error ?? null), [error]);

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Choose a photo"
        onChange={(e) => take(e.target.files?.[0])}
      />
      {value ? (
        <div className="relative overflow-hidden rounded-2xl bg-sunk">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.photo} alt="Your photo" className="max-h-[60dvh] w-full object-cover" />
          <Button
            type="button"
            variant="ink"
            size="sm"
            className="absolute bottom-3 right-3"
            onClick={() => input.current?.click()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Change
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void take(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          className={cn(
            "flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-mute transition-colors hover:border-brand hover:text-brand",
            drag ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface"
          )}
        >
          {busy ? <Loader2 className="h-8 w-8 animate-spin" aria-hidden /> : <Camera className="h-8 w-8 md:hidden" aria-hidden />}
          {!busy && <ImagePlus className="hidden h-8 w-8 md:block" aria-hidden />}
          <span className="text-[15px] font-medium text-ink">{busy ? "Preparing photo…" : "Add a photo"}</span>
          {!busy && <span className="text-sm">Take one now or choose from your library</span>}
        </button>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
