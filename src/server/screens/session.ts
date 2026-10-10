import "server-only";
import { formatDayShort } from "@/lib/dates";
import { renderSessionMarkdown, type SessionCatch, type SetLogEntry } from "@/domain";
import { exercisePicker, getSessionView, sessionExport } from "@/server/sessions";

/** The live session plus what the add/swap picker offers. Shared by the web page and the API. */
export async function liveSessionScreen(userId: string, id: string) {
  const [view, swap] = await Promise.all([getSessionView(userId, id), exercisePicker(userId, id)]);
  return { view, swap };
}

/** The finish / summary screen for a session, live or done. */
export async function finishScreen(userId: string, id: string) {
  const view = await getSessionView(userId, id);
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
  const floor = view.targets.proteinG;
  if (protein != null && floor != null && protein < floor) {
    catches.push({
      kind: "recovery",
      text: `Protein ${protein} of ${floor} g, still ${floor - protein} g short of the floor.`,
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

  return {
    sessionId: view.id,
    status: view.status,
    sentAt: view.sentAt,
    eyebrow: `${formatDayShort(view.date)}, ${label}`,
    label,
    sessionType: view.sessionType,
    startedAt: view.startedAt,
    durationSec,
    workingSets: working.length,
    avgRpe,
    catches,
    initialNotes: view.notes ?? "",
    fileName: exp.fileName,
    exportSession: exp.export,
    /** The Lift Log entry with the saved notes. */
    markdown: renderSessionMarkdown(exp.export),
  };
}

export type LiveSessionScreen = Awaited<ReturnType<typeof liveSessionScreen>>;
export type FinishScreenData = Awaited<ReturnType<typeof finishScreen>>;
