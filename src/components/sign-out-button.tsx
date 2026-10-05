"use client";

import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

/** Full-width danger-text button; pass className to resize it. */
export default function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={cn(
        "h-[52px] w-full rounded-2xl bg-surface text-danger-soft text-[15px] font-semibold flex items-center justify-center gap-2",
        className
      )}
    >
      Sign out
    </button>
  );
}
