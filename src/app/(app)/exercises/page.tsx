import { requireUserEmail } from "@/lib/auth";
import { libraryScreen } from "@/server/screens/library";
import { PageHeader } from "@/components/page-header";
import ExerciseList from "@/components/exercise-list";

export const metadata = { title: "Library" };

export default async function ExercisesPage() {
  const { eyebrow, exercises } = await libraryScreen(await requireUserEmail());
  return (
    <div className="flex flex-col">
      <PageHeader eyebrow={eyebrow} title="Library" />
      <ExerciseList exercises={exercises} />
    </div>
  );
}
