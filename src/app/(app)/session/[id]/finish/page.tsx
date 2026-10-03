import { notFound } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { formatDayShort } from "@/lib/dates";
import { DomainError, getSessionView, sessionExport } from "@/server/sessions";
import { TARGETS, type SessionCatch, type SetLogEntry } from "@/domain";
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

  let view: Awaited<ReturnType<typeof getSessionView>>;
  try {
    view = await getSessionView(userId, id);
  } catch (err) {
    if (err instanceof DomainError) notFound();
    throw err;
  }
  const exp = sessionExport(view);

  const logged = view.items.flatMap((i) =>
    i.sets.map((s) => s.logged).filter((s): s is SetLogEntry => !!s)
  );
  const working = logged.filter((s) => s.type !== "warmup");
  const rpes = working.map((s) => s.rpe).filter((r): r is number => r != null);
  const avgRpe = rpes.length
    ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10
    : null;

  const catches: SessionCatch[] = [...exp.catches];
  const protein = view.checkIn?.proteinG;
  if (protein != null && protein < TARGETS.proteinG) {
    catches.push({
      kind: "recovery",
      text: `Protein ${protein}/${TARGETS.proteinG} g — still ${TARGETS.proteinG - protein} g short of the floor.`,
    });
  }

  const durationSec =
    view.startedAt && view.finishedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(view.finishedAt).getTime() - new Date(view.startedAt).getTime()) / 1000
          )
        )
      : null;

  const label = view.sessionType ? `Session ${view.sessionType}` : view.title;

  return (
    <FinishScreen
      sessionId={view.id}
      status={view.status}
      sentAt={view.sentAt}
      eyebrow={`${formatDayShort(view.date)} · ${label}`}
      label={label}
      startedAt={view.startedAt}
      durationSec={durationSec}
      workingSets={working.length}
      avgRpe={avgRpe}
      catches={catches}
      initialNotes={view.notes ?? ""}
      fileName={exp.fileName}
      exportSession={exp.export}
    />
  );
}
