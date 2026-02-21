"use client";

import { ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { BottomNav } from "./BottomNav";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div className="max-w-lg mx-auto min-h-screen">
        {children}
      </div>
      <BottomNav />
    </AuthProvider>
  );
}
