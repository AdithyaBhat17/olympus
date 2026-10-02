import BackLink from "./back-link";
import { cn } from "@/lib/utils";

/**
 * Full-screen frame shared by the form-cue screens: back + title header,
 * scrolling content, and a sticky "Back" action at the bottom.
 */
export default function FormShell({
  title,
  subtitle,
  aside,
  bordered = false,
  children,
}: {
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
  /** Deadlift artboard draws a rule under the header. */
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-bg text-fg">
      <header
        className={cn(
          "sticky top-0 z-10 bg-bg flex items-center gap-2 pl-2 pr-4 pb-2.5 pt-[max(12px,env(safe-area-inset-top))]",
          bordered && "border-b border-line"
        )}
      >
        <BackLink
          aria-label="Back"
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl text-fg hover:bg-surface"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5L8 12l7 7" />
          </svg>
        </BackLink>
        <div className="flex flex-col gap-px flex-1 min-w-0">
          <h1 className="m-0 font-display font-bold text-[26px] leading-[1.05] tracking-[0.2px] truncate">{title}</h1>
          <p className="m-0 text-[13px] text-muted truncate">{subtitle}</p>
        </div>
        {aside}
      </header>

      <main className="flex-1 flex flex-col gap-3.5 px-4 pt-3.5 pb-5">{children}</main>

      <footer className="sticky bottom-0 bg-bg border-t border-line px-4 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]">
        <BackLink className="h-[52px] flex items-center justify-center rounded-[14px] bg-accent text-accent-ink font-display font-bold text-xl tracking-[0.4px] hover:bg-accent-hover">
          Back
        </BackLink>
      </footer>
    </div>
  );
}
