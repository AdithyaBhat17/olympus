"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/today",
    label: "Today",
    match: ["/today", "/settings"],
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    href: "/history",
    label: "Log",
    match: ["/history", "/log"],
    icon: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  },
  {
    href: "/progress",
    label: "Progress",
    match: ["/progress"],
    icon: (
      <>
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
      </>
    ),
  },
  {
    href: "/exercises",
    label: "Library",
    match: ["/exercises"],
    icon: <path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12" />,
  },
];

/** Hidden while training and on full-screen form cues. */
const HIDE_ON = ["/session", "/form"];

/**
 * Floating capsule tab bar: 12px from the sides, 26px above the safe area,
 * blurred glass, chalk pill on the active tab.
 */
export default function BottomNav() {
  const pathname = usePathname();
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav
      aria-label="Primary"
      className="glass fixed z-50 left-3 right-3 mx-auto max-w-[480px] h-16 rounded-[32px] p-1.5 grid grid-cols-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 26px)" }}
    >
      {tabs.map((tab) => {
        const active = tab.match.some((m) => pathname.startsWith(m));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[26px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
              active ? "bg-fg text-bg" : "text-muted"
            )}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={cn("transition-transform duration-200 ease-press", active && "-translate-y-px")}
            >
              {tab.icon}
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
