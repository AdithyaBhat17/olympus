"use client";

import { SessionProvider } from "next-auth/react";
import { OfflineSync } from "./offline-sync";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OfflineSync />
      {children}
    </SessionProvider>
  );
}
