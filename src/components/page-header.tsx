import { cn } from "@/lib/utils";

/**
 * Large-title page header: Geist Mono eyebrow, then the title in Archivo 44px.
 * `action` sits bottom-right (avatar, + button…).
 */
export function PageHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("page-top px-5 pb-1 flex justify-between items-end gap-3 arrive", className)}>
      <div className="flex flex-col gap-1.5 min-w-0">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="page-title">{title}</h1>
      </div>
      {action}
    </header>
  );
}

/** Back pill used on detail pages: "‹ Progress". */
export function BackIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
