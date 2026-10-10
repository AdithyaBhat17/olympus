import Link from "next/link";
import { getSession, requireUserEmail } from "@/lib/auth";
import { todayScreen } from "@/server/screens/today";
import { PageHeader } from "@/components/page-header";
import { RecoveryCard } from "@/components/today/recovery-card";
import { FlagsList } from "@/components/today/flags-list";
import { NextSessionCard } from "@/components/today/next-session-card";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const [session, userId] = await Promise.all([getSession(), requireUserEmail()]);
  const screen = await todayScreen(userId);
  const who = session?.user?.name?.trim() || session?.user?.email || "?";
  const initial = who.charAt(0).toUpperCase();

  return (
    <div>
      <PageHeader
        eyebrow={screen.eyebrow}
        title="Today"
        action={
          <Link
            href="/settings"
            aria-label="Settings"
            className="w-11 h-11 rounded-full bg-surface-2 font-semibold flex items-center justify-center shrink-0"
          >
            {initial}
          </Link>
        }
      />

      <NextSessionCard data={screen.next} />

      <RecoveryCard {...screen.recovery} />

      <FlagsList flags={screen.flags} />
    </div>
  );
}
