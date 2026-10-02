"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

/** Only same-origin paths — never bounce a sign-in to another site. */
function safeCallback(raw: string | null): string {
  if (!raw) return "/today";
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return "/today";
    return `${u.pathname}${u.search}` || "/today";
  } catch {
    return "/today";
  }
}

function SignIn() {
  const params = useSearchParams();
  const isConnect = (params.get("callbackUrl") ?? "").includes("/oauth/authorize");
  return (
    <button
      onClick={() => signIn("google", { callbackUrl: safeCallback(params.get("callbackUrl")) })}
      className="flex items-center justify-center gap-3 w-full h-14 rounded-[14px] bg-surface hover:bg-surface-2 border border-line text-fg text-base font-medium transition active:scale-[0.98]"
    >
      <GoogleIcon />
      {isConnect ? "Sign in to connect Claude" : "Sign in with Google"}
    </button>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col justify-end px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-16 bg-bg">
      <div className="flex-1 flex flex-col justify-center gap-3">
        <span className="eyebrow">LiftLog</span>
        <h1 className="font-display font-bold text-[72px] leading-[0.9] tracking-tight">
          Olympus
        </h1>
        <p className="text-muted text-base max-w-[28ch] leading-snug">
          Your training log, programmed by your PT. Plans land on Today; sets go back to Claude.
        </p>
      </div>
      <div className="flex flex-col gap-4 w-full max-w-sm mx-auto">
        <Suspense fallback={<div className="h-14" />}>
          <SignIn />
        </Suspense>
        <p className="text-faint text-xs text-center">Personal training log</p>
      </div>
    </main>
  );
}
