"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
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
      type="button"
      onClick={() => signIn("google", { callbackUrl: safeCallback(params.get("callbackUrl")) })}
      className="btn-chalk"
    >
      <GoogleIcon />
      {isConnect ? "Sign in to connect Claude" : "Continue with Google"}
    </button>
  );
}

export default function LoginPage() {
  return (
    <main className="relative overflow-hidden min-h-dvh flex flex-col justify-between bg-bg px-5 pt-[max(96px,calc(env(safe-area-inset-top)+64px))] pb-[max(34px,calc(env(safe-area-inset-bottom)+16px))]">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-[120px] bottom-[180px] w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle,rgba(255,106,43,.2),rgba(255,106,43,0)_65%)]"
      />
      <div className="relative flex flex-col gap-5">
        <span aria-hidden className="w-14 h-1.5 rounded-[3px] bg-accent origin-left animate-bar" />
        <h1 className="m-0 font-display font-black stretch-62 text-[clamp(72px,26vw,104px)] leading-[0.84] tracking-[-0.01em] uppercase">
          <span className="block animate-word-up">Train.</span>
          <span className="block animate-word-up [animation-delay:80ms]">Log.</span>
          <span className="block animate-word-up [animation-delay:160ms] text-accent">Lift.</span>
        </h1>
        <p className="m-0 max-w-[300px] text-[17px] leading-[1.45] text-fg-2 animate-rise [animation-delay:400ms]">
          Your PT programs it through Claude. You lift. Olympus keeps the score.
        </p>
      </div>
      <div className="relative flex flex-col gap-3 w-full max-w-sm mx-auto animate-rise [animation-delay:400ms]">
        <Suspense fallback={<div className="h-[58px]" />}>
          <SignIn />
        </Suspense>
        <div className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-surface shadow-[inset_0_0_0_1px_#232327]">
          <span className="w-9 h-9 shrink-0 rounded-[10px] bg-surface-3 text-info flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 15V3M7 8l5-5 5 5" />
              <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
            </svg>
          </span>
          <span className="text-[13px] leading-[1.4] text-fg-2">
            On iPhone: tap <b className="text-fg font-semibold">Share</b> → <b className="text-fg font-semibold">Add to Home Screen</b> for
            full-screen, offline lifting.
          </span>
        </div>
      </div>
    </main>
  );
}
