import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserEmail } from "@/lib/auth";
import { DomainError, startSession } from "@/server/sessions";
import { planFromLastSession } from "@/server/plans";

export const metadata = { title: "Starting…" };

const uuid = z.string().uuid();
const type = z.string().min(1).max(20);

/**
 * Start (or resume) a live session and land on it. Today navigates here the
 * instant Start is tapped, so the session skeleton (session/loading.tsx) shows
 * while the server creates the session — no waiting on the Today screen.
 * Idempotent: startSession resumes an existing live session for the plan.
 */
export default async function StartSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; type?: string }>;
}) {
  const { plan, type: sessionType } = await searchParams;
  const userId = await requireUserEmail();

  let id: string;
  try {
    if (plan) {
      id = await startSession(userId, uuid.parse(plan));
    } else if (sessionType) {
      const res = await planFromLastSession(userId, type.parse(sessionType));
      if (!res.planId) throw new DomainError(res.errors[0]?.message ?? "Couldn't build a plan");
      id = await startSession(userId, res.planId);
    } else {
      redirect("/today");
    }
  } catch (err) {
    if (!(err instanceof DomainError) && !(err instanceof z.ZodError)) throw err;
    const message = err instanceof DomainError ? err.message : "That session link isn't valid.";
    return (
      <div className="page-top px-3 flex flex-col gap-4">
        <section className="mt-6 p-5 rounded-[28px] bg-surface flex flex-col gap-4">
          <span className="eyebrow text-danger-text">Couldn&apos;t start</span>
          <h1 className="num text-[36px]">{message}</h1>
          <Link href="/today" className="btn-chalk">
            Back to Today
          </Link>
        </section>
      </div>
    );
  }
  redirect(`/session/${id}`);
}
