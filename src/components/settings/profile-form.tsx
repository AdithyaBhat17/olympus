"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateProfileAction } from "@/app/(app)/settings/actions";
import { parseRotation } from "@/domain/rotation";

export interface ProfileFormValues {
  timezone: string;
  rotation: string[];
  minSleepMin: number;
  kcal: number | null;
  proteinG: number | null;
  waterMl: number | null;
}

/** "" → null (not tracked); otherwise a number, or NaN when it isn't one. */
function optionalNumber(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  return t === "" ? null : Number(t);
}

const field = "flex flex-col gap-1";
const label = "text-xs text-muted px-1";

/** Settings › Your training: timezone, rotation, sleep floor, nutrition targets. */
export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [timezone, setTimezone] = useState(initial.timezone);
  const [rotation, setRotation] = useState(initial.rotation.join(", "));
  const [sleepH, setSleepH] = useState(String(initial.minSleepMin / 60));
  const [kcal, setKcal] = useState(initial.kcal != null ? String(initial.kcal) : "");
  const [protein, setProtein] = useState(initial.proteinG != null ? String(initial.proteinG) : "");
  const [waterL, setWaterL] = useState(initial.waterMl != null ? String(initial.waterMl / 1000) : "");

  // Both read after mount: the server's zone and ICU list aren't the device's.
  const [allZones, setAllZones] = useState<string[]>([]);
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (typeof Intl.supportedValuesOf === "function") setAllZones(Intl.supportedValuesOf("timeZone"));
      setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* no Intl zone support */
    }
  }, []);
  const zones = useMemo(() => {
    const extra = [timezone, initial.timezone].filter((z) => !allZones.includes(z));
    return [...new Set(extra), ...allZones];
  }, [allZones, timezone, initial.timezone]);

  function submit() {
    const rot = parseRotation(rotation);
    if ("error" in rot) return toast.error(rot.error);
    const sleep = Number(sleepH.replace(",", "."));
    if (!Number.isFinite(sleep) || sleep < 3 || sleep > 12) return toast.error("Sleep floor: 3 to 12 hours");
    const k = optionalNumber(kcal);
    const p = optionalNumber(protein);
    const w = optionalNumber(waterL);
    if ([k, p, w].some((v) => v != null && (!Number.isFinite(v) || v < 0))) {
      return toast.error("Targets are numbers, or blank to not track them");
    }
    start(async () => {
      const res = await updateProfileAction({
        timezone,
        rotation: rot.rotation,
        minSleepMin: Math.round(sleep * 60),
        kcal: k == null ? null : Math.round(k),
        proteinG: p == null ? null : Math.round(p),
        // Anything above 20 is clearly millilitres.
        waterMl: w == null ? null : Math.round(w > 20 ? w : w * 1000),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRotation(rot.rotation.join(", "));
      toast.success("Saved");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="p-4 rounded-[20px] bg-surface flex flex-col gap-3"
    >
      <div className={field}>
        <label htmlFor={`${id}-tz`} className={label}>
          Timezone, decides when your day starts
        </label>
        <select id={`${id}-tz`} value={timezone} onChange={(e) => setTimezone(e.target.value)} className="select-base">
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        {deviceZone && deviceZone !== timezone && (
          <button type="button" onClick={() => setTimezone(deviceZone)} className="self-start min-h-11 px-1 text-sm text-accent">
            Use this device&apos;s, {deviceZone.replace(/_/g, " ")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={field}>
          <label htmlFor={`${id}-rot`} className={label}>
            Rotation
          </label>
          <input
            id={`${id}-rot`}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={rotation}
            onChange={(e) => setRotation(e.target.value)}
            placeholder="A, B, C"
            className="input-base num"
          />
        </div>
        <div className={field}>
          <label htmlFor={`${id}-sleep`} className={label}>
            Sleep floor (h)
          </label>
          <input
            id={`${id}-sleep`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={sleepH}
            onChange={(e) => setSleepH(e.target.value)}
            className="input-base num"
          />
        </div>
      </div>
      <p className="m-0 px-1 -mt-1 text-[13px] text-muted leading-snug">
        Session letters in the order you train them, up to six. Under the sleep floor, loads hold.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <div className={field}>
          <label htmlFor={`${id}-protein`} className={label}>
            Protein (g)
          </label>
          <input
            id={`${id}-protein`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            placeholder="—"
            className="input-base num"
          />
        </div>
        <div className={field}>
          <label htmlFor={`${id}-water`} className={label}>
            Water (L)
          </label>
          <input
            id={`${id}-water`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={waterL}
            onChange={(e) => setWaterL(e.target.value)}
            placeholder="—"
            className="input-base num"
          />
        </div>
        <div className={field}>
          <label htmlFor={`${id}-kcal`} className={label}>
            Calories
          </label>
          <input
            id={`${id}-kcal`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            placeholder="—"
            className="input-base num"
          />
        </div>
      </div>
      <p className="m-0 px-1 -mt-1 text-[13px] text-muted leading-snug">
        Leave a target blank if you don&apos;t track it. Protein is a floor.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-[14px] bg-accent text-accent-ink font-semibold text-sm disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
