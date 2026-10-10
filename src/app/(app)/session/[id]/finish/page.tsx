import { notFound } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { DomainError } from "@/server/sessions";
import { finishScreen, type FinishScreenData } from "@/server/screens/session";
import FinishScreen from "@/components/finish/finish-screen";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Finish session" };

export default async function FinishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const userId = await requireUserEmail();

  let screen: FinishScreenData;
  try {
    screen = await finishScreen(userId, id);
  } catch (err) {
    if (err instanceof DomainError) notFound();
    throw err;
  }
  // The web re-renders the markdown live from exportSession as notes change.
  const { markdown: _markdown, ...props } = screen;
  return <FinishScreen {...props} />;
}
