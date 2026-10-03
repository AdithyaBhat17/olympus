import { after } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Providers } from "@/components/providers";
import BottomNav from "@/components/bottom-nav";
import { syncWhoopIfStale } from "@/server/integrations/whoop";

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

  return (
    <Providers>
      <div className="min-h-dvh flex flex-col bg-bg">
        <main className="flex-1 w-full max-w-lg mx-auto tab-clearance">{children}</main>
        <BottomNav />
      </div>
    </Providers>
  );
}
