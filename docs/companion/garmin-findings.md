# Garmin: what the Instinct 2 + Cirqa actually provide

From the discovery run on 2026-11-03 over the previous 30 days
(full field tables: [garmin-discovery.md](garmin-discovery.md)). The watch was
worn on 8 of those 30 nights, so fill rates are per night worn.

## Available, and what we'll use it for

| Metric | Source endpoint | Coverage | Use |
|---|---|---|---|
| **Overnight HRV** (`lastNightAvg`, 5-min high, 7-day avg, Garmin's own balanced band and status) | `hrv.daily` (one call per 30 days) | Every night worn | Recovery z-score input. RMSSD-based. Garmin's band is shown for comparison only; our baseline is computed by us |
| 5-min HRV readings through the night | `hrv.day` | Every night worn | Optional; not needed for v1 |
| **Resting HR** | `summary.v2` `heartRate.restingValue` | Every day worn | Recovery input, long-term RHR trend (thyroid context) |
| **Sleep**: total, deep / light / REM / awake, awakenings, start/end (GMT + local) | `sleep.summaries` | Every night worn | Sleep duration, consistency, sleep debt, check-in `sleepDetail` |
| **Sleep need** (baseline, actual, HRV / history / nap adjustments, recommended bedtime window) | `sleep.summaries` `sleepNeed` | 3 recent nights; still calibrating | Input to our sleep-need model; recommended bedtime shown as-is |
| Respiration during sleep (avg / low / high) | `sleep.summaries` | Every night worn | Shown with sleep; illness signal later |
| SpO2 during sleep | `sleep.summaries` | 6 of 8 nights | Shown with sleep. Depends on the watch's pulse-ox setting |
| Sleep stress (avg) | `sleep.summaries` | Every night worn | Recovery context |
| **Stress** (daily level, low / medium / high durations) | `summary.v2`, `stress.daily` | Every day worn | Energy bank, journal context |
| **Body Battery** (charged, drained, events, intraday values) | `summary.v2`, `bodybattery.daily` | Every day worn | Energy bank input, shown as Garmin's number |
| Jet lag block | `summary.v2` `jetLag` | Present | Travel mode |
| Steps, intensity minutes, calories | `summary.v2` | Every day worn | Activity context for adaptive TDEE. Garmin's burn is reference only |
| **Activities**: training effect (aerobic / anaerobic), training load, avg / max HR | `activity.list`, `activity.detail` | All 3 recorded | Strain, reconciliation with Olympus sessions |
| **FIT**: 1 Hz heart rate, laps, time in zone, session totals | `activity.file` | All 3 | Zone 2 time at 130–140, cardiac drift, strain (TRIMP), lift-day HR |

The FIT files were **not stripped**: training effect, anaerobic effect and peak training load are all present.

## Not available

- **Skin temperature.** No field anywhere. The illness/temperature signal is out of scope unless a future device adds it.
- **Sleep score.** `sleepScores` comes back empty, so the Instinct 2 doesn't score sleep. That's fine, because we compute our own sleep metrics.
- **Strength sets from the watch.** The gym session was recorded as *Fitness Equipment*, which has no set messages. Olympus stays the source for sets, reps and load. Garmin supplies the time window and HR for the session.
- **Body composition.** The only weight is the profile setting; there's no scale. BIA scans will be entered in Olympus (Phase 6).
- **Garmin nutrition.** Endpoint works, but nothing is logged there. Unused.

## API behaviour learned

- Token endpoint: no `Accept` header (it answers 406 to `application/json`). The body is the bare JWT; lifetime comes from its `exp` (24 h).
- `stress.daily` and `steps.daily` reject a 30-day window and accept 28. Others accepted 30. The sync uses 28-day windows everywhere.
- `hrv.day` returns 204 on nights without data.
- Latency is ~0.3–1 s per call. 30 days of everything took ~3 min at 500 ms spacing.
