"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Goes back in history when there is somewhere to go back to (session,
 * exercise progress), otherwise to the fallback. A real link either way.
 */
export default function BackLink({
  fallback = "/today",
  className,
  children,
  "aria-label": ariaLabel,
}: {
  fallback?: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      {children}
    </Link>
  );
}
