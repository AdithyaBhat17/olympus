import { redirect } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { getLiveSession } from "@/server/sessions";

/** /session → the live session if there is one, else Today. */
export default async function SessionIndexPage() {
  const userId = await requireUserEmail();
  const live = await getLiveSession(userId);
  redirect(live ? `/session/${live.id}` : "/today");
}
