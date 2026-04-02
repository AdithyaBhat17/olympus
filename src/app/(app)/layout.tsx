import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Providers } from "@/components/providers";
import BottomNav from "@/components/bottom-nav";
import SignOutButton from "@/components/sign-out-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <Providers>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-stone-950/80 backdrop-blur-xl border-b border-stone-800/50 px-5 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between">
          <h1 className="text-lg font-black tracking-tight">OLYMPUS</h1>
          <SignOutButton />
        </header>

        {/* Main content */}
        <main className="flex-1 pb-24 px-4 max-w-lg mx-auto w-full">
          {children}
        </main>

        {/* Bottom nav */}
        <BottomNav />
      </div>
    </Providers>
  );
}
