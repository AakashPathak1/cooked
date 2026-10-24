"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onOpenChange={(o) => !busy && onOpenChange(o)} title={title} description={body}>
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="soft" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant={danger ? "danger" : "solid"}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onOpenChange(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
