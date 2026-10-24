"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError, fetcher } from "@/lib/client/api";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <SWRConfig
        value={{
          fetcher,
          dedupingInterval: 4000,
          revalidateOnFocus: true,
          focusThrottleInterval: 30_000,
          shouldRetryOnError: (err) => !(err instanceof ApiError) || err.status >= 500,
          onError: (err) => {
            if (err instanceof ApiError && err.status === 401 && typeof window !== "undefined") {
              window.location.assign("/signin");
            }
          },
        }}
      >
        <ToastProvider>{children}</ToastProvider>
      </SWRConfig>
    </SessionProvider>
  );
}
