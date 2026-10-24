import type { ReactNode } from "react";

/** Says what's missing and offers the next step. */
export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-xs flex-col items-center px-4 py-14 text-center">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {body && <p className="mt-2 text-[15px] leading-relaxed text-mute">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Empty
      title="That didn't load"
      body={message}
      action={
        onRetry && (
          <button onClick={onRetry} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg">
            Try again
          </button>
        )
      }
    />
  );
}
