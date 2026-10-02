import { notFound } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { getConstraints, listExerciseRows, toDomainExercise } from "@/server/exercises";
import { exerciseHistory, workingWeights } from "@/server/history";
import { formatKg, topSet, type LoadMode } from "@/domain";
import { FORM_CUE_TITLES, isFormCueId } from "@/components/form-cues/cue-ids";
import FormDeadlift from "@/components/form-cues/form-deadlift";
import FormSquat from "@/components/form-cues/form-squat";
import FormPushdown from "@/components/form-cues/form-pushdown";

function loadText(mode: LoadMode, kg: number): string {
  if (mode === "PER_SIDE") return `${formatKg(kg)} kg/side`;
  if (mode === "COUNTERWEIGHT") return `${formatKg(kg)} kg cw`;
  return `${formatKg(kg)} kg`;
}

function sessionLabel(t: string | null | undefined): string | null {
  if (!t) return null;
  return /^[A-Z0-9]{1,2}$/.test(t) ? `Session ${t}` : null;
}

export async function generateMetadata({ params }: { params: Promise<{ cue: string }> }) {
  const { cue } = await params;
  return { title: isFormCueId(cue) ? `${FORM_CUE_TITLES[cue].title} form` : "Form cues" };
}

export default async function FormCuePage({
  params,
  searchParams,
}: {
  params: Promise<{ cue: string }>;
  searchParams: Promise<{ ex?: string | string[] }>;
}) {
  const [{ cue }, sp] = await Promise.all([params, searchParams]);
  if (!isFormCueId(cue)) notFound();
  const userId = await requireUserEmail();

  // The exercise this cue belongs to: ?ex= when linked from a lift, else the
  // linked exercise trained most recently.
  const [rows, constraints] = await Promise.all([listExerciseRows(userId), getConstraints(userId)]);
  const candidates = rows.filter((r) => r.formCueId === cue).map(toDomainExercise);
  const ww = candidates.length
    ? await workingWeights(userId, candidates, { exerciseIds: candidates.map((c) => c.id) })
    : new Map<string, { kg: number; date: string; source: "log" | "override" }>();
  const wanted = typeof sp.ex === "string" ? sp.ex : null;
  const ex =
    candidates.find((c) => c.id === wanted) ??
    [...candidates].sort((a, b) => (ww.get(b.id)?.date ?? "").localeCompare(ww.get(a.id)?.date ?? ""))[0] ??
    null;

  const history = ex ? await exerciseHistory(userId, ex.id, 12) : [];
  const current = ex ? ww.get(ex.id) ?? null : null;

  const title = ex?.name ?? FORM_CUE_TITLES[cue].title;
  const focus = (needle: string) => {
    const c = constraints.find((k) => k.region.toLowerCase().includes(needle));
    return c ? { label: c.region.split(" · ")[0], constraint: c } : null;
  };
  const subtitleFor = (region: string | null) =>
    ["Form cues", sessionLabel(history[0]?.sessionType), region].filter(Boolean).join(" · ");

  if (cue === "deadlift") {
    let load: string | null = null;
    if (ex && current) {
      const top = history[0] ? topSet(ex.loadMode, history[0].sets) : null;
      load =
        top && top.weight === current.kg
          ? `${loadText(ex.loadMode, current.kg)} × ${top.reps}`
          : loadText(ex.loadMode, current.kg);
    }
    return <FormDeadlift title={title} subtitle={subtitleFor(null)} load={load} />;
  }

  if (cue === "squat") {
    const knee = focus("knee");
    let upFrom: string | null = null;
    if (ex && current && history.length >= 2) {
      const first = topSet(ex.loadMode, history[history.length - 1].sets);
      if (first && first.weight < current.kg) upFrom = `up from ${formatKg(first.weight)}`;
    }
    return (
      <FormSquat
        title={title}
        subtitle={subtitleFor(knee?.label ?? null)}
        load={ex && current ? loadText(ex.loadMode, current.kg) : null}
        upFrom={upFrom}
      />
    );
  }

  const wrist = focus("wrist");
  const prohibited = (wrist?.constraint.blockedPatterns ?? [])
    .filter((p) => /pushdown/i.test(p))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  return (
    <FormPushdown
      title={title}
      subtitle={subtitleFor(wrist?.label ?? null)}
      prohibited={prohibited}
      region={wrist ? "wrist" : null}
    />
  );
}
