import { requireUserEmail } from "@/lib/auth";
import { progressScreen } from "@/server/screens/progress";
import ProgressList from "@/components/progress/progress-list";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Progress" };

export default async function ProgressPage() {
  const { eyebrow, rows } = await progressScreen(await requireUserEmail());
  return (
    <div className="flex flex-col">
      <PageHeader eyebrow={eyebrow} title="Progress" />
      <ProgressList rows={rows} />
    </div>
  );
}
