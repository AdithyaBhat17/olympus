/** Pure parsing of WHOOP v2 sleep records (no I/O — unit tested). */

export interface WhoopSleep {
  start: string;
  end: string;
  timezone_offset: string; // "-05:00"
  nap: boolean;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
    };
  };
}

/** The wake-up date in the sleep's own timezone: last night's sleep belongs to today. */
export function wakeDate(s: Pick<WhoopSleep, "end" | "timezone_offset">): string {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(s.timezone_offset ?? "+00:00");
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(new Date(s.end).getTime() + offsetMin * 60_000).toISOString().slice(0, 10);
}

/** Minutes actually asleep: in bed minus awake minus no-data. */
export function asleepMinutes(s: WhoopSleep): number | null {
  const st = s.score?.stage_summary;
  if (s.score_state !== "SCORED" || !st) return null;
  const ms = st.total_in_bed_time_milli - st.total_awake_time_milli - st.total_no_data_time_milli;
  return Math.max(0, Math.round(ms / 60_000));
}

/** Main sleep per wake-up date: the longest scored non-nap. */
export function mainSleepByDate(records: WhoopSleep[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const r of records) {
    if (r.nap) continue;
    const min = asleepMinutes(r);
    if (min == null) continue;
    const d = wakeDate(r);
    byDate.set(d, Math.max(byDate.get(d) ?? 0, min));
  }
  return byDate;
}
