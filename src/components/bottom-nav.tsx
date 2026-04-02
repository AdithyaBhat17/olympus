"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PlusCircleIcon as PlusCircleOutline,
  ClockIcon as ClockOutline,
  ListBulletIcon as ListBulletOutline,
  ChartBarIcon as ChartBarOutline,
} from "@heroicons/react/24/outline";
import {
  PlusCircleIcon as PlusCircleSolid,
  ClockIcon as ClockSolid,
  ListBulletIcon as ListBulletSolid,
  ChartBarIcon as ChartBarSolid,
} from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/log",
    label: "Log",
    outline: PlusCircleOutline,
    solid: PlusCircleSolid,
  },
  {
    href: "/history",
    label: "History",
    outline: ClockOutline,
    solid: ClockSolid,
  },
  {
    href: "/exercises",
    label: "Exercises",
    outline: ListBulletOutline,
    solid: ListBulletSolid,
  },
  {
    href: "/progress",
    label: "Progress",
    outline: ChartBarOutline,
    solid: ChartBarSolid,
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-stone-950/90 backdrop-blur-xl border-t border-stone-800/60 safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          const Icon = isActive ? tab.solid : tab.outline;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-colors min-w-[60px]",
                isActive
                  ? "text-amber-500"
                  : "text-stone-500 active:text-stone-300"
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-semibold tracking-wide">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
