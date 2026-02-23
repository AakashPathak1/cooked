"use client";

import { ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { BottomNav } from "./BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";

function PushSetup() {
  const { user } = useAuth();
  usePushNotifications(user?.uid ?? null);
  return null;
}

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <PushSetup />
      <div className="max-w-lg mx-auto min-h-screen">
        {children}
      </div>
      <BottomNav />
    </AuthProvider>
  );
}
