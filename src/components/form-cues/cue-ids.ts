/** Form-cue screens that exist under /form/[cue]. Matches exercises.form_cue_id. */
export const FORM_CUE_IDS: readonly string[] = ["deadlift", "lat-pulldown", "squat", "pushdown"];

export type FormCueId = "deadlift" | "lat-pulldown" | "squat" | "pushdown";

export function isFormCueId(v: string | null | undefined): v is FormCueId {
  return v != null && FORM_CUE_IDS.includes(v);
}

export const FORM_CUE_TITLES: Record<FormCueId, { title: string; blurb: string }> = {
  deadlift: { title: "Barbell Deadlift", blurb: "Bar path over mid-foot. Legs drive, then hips." },
  "lat-pulldown": { title: "Lat Pulldown (wide)", blurb: "Elbows to hips, bar to upper chest, 2 s return." },
  squat: { title: "Machine Squat", blurb: "Knees on the toe line, down to the depth stop." },
  pushdown: { title: "Rope Pushdown", blurb: "Elbow pinned, rope splits, 3 s eccentric." },
};
