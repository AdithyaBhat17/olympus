"use client";

import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

/** Compact bordered button (44px tall); pass className to stretch or reposition it. */
export default function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={cn(
        "h-11 px-4 rounded-xl border border-line bg-surface text-sm text-danger-soft flex items-center justify-center gap-2 transition hover:bg-surface-2 hover:text-danger-text active:scale-[0.98]",
        className
      )}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" />
        <path d="M10 16l-4-4 4-4" />
        <path d="M6 12h10" />
      </svg>
      Sign out
    </button>
  );
}
