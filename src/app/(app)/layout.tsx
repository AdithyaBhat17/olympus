import { after } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Providers } from "@/components/providers";
import BottomNav from "@/components/bottom-nav";
import { syncWhoopIfStale } from "@/server/integrations/whoop";
import { getProfile, rememberDisplayName } from "@/server/profile";
import { TimezoneSync } from "@/components/timezone-sync";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Keep last night's Whoop sleep fresh without slowing the page down.
  const email = session.user.email;
  if (email) {
    after(() => syncWhoopIfStale(email).catch((err) => console.error("whoop sync", err)));
  }
  const profile = email ? await getProfile(email) : null;
  // The iOS app shows the name too, and it only has the database to go on.
  const name = session.user.name?.trim();
  if (email && profile && name && profile.displayName !== name) {
    after(() => rememberDisplayName(email, name).catch((err) => console.error("display name", err)));
  }

  return (
    <Providers>
      {profile && !profile.timezoneSet && <TimezoneSync />}
      <div className="min-h-dvh flex flex-col bg-bg">
        <main className="flex-1 w-full max-w-lg mx-auto tab-clearance">{children}</main>
        <BottomNav />
      </div>
    </Providers>
  );
}
