import { notFound } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { formCueScreen } from "@/server/screens/form-cue";
import { FORM_CUE_TITLES, isFormCueId } from "@/components/form-cues/cue-ids";
import FormViewer from "@/components/form-cues/form-viewer-lazy";

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
  const screen = await formCueScreen(await requireUserEmail(), cue, typeof sp.ex === "string" ? sp.ex : null);
  return <FormViewer cue={screen.cue} title={screen.title} eyebrow={screen.eyebrow} />;
}
