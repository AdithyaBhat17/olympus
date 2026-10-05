"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/today",
    label: "Today",
    match: ["/today", "/settings"],
    icon: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  },
  {
    href: "/history",
    label: "Log",
    match: ["/history", "/log"],
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="3.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    href: "/progress",
    label: "Progress",
    match: ["/progress"],
    icon: (
      <>
        <path d="M4 4v16h16" />
        <path d="M7.5 15l4-4.5 3 3L20 7" />
      </>
    ),
  },
  {
    href: "/exercises",
    label: "Library",
    match: ["/exercises"],
    icon: (
      <>
        <path d="M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z" />
        <path d="M5 16.5a3 3 0 0 1 3-3h11M9 8.5h6" />
      </>
    ),
  },
];

/** Hidden while training and on full-screen form cues. */
const HIDE_ON = ["/session", "/form"];
const ITEM = 66; // px per tab inside the pill

/**
 * Floating ink pill: icons only, a white capsule springs to the active tab.
 */
export default function BottomNav() {
  const pathname = usePathname();
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;
  const active = tabs.findIndex((t) => t.match.some((m) => pathname.startsWith(m)));

  return (
    <nav
      aria-label="Primary"
      className="fixed z-50 inset-x-0 flex justify-center pointer-events-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
    >
      <div
        className="pointer-events-auto relative h-16 rounded-full bg-fg px-1.5 grid grid-cols-4 items-center shadow-[0_12px_30px_rgba(30,20,18,.3)]"
        style={{ width: ITEM * tabs.length + 12 }}
      >
        {active >= 0 && (
          <span
            aria-hidden
            className="absolute left-1.5 top-1.5 h-[52px] rounded-full bg-white transition-transform duration-500 ease-spring"
            style={{ width: ITEM, transform: `translateX(${active * ITEM}px)` }}
          />
        )}
        {tabs.map((tab, i) => {
          const on = i === active;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch
              aria-label={tab.label}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative z-10 h-[52px] flex items-center justify-center transition-colors duration-300",
                on ? "text-fg" : "text-white"
              )}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {tab.icon}
              </svg>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
