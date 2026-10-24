"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Visually hide the title (still read by screen readers). */
  hideTitle?: boolean;
  className?: string;
}

/** Bottom sheet on phones, centred dialog from `md` up. */
export function Sheet({ open, onOpenChange, title, description, children, hideTitle, className }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-[61] flex max-h-[88dvh] animate-sheet-up flex-col rounded-t-3xl bg-surface pb-safe shadow-2xl focus:outline-none",
            "md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:animate-pop-in md:rounded-3xl",
            className
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4">
            <div className={cn(hideTitle && "sr-only")}>
              <Dialog.Title className="font-display text-xl font-semibold">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-mute">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-mute hover:bg-sunk hover:text-ink"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
