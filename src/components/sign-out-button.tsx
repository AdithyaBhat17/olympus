"use client";

import { signOut } from "next-auth/react";
import { ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-stone-500 hover:text-stone-300 active:text-stone-400 p-2 -mr-2 transition-colors"
      aria-label="Sign out"
    >
      <ArrowRightStartOnRectangleIcon className="w-5 h-5" />
    </button>
  );
}
