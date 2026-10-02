"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/today",
    label: "Today",
    match: ["/today"],
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

export default function BottomNav() {
  const pathname = usePathname();
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      <div aria-hidden className="h-[84px]" />
      <nav
        aria-label="Main"
        className="fixed bottom-0 inset-x-0 z-50 bg-bg-nav border-t border-line safe-bottom"
      >
        <div className="grid grid-cols-4 max-w-lg mx-auto pt-2 pb-2">
          {tabs.map((tab) => {
            const active = tab.match.some((m) => pathname.startsWith(m));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-1.5 text-[11px] min-h-[44px]",
                  active ? "text-accent" : "text-muted hover:text-fg-2"
                )}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {tab.icon}
                </svg>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
