import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, useId } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-mute/70 transition-colors hover:border-mute/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(control, "h-11", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-[88px] resize-y py-2.5 leading-relaxed", className)} {...props} />;
  }
);

/** Label + control + hint/error wired together for assistive tech. */
export function Field({
  label,
  hint,
  error,
  counter,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  counter?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {counter && <span className="tabular text-xs text-mute">{counter}</span>}
      </div>
      {children({ id, "aria-describedby": note ? noteId : undefined, "aria-invalid": error ? true : undefined })}
      {note && (
        <p id={noteId} className={cn("text-[13px]", error ? "text-danger" : "text-mute")}>
          {note}
        </p>
      )}
    </div>
  );
}
