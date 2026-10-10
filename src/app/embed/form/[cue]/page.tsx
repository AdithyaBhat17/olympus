import { notFound } from "next/navigation";
import { FORM_CUE_TITLES, isFormCueId } from "@/components/form-cues/cue-ids";
import FormViewer from "@/components/form-cues/form-viewer-lazy";

/**
 * The 3D form viewer for the iOS app's web view. Public: it shows no user
 * data, only the title and eyebrow the app passes (from GET /api/v1/form/:cue).
 */
export default async function EmbeddedFormCue({
  params,
  searchParams,
}: {
  params: Promise<{ cue: string }>;
  searchParams: Promise<{ title?: string; eyebrow?: string }>;
}) {
  const [{ cue }, sp] = await Promise.all([params, searchParams]);
  if (!isFormCueId(cue)) notFound();
  const title = (sp.title ?? FORM_CUE_TITLES[cue].title).slice(0, 80);
  const eyebrow = (sp.eyebrow ?? "3D form").slice(0, 120);
  return <FormViewer cue={cue} title={title} eyebrow={eyebrow} embedded />;
}
