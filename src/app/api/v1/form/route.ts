import { route } from "@/server/api";
import { FORM_CUE_TITLES } from "@/components/form-cues/cue-ids";

/** The 3D form cues there are. */
export const GET = route(async () => ({
  cues: Object.entries(FORM_CUE_TITLES).map(([id, v]) => ({ id, ...v })),
}));
