"use client";

import { signIn } from "next-auth/react";

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Atmospheric glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-950/20 via-transparent to-transparent" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/[0.04] rounded-full blur-[100px]" />

      <div className="relative z-10 flex flex-col items-center">
        {/* Logo */}
        <div className="text-center mb-16">
          <h1 className="text-6xl sm:text-7xl font-black tracking-tight text-stone-50 leading-none">
            OLYMPUS
          </h1>
          <div className="mt-4 flex items-center gap-3 justify-center">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-amber-500/60" />
            <p className="text-stone-500 tracking-[0.3em] uppercase text-[11px] font-medium">
              Forge Your Strength
            </p>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-amber-500/60" />
          </div>
        </div>

        {/* Sign in */}
        <button
          onClick={() => signIn("google", { callbackUrl: "/log" })}
          className="flex items-center gap-3 bg-stone-900 hover:bg-stone-800
            border border-stone-800 hover:border-stone-700
            text-stone-200 px-8 py-4 rounded-2xl text-base font-medium
            transition-all active:scale-[0.97] shadow-lg shadow-black/20"
        >
          <GoogleIcon />
          Sign in with Google
        </button>

        <p className="mt-8 text-stone-700 text-xs">Personal training log</p>
      </div>
    </div>
  );
}
