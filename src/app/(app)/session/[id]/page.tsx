import { notFound, redirect } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { exercisePicker, getSessionView } from "@/server/sessions";
import { LiveSession } from "@/components/session/live-session";

export const metadata = { title: "Live session" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const userId = await requireUserEmail();

  const [view, picker] = await Promise.all([
    getSessionView(userId, id).catch(() => null),
    exercisePicker(userId, id),
  ]);
  if (!view) notFound();
  if (view.status === "DONE") redirect(`/session/${id}/finish`);

  return <LiveSession view={view} swap={picker} />;
}
