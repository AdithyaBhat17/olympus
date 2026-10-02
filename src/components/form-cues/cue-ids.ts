/** Form-cue screens that exist under /form/[cue]. Matches exercises.form_cue_id. */
export const FORM_CUE_IDS: readonly string[] = ["deadlift", "squat", "pushdown"];

export type FormCueId = "deadlift" | "squat" | "pushdown";

export function isFormCueId(v: string | null | undefined): v is FormCueId {
  return v != null && FORM_CUE_IDS.includes(v);
}

export const FORM_CUE_TITLES: Record<FormCueId, { title: string; blurb: string }> = {
  deadlift: { title: "Barbell Deadlift", blurb: "Setup, pull, lockout, lower. Bar path and spine line." },
  squat: { title: "Machine Squat", blurb: "2-0-1 tempo to the depth stop. Knee tracking check." },
  pushdown: { title: "Rope Pushdown", blurb: "Elbow fixed, wrists stacked, split at the bottom." },
};
