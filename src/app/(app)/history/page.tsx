import Link from "next/link";
import { requireUserEmail } from "@/lib/auth";
import { historyScreen } from "@/server/screens/history";
import { PageHeader } from "@/components/page-header";
import HistoryList from "@/components/history-list";

export const metadata = { title: "Log" };

export default async function HistoryPage() {
  const { eyebrow, ...screen } = await historyScreen(await requireUserEmail());
  return (
    <div>
      <PageHeader
        eyebrow={eyebrow}
        title="Log"
        action={
          <Link
            href="/log"
            aria-label="Log a past session"
            className="w-11 h-11 rounded-full bg-accent text-accent-ink flex items-center justify-center shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        }
      />
      <HistoryList {...screen} />
    </div>
  );
}
