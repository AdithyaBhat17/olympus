import { notFound, redirect } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { liveSessionScreen } from "@/server/screens/session";
import { LiveSession } from "@/components/session/live-session";

export const metadata = { title: "Live session" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const userId = await requireUserEmail();

  const screen = await liveSessionScreen(userId, id).catch(() => null);
  if (!screen) notFound();
  if (screen.view.status === "DONE") redirect(`/session/${id}/finish`);

  return <LiveSession view={screen.view} swap={screen.swap} />;
}
