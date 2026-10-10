import { requireUserEmail } from "@/lib/auth";
import { manualLogOptions } from "@/server/manual-log";
import SessionForm from "@/components/session-form";
import type { Exercise } from "@/lib/types";

export const metadata = { title: "Log a session" };

export default async function LogPage() {
  const { exercises, recentSessionNames } = await manualLogOptions(await requireUserEmail());
  return <SessionForm exercises={exercises as Exercise[]} recentSessionNames={recentSessionNames} />;
}
