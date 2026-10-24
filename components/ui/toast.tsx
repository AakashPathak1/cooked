"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface ToastInput {
  message: string;
  tone?: "default" | "error";
  action?: { label: string; onClick: () => void };
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (input: ToastInput) => {
      const id = next.current++;
      setItems((cur) => [...cur.slice(-2), { ...input, id }]);
      setTimeout(() => dismiss(id), input.action ? 6000 : 3800);
    },
    [dismiss]
  );
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 px-4 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex max-w-md animate-toast-in items-center gap-3 rounded-full py-2.5 pl-4 pr-3 text-sm font-medium shadow-lg",
              t.tone === "error" ? "bg-danger text-white" : "bg-ink text-bg"
            )}
          >
            {t.tone === "error" ? (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <Check className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="rounded-full px-2 py-1 font-semibold underline-offset-2 hover:underline"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
