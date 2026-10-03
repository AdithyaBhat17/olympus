import { PageSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return <PageSkeleton title="Progress" cards={[48, 260, 260]} />;
}
