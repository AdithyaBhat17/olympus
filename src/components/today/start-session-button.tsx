"use client";

import { useRouter } from "next/navigation";
import { startFromRotationAction, startSessionAction } from "@/lib/liftlog-actions";
import { PlayIcon } from "@/components/session/icons";
import { useAction } from "@/components/session/use-action";

type Props =
  | { kind: "plan"; planId: string; label: string }
  | { kind: "rotation"; sessionType: string; label: string };

/** Starts (or builds + starts) the live session, then opens it. */
export function StartSessionButton(props: Props) {
  const router = useRouter();
  const { run, busy } = useAction();

  const start = async () => {
    const res = await run(
      () =>
        props.kind === "plan"
          ? startSessionAction(props.planId)
          : startFromRotationAction(props.sessionType),
      { refresh: false }
    );
    if (res.ok) router.push(`/session/${res.data}`);
  };

  return (
    <button type="button" className="btn-primary" disabled={busy} onClick={() => void start()} aria-busy={busy}>
      <PlayIcon />
      {busy ? "Starting…" : props.label}
    </button>
  );
}
