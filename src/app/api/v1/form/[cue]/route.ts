import { NotFound, route } from "@/server/api";
import { publicOrigin } from "@/server/oauth";
import { formCueScreen } from "@/server/screens/form-cue";
import { isFormCueId } from "@/components/form-cues/cue-ids";

/**
 * A cue's personalised title and eyebrow, plus the page the app shows in a
 * web view (the 3D viewer is the web's; it takes no user data).
 */
export const GET = route<{ cue: string }>(async ({ req, userId, params }) => {
  if (!isFormCueId(params.cue)) throw new NotFound("No such form cue");
  const ex = new URL(req.url).searchParams.get("ex");
  const screen = await formCueScreen(userId, params.cue, ex);
  const u = new URL(`${publicOrigin(req)}/embed/form/${screen.cue}`);
  u.searchParams.set("title", screen.title);
  u.searchParams.set("eyebrow", screen.eyebrow);
  return { ...screen, embedUrl: u.toString() };
});
