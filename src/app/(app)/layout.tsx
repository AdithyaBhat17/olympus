import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Providers } from "@/components/providers";
import BottomNav from "@/components/bottom-nav";

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
      <div className="min-h-screen flex flex-col bg-bg">
        <main className="flex-1 w-full max-w-lg mx-auto">{children}</main>
        <BottomNav />
      </div>
    </Providers>
  );
}
