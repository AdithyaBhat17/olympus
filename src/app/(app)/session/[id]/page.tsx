import { notFound, redirect } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { exerciseIndex, getSessionView, type SessionView } from "@/server/sessions";
import { describeExercise, getConstraints } from "@/server/exercises";
import { workingWeights } from "@/server/history";
import { LiveSession } from "@/components/session/live-session";
import type { SwapCandidate } from "@/components/session/swap-sheet";

export const metadata = { title: "Live session" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const userId = await requireUserEmail();

  let view: SessionView;
  try {
    view = await getSessionView(userId, id);
  } catch {
    notFound();
  }
  if (view.status === "DONE") redirect(`/session/${id}/finish`);

  const [{ domain: all }, cons] = await Promise.all([exerciseIndex(userId), getConstraints(userId)]);
  const weights = await workingWeights(userId, all, { excludeSessionId: id });
  const candidates: SwapCandidate[] = all.map((e) => ({
    ...describeExercise(e, all, cons),
    lastKg: weights.get(e.id)?.kg ?? null,
    isCompound: e.isCompound,
    bodyRegion: e.bodyRegion,
    formCueId: e.formCueId,
    equipment: e.equipment ?? null,
  }));
  const constraintRegions = Array.from(new Set(cons.map((c) => c.region)));

  return <LiveSession view={view} swap={{ candidates, constraintRegions }} />;
}
