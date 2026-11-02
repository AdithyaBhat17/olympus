# Garmin Personal API: discovery report

Generated 2026-11-02T20:50:39.500Z for 2026-10-05 → 2026-11-03 (Asia/Dubai) by `scripts/garmin/discover.ts`.
Field names and fill rates only; no values. Raw responses are in `.garmin-discovery/raw/` on the machine that ran it (gitignored).

Token response fields: (bare JWT), exp. Valid for ~24 h.

## Key questions

Fields whose name matches each question, with the share of samples where they were filled. Read with the endpoint tables below.

- **Overnight HRV:** `hrv.daily` hrvSummaries[].lastNight5MinHigh (100%); `hrv.daily` hrvSummaries[].lastNightAvg (100%); `hrv.daily` hrvSummaries[].weeklyAvg (100%); `hrv.day` hrvReadings[].hrvValue (73%); `hrv.day` hrvSummary.lastNight5MinHigh (73%); `hrv.day` hrvSummary.lastNightAvg (73%); `hrv.day` hrvSummary.weeklyAvg (73%)
- **Resting HR:** `hr.zones` restingHeartRateUsed (0%); `hr.zones` restingHrAutoUpdateUsed (100%); `summary.v2` data[].calories.burnedResting (100%); `summary.v2` data[].heartRate.restingValue (100%); `hr.day` lastSevenDaysAvgRestingHeartRate (40%); `hr.day` restingHeartRate (43%); `summary.day` lastSevenDaysAvgRestingHeartRate (40%); `summary.day` restingHeartRate (40%)
- **Sleep stages:** `sleep.summaries` awakeCount (89%); `sleep.summaries` awakeSleepSeconds (89%); `sleep.summaries` deepSleepSeconds (89%); `sleep.summaries` deviceRemCapable (100%); `sleep.summaries` lightSleepSeconds (89%); `sleep.summaries` remSleepSeconds (89%); `sleep.day` awakeCount (27%); `sleep.day` awakeSleepSeconds (27%); `sleep.day` deepSleepSeconds (27%); `sleep.day` deviceRemCapable (100%); `sleep.day` lightSleepSeconds (27%); `sleep.day` remSleepSeconds (27%)
- **Sleep score / need:** `sleep.summaries` sleepAlignment.sleepNeedBaselineMins (0%); `sleep.summaries` sleepScoreFeedback (89%); `sleep.summaries` sleepScoreInsight (89%); `sleep.summaries` sleepScorePersonalizedInsight (89%); `sleep.day` sleepAlignment.sleepNeedBaselineMins (0%); `sleep.day` sleepScoreFeedback (27%); `sleep.day` sleepScoreInsight (27%); `sleep.day` sleepScorePersonalizedInsight (27%)
- **Sleep timing:** `sleep.summaries` autoSleepEndTimestampGMT (0%); `sleep.summaries` autoSleepStartTimestampGMT (0%); `sleep.summaries` awakeCount (89%); `sleep.summaries` awakeSleepSeconds (89%); `sleep.summaries` calendarDate (89%); `sleep.summaries` dailyNapDTOS[].calendarDate (11%); `sleep.summaries` dailyNapDTOS[].napEndTimeOffset (11%); `sleep.summaries` dailyNapDTOS[].napEndTimestampGMT (11%); `sleep.summaries` dailyNapDTOS[].napStartTimeOffset (11%); `sleep.summaries` dailyNapDTOS[].napStartTimestampGMT (11%); `sleep.summaries` nextSleepNeed.calendarDate (33%); `sleep.summaries` nextSleepNeed.recommendedBedtimeEndMins (33%); +69 more
- **Skin temperature:** _no matching fields_
- **Respiration:** `sleep.summaries` averageRespirationValue (89%); `sleep.summaries` breathingDisruptionSeverity (0%); `sleep.summaries` highestRespirationValue (89%); `sleep.summaries` lowestRespirationValue (89%); `sleep.day` averageRespirationValue (27%); `sleep.day` highestRespirationValue (27%); `sleep.day` lowestRespirationValue (27%); `summary.day` avgWakingRespirationValue (43%); `summary.day` highestRespirationValue (43%); `summary.day` latestRespirationTimeGMT (43%); `summary.day` latestRespirationValue (43%); `summary.day` lowestRespirationValue (43%); +1 more
- **SpO2 / pulse ox:** `sleep.summaries` averageSpO2HRSleep (11%); `sleep.summaries` averageSpO2Value (67%); `sleep.summaries` highestSpO2Value (67%); `sleep.summaries` lowestSpO2Value (67%); `sleep.summaries` spo2Threshold (0%); `sleep.day` averageSpO2HRSleep (3%); `sleep.day` averageSpO2Value (20%); `sleep.day` highestSpO2Value (20%); `sleep.day` lowestSpO2Value (20%); `sleep.day` spo2Threshold (0%); `summary.day` averageSpo2 (37%); `summary.day` latestSpo2 (37%); +17 more
- **Stress:** `summary.v2` data[].stress.highStressDurationInMillis (100%); `summary.v2` data[].stress.highStressProportion (100%); `summary.v2` data[].stress.lowStressDurationInMillis (100%); `summary.v2` data[].stress.lowStressProportion (100%); `summary.v2` data[].stress.mediumStressDurationInMillis (100%); `summary.v2` data[].stress.mediumStressProportion (100%); `stress.daily` values.highStressDuration (45%); `stress.daily` values.lowStressDuration (41%); `stress.daily` values.mediumStressDuration (45%); `stress.daily` values.overallStressLevel (100%); `stress.daily` values.restStressDuration (38%); `summary.day` activityStressDuration (43%); +17 more
- **Body Battery:** `summary.v2` data[].bodyBattery.activityEvents[].bodyBatteryImpact (100%); `summary.v2` data[].bodyBattery.chargedValue (100%); `summary.v2` data[].bodyBattery.drainedValue (100%); `summary.v2` data[].bodyBattery.dynamicFeedbackEvent.bodyBatteryLevel (100%); `summary.v2` data[].bodyBattery.endOfDayDynamicFeedbackEvent.bodyBatteryLevel (100%); `bodybattery.daily` bodyBatteryActivityEvent[].bodyBatteryImpact (7%); `bodybattery.daily` bodyBatteryDynamicFeedbackEvent.bodyBatteryLevel (10%); `bodybattery.daily` bodyBatteryValueDescriptorDTOList[].bodyBatteryValueDescriptorIndex (97%); `bodybattery.daily` bodyBatteryValueDescriptorDTOList[].bodyBatteryValueDescriptorKey (97%); `bodybattery.daily` bodyBatteryValuesArray[][] (100%); `bodybattery.daily` charged (43%); `bodybattery.daily` drained (43%); +14 more
- **Jet lag:** `profile.settings` timeZone (100%); `bodybattery.daily` bodyBatteryActivityEvent[].timezoneOffset (7%); `summary.day` bodyBatteryActivityEventList[].timezoneOffset (7%); `activity.detail` timeZoneUnitDTO.timeZone (100%)
- **Weight / body comp:** `weight.range` dailyWeightSummaries[].allWeightMetrics[].bmi (0%); `weight.range` dailyWeightSummaries[].allWeightMetrics[].bodyFat (0%); `weight.range` dailyWeightSummaries[].allWeightMetrics[].muscleMass (0%); `weight.range` dailyWeightSummaries[].allWeightMetrics[].visceralFat (0%); `weight.range` dailyWeightSummaries[].allWeightMetrics[].weight (100%); `weight.range` dailyWeightSummaries[].allWeightMetrics[].weightDelta (100%); `weight.range` dailyWeightSummaries[].latestWeight.bmi (0%); `weight.range` dailyWeightSummaries[].latestWeight.bodyFat (0%); `weight.range` dailyWeightSummaries[].latestWeight.muscleMass (0%); `weight.range` dailyWeightSummaries[].latestWeight.visceralFat (0%); `weight.range` dailyWeightSummaries[].latestWeight.weight (100%); `weight.range` dailyWeightSummaries[].latestWeight.weightDelta (0%); +16 more
- **Training effect / VO2 / load on activities:** `activity.list` activityTrainingLoad (100%); `activity.list` aerobicTrainingEffect (100%); `activity.list` aerobicTrainingEffectMessage (100%); `activity.list` anaerobicTrainingEffect (100%); `activity.list` anaerobicTrainingEffectMessage (100%); `activity.list` trainingEffectLabel (100%); `activity.detail` metadataDTO.uploadedDate (100%); `activity.detail` summaryDTO.activityTrainingLoad (100%); `activity.detail` summaryDTO.aerobicTrainingEffectMessage (100%); `activity.detail` summaryDTO.anaerobicTrainingEffect (100%); `activity.detail` summaryDTO.anaerobicTrainingEffectMessage (100%); `activity.detail` summaryDTO.trainingEffect (100%); +1 more
- **HR zones on activities:** `hr.zones` zone1Floor (100%); `hr.zones` zone2Floor (100%); `hr.zones` zone3Floor (100%); `hr.zones` zone4Floor (100%); `hr.zones` zone5Floor (100%); `activity.detail` timeZoneUnitDTO.timeZone (100%)
- **Strength sets in activity JSON:** _no matching fields_

## FIT files

| Activity type | Sport / sub-sport | HR samples | Median HR interval | Sets (active / reps / weight / exercise) | Messages | Errors |
|---|---|---|---|---|---|---|
| walking | training / ? | 660 | 1 s | 0 / 0 / 0 / 0 | fileId 1, fileCreator 1, activity 1, session 1, timeInZone 2, lap 1, timestampCorrelation 1, event 2, deviceInfo 7, deviceSettings 1, userProfile 1, sport 1, trainingSettings 1, zonesTarget 1, record 660 |  |
| stop_watch | training / ? | 27 | 1 s | 0 / 0 / 0 / 0 | fileId 1, fileCreator 1, activity 1, session 1, timeInZone 2, lap 1, timestampCorrelation 1, event 2, deviceInfo 8, deviceSettings 1, userProfile 1, sport 1, trainingSettings 1, zonesTarget 1, record 27 |  |
| fitness_equipment | training / ? | 3973 | 1 s | 0 / 0 / 0 / 0 | fileId 1, fileCreator 1, activity 1, session 1, timeInZone 2, lap 1, timestampCorrelation 2, event 3, deviceInfo 7, deviceSettings 1, userProfile 1, sport 1, trainingSettings 1, zonesTarget 1, record 3973 |  |

Session fields present in any FIT: avgHeartRate, endPositionLat, endPositionLong, enhancedAvgAltitude, enhancedAvgSpeed, enhancedMaxAltitude, enhancedMaxSpeed, enhancedMinAltitude, event, eventType, firstLapIndex, maxHeartRate, messageIndex, metabolicCalories, necLat, necLong, numLaps, sport, sportProfileName, startPositionLat, startPositionLong, startTime, subSport, swcLat, swcLong, timestamp, totalAnaerobicTrainingEffect, totalAscent, totalCalories, totalCycles, totalDescent, totalDistance, totalElapsedTime, totalTimerTime, totalTrainingEffect, trainingLoadPeak, trigger.
Checked for possibly-stripped session fields: all present.

## Endpoints

| Endpoint | Calls | OK | Empty | Statuses | p50 latency | Notes |
|---|---|---|---|---|---|---|
| `profile.settings` | 1 | 1 | 0 | 200×1 | 273 ms |  |
| `hr.zones` | 1 | 1 | 0 | 200×1 | 522 ms |  |
| `fitness.age` | 1 | 1 | 0 | 200×1 | 528 ms |  |
| `hrv.daily` | 1 | 1 | 0 | 200×1 | 410 ms | Accepted a 30-day window in one call. |
| `sleep.summaries` | 1 | 1 | 0 | 200×1 | 1046 ms | Accepted a 30-day window in one call. |
| `summary.v2` | 1 | 1 | 0 | 200×1 | 306 ms | Accepted a 30-day window in one call. |
| `stress.daily` | 3 | 2 | 0 | 200×2 400×1 | 505 ms | Rejected 30 days; accepted 28-day windows. 2026-10-05_2026-11-03: 400 {} |
| `bodybattery.daily` | 1 | 1 | 0 | 200×1 | 983 ms | Accepted a 30-day window in one call. |
| `steps.daily` | 3 | 2 | 0 | 200×2 400×1 | 725 ms | Rejected 30 days; accepted 28-day windows. 2026-10-05_2026-11-03: 400 {} |
| `hydration.daily` | 1 | 1 | 1 | 200×1 | 280 ms | Accepted a 30-day window in one call. |
| `weight.range` | 1 | 1 | 0 | 200×1 | 528 ms | Accepted a 30-day window in one call. |
| `weight.all` | 1 | 1 | 0 | 200×1 | 472 ms | Accepted a 30-day window in one call. |
| `weight.goal` | 1 | 1 | 1 | 200×1 | 502 ms | Accepted a 30-day window in one call. |
| `wellness.activity` | 1 | 1 | 1 | 200×1 | 496 ms | Accepted a 30-day window in one call. |
| `hrv.day` | 30 | 30 | 19 | 200×11 204×19 | 506 ms |  |
| `sleep.day` | 30 | 30 | 0 | 200×30 | 503 ms |  |
| `hr.day` | 30 | 30 | 0 | 200×30 | 499 ms |  |
| `summary.day` | 30 | 30 | 0 | 200×30 | 509 ms |  |
| `spo2.day` | 7 | 7 | 0 | 200×7 | 539 ms |  |
| `nutrition.day` | 7 | 7 | 0 | 200×7 | 507 ms |  |
| `activity.list` | 1 | 1 | 0 | 200×1 | 897 ms | 3 activities in 30 days. By type: walking 1, stop_watch 1, fitness_equipment 1. |
| `activity.detail` | 3 | 3 | 0 | 200×3 | 443 ms |  |
| `activity.workouts` | 3 | 3 | 3 | 200×3 | 505 ms |  |
| `activity.file` | 3 | 3 | 0 | 200×3 | 520 ms |  |

Not called: `/periodichealth-service/menstrualcycle/summary/{calendarDate}`, `/periodichealth-service/menstrualcycle/dayview/{calendarDate}` (women's health).

## Fields per endpoint

<details><summary><code>profile.settings</code>: /userprofile-service/userprofile/settings (1 samples, 42 fields)</summary>

_timezone, units, user max/resting HR, sleep window_

| Field | Filled | Type |
|---|---|---|
| availableTrainingDays | 0% | null |
| dateFormat.displayFormat | 100% | string |
| dateFormat.formatId | 100% | number |
| dateFormat.formatKey | 100% | string |
| dateFormat.groupingUsed | 100% | boolean |
| dateFormat.maxFraction | 100% | number |
| dateFormat.minFraction | 100% | number |
| displayName | 100% | string |
| firstDayOfWeek.dayId | 100% | number |
| firstDayOfWeek.dayName | 100% | string |
| firstDayOfWeek.isPossibleFirstDay | 100% | boolean |
| firstDayOfWeek.sortOrder | 100% | number |
| golfDistanceUnit | 100% | string |
| golfElevationUnit | 0% | null |
| golfSpeedUnit | 0% | null |
| heartRateFormat.displayFormat | 0% | null |
| heartRateFormat.formatId | 100% | number |
| heartRateFormat.formatKey | 100% | string |
| heartRateFormat.groupingUsed | 100% | boolean |
| heartRateFormat.maxFraction | 100% | number |
| heartRateFormat.minFraction | 100% | number |
| hydrationContainers[].name | 0% | null |
| hydrationContainers[].unit | 100% | string |
| hydrationContainers[].volume | 100% | number |
| hydrationMeasurementUnit | 100% | string |
| measurementSystem | 100% | string |
| numberFormat | 100% | string |
| powerFormat.displayFormat | 0% | null |
| powerFormat.formatId | 100% | number |
| powerFormat.formatKey | 100% | string |
| powerFormat.groupingUsed | 100% | boolean |
| powerFormat.maxFraction | 100% | number |
| powerFormat.minFraction | 100% | number |
| preferredLocale | 100% | string |
| preferredLongTrainingDays | 0% | null |
| timeFormat.displayFormat | 100% | string |
| timeFormat.formatId | 100% | number |
| timeFormat.formatKey | 100% | string |
| timeFormat.groupingUsed | 100% | boolean |
| timeFormat.maxFraction | 100% | number |
| timeFormat.minFraction | 100% | number |
| timeZone | 100% | string |

</details>

<details><summary><code>hr.zones</code>: /biometric-service/heartRateZones/v2 (1 samples, 11 fields)</summary>

_Garmin's zones (we use custom Zone 2 130-140)_

| Field | Filled | Type |
|---|---|---|
| lactateThresholdHeartRateUsed | 0% | null |
| maxHeartRateUsed | 100% | number |
| restingHeartRateUsed | 0% | null |
| restingHrAutoUpdateUsed | 100% | boolean |
| sport | 100% | string |
| trainingMethod | 100% | string |
| zone1Floor | 100% | number |
| zone2Floor | 100% | number |
| zone3Floor | 100% | number |
| zone4Floor | 100% | number |
| zone5Floor | 100% | number |

</details>

<details><summary><code>fitness.age</code>: /fitnessage-service/fitnessage/v2/{calendarDate} (1 samples, 26 fields)</summary>

_fitness age, VO2-ish components_

| Field | Filled | Type |
|---|---|---|
| achievableFitnessAge | 100% | number |
| chronologicalAge | 100% | number |
| components.bmi.improvementValue | 100% | number |
| components.bmi.lastMeasurementDate | 100% | string |
| components.bmi.potentialAge | 100% | number |
| components.bmi.priority | 100% | number |
| components.bmi.stale | 100% | boolean |
| components.bmi.targetValue | 100% | number |
| components.bmi.value | 100% | number |
| components.rhr.stale | 100% | boolean |
| components.rhr.value | 100% | number |
| components.vigorousDaysAvg.numOfWeeksForIm | 100% | number |
| components.vigorousDaysAvg.potentialAge | 100% | number |
| components.vigorousDaysAvg.priority | 100% | number |
| components.vigorousDaysAvg.stale | 100% | boolean |
| components.vigorousDaysAvg.targetValue | 100% | number |
| components.vigorousDaysAvg.value | 100% | number |
| components.vigorousMinutesAvg.numOfWeeksForIm | 100% | number |
| components.vigorousMinutesAvg.potentialAge | 100% | number |
| components.vigorousMinutesAvg.priority | 100% | number |
| components.vigorousMinutesAvg.stale | 100% | boolean |
| components.vigorousMinutesAvg.targetValue | 100% | number |
| components.vigorousMinutesAvg.value | 100% | number |
| fitnessAge | 100% | number |
| lastUpdated | 100% | string |
| previousFitnessAge | 100% | number |

</details>

<details><summary><code>hrv.daily</code>: /hrv-service/hrv/daily/{fromDate}/{toDate} (1 samples, 12 fields)</summary>

_overnight HRV + Garmin baseline: recovery score input_

| Field | Filled | Type |
|---|---|---|
| hrvSummaries[].baseline.balancedLow | 100% | number |
| hrvSummaries[].baseline.balancedUpper | 100% | number |
| hrvSummaries[].baseline.lowUpper | 100% | number |
| hrvSummaries[].baseline.markerValue | 100% | number |
| hrvSummaries[].calendarDate | 100% | string |
| hrvSummaries[].createTimeStamp | 100% | string |
| hrvSummaries[].feedbackPhrase | 100% | string |
| hrvSummaries[].lastNight5MinHigh | 100% | number |
| hrvSummaries[].lastNightAvg | 100% | number |
| hrvSummaries[].status | 100% | string |
| hrvSummaries[].weeklyAvg | 100% | number |
| userProfilePk | 100% | number |

</details>

<details><summary><code>sleep.summaries</code>: /sleep-service/sleep/dailySleepSummariesByDate (9 samples, 127 fields)</summary>

_sleep duration, stages, score, sleep need_

| Field | Filled | Type |
|---|---|---|
| ageGroup | 89% | string |
| autoSleepEndTimestampGMT | 0% | null |
| autoSleepStartTimestampGMT | 0% | null |
| averageRespirationValue | 89% | number |
| averageSpO2HRSleep | 11% | number |
| averageSpO2Value | 67% | number |
| avgHeartRate | 22% | number |
| avgSleepStress | 89% | number |
| awakeCount | 89% | number |
| awakeSleepSeconds | 89% | number |
| breathingDisruptionSeverity | 0% | null |
| calendarDate | 89% | string |
| dailyNapDTOS[].calendarDate | 11% | string |
| dailyNapDTOS[].createTimestampGMT | 0% | null |
| dailyNapDTOS[].deviceId | 11% | number |
| dailyNapDTOS[].napEndTimeOffset | 11% | number |
| dailyNapDTOS[].napEndTimestampGMT | 11% | string |
| dailyNapDTOS[].napFeedback | 11% | string |
| dailyNapDTOS[].napSource | 11% | number |
| dailyNapDTOS[].napStartTimeOffset | 11% | number |
| dailyNapDTOS[].napStartTimestampGMT | 11% | string |
| dailyNapDTOS[].napTimeSec | 11% | number |
| dailyNapDTOS[].updateTimestampGMT | 0% | null |
| dailyNapDTOS[].userProfilePK | 11% | number |
| deepSleepSeconds | 89% | number |
| deviceRemCapable | 100% | boolean |
| highestRespirationValue | 89% | number |
| highestSpO2Value | 67% | number |
| id | 89% | number |
| kidSleepNote | 0% | null |
| lightSleepSeconds | 89% | number |
| lowestRespirationValue | 89% | number |
| lowestSpO2Value | 67% | number |
| napTimeSeconds | 89% | number |
| nextSleepNeed.actual | 33% | number |
| nextSleepNeed.baseline | 33% | number |
| nextSleepNeed.calendarDate | 33% | string |
| nextSleepNeed.deviceId | 33% | number |
| nextSleepNeed.displayedForTheDay | 33% | boolean |
| nextSleepNeed.feedback | 33% | string |
| nextSleepNeed.hrvAdjustment | 33% | string |
| nextSleepNeed.napAdjustment | 33% | string |
| nextSleepNeed.preferredActivityTracker | 33% | boolean |
| nextSleepNeed.recommendedBedtimeEndMins | 33% | number |
| nextSleepNeed.recommendedBedtimeStartMins | 33% | number |
| nextSleepNeed.sleepHistoryAdjustment | 33% | string |
| nextSleepNeed.timestampGmt | 33% | string |
| nextSleepNeed.trainingFeedback | 33% | string |
| nextSleepNeed.userProfilePk | 33% | number |
| numberOfEventsBelowThreshold | 0% | null |
| remSleepSeconds | 89% | number |
| retro | 100% | boolean |
| sleepAlignment.calendarDate | 33% | string |
| sleepAlignment.deviceId | 33% | number |
| sleepAlignment.isPreferredActivityTracker | 33% | boolean |
| sleepAlignment.lastSleepMidpointMins | 33% | number |
| sleepAlignment.optimalSleepWindowEndMins | 0% | null |
| sleepAlignment.optimalSleepWindowMidpointMins | 0% | null |
| sleepAlignment.optimalSleepWindowStartMins | 0% | null |
| sleepAlignment.sleepNeedBaselineMins | 0% | null |
| sleepAlignment.status | 33% | string |
| sleepAlignment.userId | 33% | number |
| sleepEndTimestampGMT | 89% | number |
| sleepEndTimestampLocal | 89% | number |
| sleepFromDevice | 89% | boolean |
| sleepNeed.actual | 33% | number |
| sleepNeed.baseline | 33% | number |
| sleepNeed.calendarDate | 33% | string |
| sleepNeed.deviceId | 33% | number |
| sleepNeed.displayedForTheDay | 33% | boolean |
| sleepNeed.feedback | 33% | string |
| sleepNeed.hrvAdjustment | 33% | string |
| sleepNeed.napAdjustment | 33% | string |
| sleepNeed.preferredActivityTracker | 33% | boolean |
| sleepNeed.recommendedBedtimeEndMins | 33% | number |
| sleepNeed.recommendedBedtimeStartMins | 33% | number |
| sleepNeed.sleepHistoryAdjustment | 33% | string |
| sleepNeed.timestampGmt | 33% | string |
| sleepNeed.trainingFeedback | 33% | string |
| sleepNeed.userProfilePk | 33% | number |
| sleepQualityTypePK | 0% | null |
| sleepResultTypePK | 0% | null |
| sleepScoreFeedback | 89% | string |
| sleepScoreInsight | 89% | string |
| sleepScorePersonalizedInsight | 89% | string |
| sleepScores.awakeCount.optimalEnd | 89% | number |
| sleepScores.awakeCount.optimalStart | 89% | number |
| sleepScores.awakeCount.qualifierKey | 89% | string |
| sleepScores.deepPercentage.idealEndInSeconds | 89% | number |
| sleepScores.deepPercentage.idealStartInSeconds | 89% | number |
| sleepScores.deepPercentage.optimalEnd | 89% | number |
| sleepScores.deepPercentage.optimalStart | 89% | number |
| sleepScores.deepPercentage.qualifierKey | 89% | string |
| sleepScores.deepPercentage.value | 89% | number |
| sleepScores.lightPercentage.idealEndInSeconds | 89% | number |
| sleepScores.lightPercentage.idealStartInSeconds | 89% | number |
| sleepScores.lightPercentage.optimalEnd | 89% | number |
| sleepScores.lightPercentage.optimalStart | 89% | number |
| sleepScores.lightPercentage.qualifierKey | 89% | string |
| sleepScores.lightPercentage.value | 89% | number |
| sleepScores.overall.qualifierKey | 89% | string |
| sleepScores.overall.value | 89% | number |
| sleepScores.remPercentage.idealEndInSeconds | 89% | number |
| sleepScores.remPercentage.idealStartInSeconds | 89% | number |
| sleepScores.remPercentage.optimalEnd | 89% | number |
| sleepScores.remPercentage.optimalStart | 89% | number |
| sleepScores.remPercentage.qualifierKey | 89% | string |
| sleepScores.remPercentage.value | 89% | number |
| sleepScores.restlessness.optimalEnd | 89% | number |
| sleepScores.restlessness.optimalStart | 89% | number |
| sleepScores.restlessness.qualifierKey | 89% | string |
| sleepScores.stress.optimalEnd | 89% | number |
| sleepScores.stress.optimalStart | 89% | number |
| sleepScores.stress.qualifierKey | 89% | string |
| sleepScores.totalDuration.optimalEnd | 89% | number |
| sleepScores.totalDuration.optimalStart | 89% | number |
| sleepScores.totalDuration.qualifierKey | 89% | string |
| sleepStartTimestampGMT | 89% | number |
| sleepStartTimestampLocal | 89% | number |
| sleepTimeSeconds | 89% | number |
| sleepVersion | 89% | number |
| sleepWindowConfirmationType | 89% | string |
| sleepWindowConfirmed | 89% | boolean |
| spo2Threshold | 0% | null |
| unmeasurableSleepSeconds | 89% | number |
| userNote | 0% | null |
| userProfilePK | 89% | number |

</details>

<details><summary><code>summary.v2</code>: /usersummary-service/v2/dailysummaries (1 samples, 83 fields)</summary>

_RHR, stress, Body Battery, respiration, SpO2, jet lag_

| Field | Filled | Type |
|---|---|---|
| data[].bodyBattery.activityEvents[].bodyBatteryImpact | 100% | number |
| data[].bodyBattery.activityEvents[].deviceId | 100% | number |
| data[].bodyBattery.activityEvents[].durationInMillis | 100% | number |
| data[].bodyBattery.activityEvents[].eventStartTimeGmt | 100% | string |
| data[].bodyBattery.activityEvents[].eventStartTimeLocal | 100% | string |
| data[].bodyBattery.activityEvents[].eventType | 100% | string |
| data[].bodyBattery.activityEvents[].feedbackType | 100% | string |
| data[].bodyBattery.activityEvents[].shortFeedback | 100% | string |
| data[].bodyBattery.chargedValue | 100% | number |
| data[].bodyBattery.drainedValue | 100% | number |
| data[].bodyBattery.dynamicFeedbackEvent.bodyBatteryLevel | 100% | string |
| data[].bodyBattery.dynamicFeedbackEvent.eventTimestampGmt | 100% | string |
| data[].bodyBattery.dynamicFeedbackEvent.feedbackLongType | 100% | string |
| data[].bodyBattery.dynamicFeedbackEvent.feedbackShortType | 100% | string |
| data[].bodyBattery.endOfDayDynamicFeedbackEvent.bodyBatteryLevel | 100% | string |
| data[].bodyBattery.endOfDayDynamicFeedbackEvent.eventTimestampGmt | 100% | string |
| data[].bodyBattery.endOfDayDynamicFeedbackEvent.feedbackLongType | 100% | string |
| data[].bodyBattery.endOfDayDynamicFeedbackEvent.feedbackShortType | 100% | string |
| data[].bodyBattery.featureVersion | 100% | string |
| data[].bodyBattery.latestValue | 100% | number |
| data[].bodyBattery.maxValue | 100% | number |
| data[].bodyBattery.minValue | 100% | number |
| data[].calendarDate | 100% | string |
| data[].calories.burnedActive | 100% | number |
| data[].calories.burnedResting | 100% | number |
| data[].calories.burnedTotal | 100% | number |
| data[].calories.consumedGoal | 100% | number |
| data[].calories.consumedRemaining | 100% | number |
| data[].heartRate.maxValue | 100% | number |
| data[].heartRate.minValue | 100% | number |
| data[].heartRate.restingValue | 100% | number |
| data[].hydration.consumedInFractionalMl | 100% | number |
| data[].hydration.consumedInMl | 100% | number |
| data[].hydration.goalInFractionalMl | 100% | number |
| data[].hydration.goalInMl | 100% | number |
| data[].includesActivityData | 100% | boolean |
| data[].includesWellnessData | 100% | boolean |
| data[].intensityMinutes.goal | 100% | number |
| data[].intensityMinutes.moderate | 100% | number |
| data[].intensityMinutes.vigorous | 100% | number |
| data[].movement.floorsAscended.distanceInMeters | 100% | number |
| data[].movement.floorsAscended.goal | 100% | number |
| data[].movement.floorsAscended.value | 100% | number |
| data[].movement.floorsDescended.distanceInMeters | 100% | number |
| data[].movement.floorsDescended.value | 100% | number |
| data[].movement.steps.distanceInMeters | 100% | number |
| data[].movement.steps.goal | 100% | number |
| data[].movement.steps.value | 100% | number |
| data[].pulseOx.avgValue | 100% | number |
| data[].pulseOx.latestTimestampGmt | 100% | string |
| data[].pulseOx.latestTimestampLocal | 100% | string |
| data[].pulseOx.latestValue | 100% | number |
| data[].pulseOx.minValue | 100% | number |
| data[].respiration.algorithmVersion | 100% | number |
| data[].respiration.avgValue | 100% | number |
| data[].respiration.latestTimestampGmt | 100% | string |
| data[].respiration.latestValue | 100% | number |
| data[].respiration.maxValue | 100% | number |
| data[].respiration.minValue | 100% | number |
| data[].source | 100% | string |
| data[].stress.activityDurationInMillis | 100% | number |
| data[].stress.activityProportion | 100% | number |
| data[].stress.avgLevel | 100% | number |
| data[].stress.highStressDurationInMillis | 100% | number |
| data[].stress.highStressProportion | 100% | number |
| data[].stress.lowStressDurationInMillis | 100% | number |
| data[].stress.lowStressProportion | 100% | number |
| data[].stress.maxLevel | 100% | number |
| data[].stress.mediumStressDurationInMillis | 100% | number |
| data[].stress.mediumStressProportion | 100% | number |
| data[].stress.qualifier | 100% | string |
| data[].stress.restDurationInMillis | 100% | number |
| data[].stress.restProportion | 100% | number |
| data[].stress.totalDurationInMillis | 100% | number |
| data[].stress.uncategorizedDurationInMillis | 100% | number |
| data[].stress.uncategorizedProportion | 100% | number |
| data[].userProfilePk | 100% | number |
| data[].uuid | 100% | string |
| data[].wellnessChronology.endTimestampGmt | 100% | string |
| data[].wellnessChronology.endTimestampLocal | 100% | string |
| data[].wellnessChronology.startTimestampGmt | 100% | string |
| data[].wellnessChronology.startTimestampLocal | 100% | string |
| data[].wellnessChronology.totalDurationInMillis | 100% | number |

</details>

<details><summary><code>stress.daily</code>: /usersummary-service/stats/stress/daily/{startDate}/{endDate} (29 samples, 6 fields)</summary>

_daily stress: energy bank input_

| Field | Filled | Type |
|---|---|---|
| calendarDate | 100% | string |
| values.highStressDuration | 45% | number |
| values.lowStressDuration | 41% | number |
| values.mediumStressDuration | 45% | number |
| values.overallStressLevel | 100% | number |
| values.restStressDuration | 38% | number |

</details>

<details><summary><code>bodybattery.daily</code>: /wellness-service/wellness/bodyBattery/reports/daily (30 samples, 25 fields)</summary>

_Body Battery charged/drained_

| Field | Filled | Type |
|---|---|---|
| bodyBatteryActivityEvent[].bodyBatteryImpact | 7% | number |
| bodyBatteryActivityEvent[].durationInMilliseconds | 7% | number |
| bodyBatteryActivityEvent[].eventStartTimeGmt | 7% | string |
| bodyBatteryActivityEvent[].eventType | 7% | string |
| bodyBatteryActivityEvent[].feedbackType | 7% | string |
| bodyBatteryActivityEvent[].shortFeedback | 7% | string |
| bodyBatteryActivityEvent[].timezoneOffset | 7% | number |
| bodyBatteryDynamicFeedbackEvent.bodyBatteryLevel | 10% | string |
| bodyBatteryDynamicFeedbackEvent.eventTimestampGmt | 10% | string |
| bodyBatteryDynamicFeedbackEvent.feedbackLongType | 10% | string |
| bodyBatteryDynamicFeedbackEvent.feedbackShortType | 10% | string |
| bodyBatteryValueDescriptorDTOList[].bodyBatteryValueDescriptorIndex | 97% | number |
| bodyBatteryValueDescriptorDTOList[].bodyBatteryValueDescriptorKey | 97% | string |
| bodyBatteryValuesArray[][] | 100% | number |
| charged | 43% | number |
| date | 100% | string |
| drained | 43% | number |
| endOfDayBodyBatteryDynamicFeedbackEvent.bodyBatteryLevel | 7% | string |
| endOfDayBodyBatteryDynamicFeedbackEvent.eventTimestampGmt | 7% | string |
| endOfDayBodyBatteryDynamicFeedbackEvent.feedbackLongType | 7% | string |
| endOfDayBodyBatteryDynamicFeedbackEvent.feedbackShortType | 7% | string |
| endTimestampGMT | 97% | string |
| endTimestampLocal | 97% | string |
| startTimestampGMT | 97% | string |
| startTimestampLocal | 97% | string |

</details>

<details><summary><code>steps.daily</code>: /usersummary-service/stats/steps/daily/{startDate}/{endDate} (29 samples, 4 fields)</summary>

_steps (NEAT for adaptive TDEE)_

| Field | Filled | Type |
|---|---|---|
| calendarDate | 100% | string |
| stepGoal | 100% | number |
| totalDistance | 45% | number |
| totalSteps | 45% | number |

</details>

<details><summary><code>hydration.daily</code>: /usersummary-service/stats/hydration/daily/{startDate}/{endDate} (0 samples, 0 fields)</summary>

_hydration if logged in Connect_

_No data._

</details>

<details><summary><code>weight.range</code>: /weight-service/weight/range/{startDate}/{endDate} (1 samples, 47 fields)</summary>

_weigh-ins / body comp from an Index scale or manual_

| Field | Filled | Type |
|---|---|---|
| dailyWeightSummaries[].allWeightMetrics[].bmi | 0% | null |
| dailyWeightSummaries[].allWeightMetrics[].bodyFat | 0% | null |
| dailyWeightSummaries[].allWeightMetrics[].bodyWater | 0% | null |
| dailyWeightSummaries[].allWeightMetrics[].boneMass | 0% | null |
| dailyWeightSummaries[].allWeightMetrics[].calendarDate | 100% | string |
| dailyWeightSummaries[].allWeightMetrics[].date | 100% | number |
| dailyWeightSummaries[].allWeightMetrics[].metabolicAge | 0% | null |
| dailyWeightSummaries[].allWeightMetrics[].muscleMass | 0% | null |
| dailyWeightSummaries[].allWeightMetrics[].physiqueRating | 0% | null |
| dailyWeightSummaries[].allWeightMetrics[].samplePk | 100% | number |
| dailyWeightSummaries[].allWeightMetrics[].sourceType | 100% | string |
| dailyWeightSummaries[].allWeightMetrics[].timestampGMT | 100% | number |
| dailyWeightSummaries[].allWeightMetrics[].visceralFat | 0% | null |
| dailyWeightSummaries[].allWeightMetrics[].weight | 100% | number |
| dailyWeightSummaries[].allWeightMetrics[].weightDelta | 100% | number |
| dailyWeightSummaries[].latestWeight.bmi | 0% | null |
| dailyWeightSummaries[].latestWeight.bodyFat | 0% | null |
| dailyWeightSummaries[].latestWeight.bodyWater | 0% | null |
| dailyWeightSummaries[].latestWeight.boneMass | 0% | null |
| dailyWeightSummaries[].latestWeight.calendarDate | 100% | string |
| dailyWeightSummaries[].latestWeight.date | 100% | number |
| dailyWeightSummaries[].latestWeight.metabolicAge | 0% | null |
| dailyWeightSummaries[].latestWeight.muscleMass | 0% | null |
| dailyWeightSummaries[].latestWeight.physiqueRating | 0% | null |
| dailyWeightSummaries[].latestWeight.samplePk | 100% | number |
| dailyWeightSummaries[].latestWeight.sourceType | 100% | string |
| dailyWeightSummaries[].latestWeight.timestampGMT | 100% | number |
| dailyWeightSummaries[].latestWeight.visceralFat | 0% | null |
| dailyWeightSummaries[].latestWeight.weight | 100% | number |
| dailyWeightSummaries[].latestWeight.weightDelta | 0% | null |
| dailyWeightSummaries[].maxWeight | 100% | number |
| dailyWeightSummaries[].minWeight | 100% | number |
| dailyWeightSummaries[].numOfWeightEntries | 100% | number |
| dailyWeightSummaries[].summaryDate | 100% | string |
| nextDateWeight | 0% | null |
| previousDateWeight | 0% | null |
| totalAverage.bmi | 0% | null |
| totalAverage.bodyFat | 0% | null |
| totalAverage.bodyWater | 0% | null |
| totalAverage.boneMass | 0% | null |
| totalAverage.from | 100% | number |
| totalAverage.metabolicAge | 0% | null |
| totalAverage.muscleMass | 0% | null |
| totalAverage.physiqueRating | 0% | null |
| totalAverage.until | 100% | number |
| totalAverage.visceralFat | 0% | null |
| totalAverage.weight | 100% | number |

</details>

<details><summary><code>weight.all</code>: /weight-service/weight/all/{startDate}/{endDate} (4 samples, 13 fields)</summary>

_every weigh-in in the window_

| Field | Filled | Type |
|---|---|---|
| bmi | 0% | null |
| bodyFat | 0% | null |
| bodyWater | 0% | null |
| boneMass | 0% | null |
| calendarDate | 100% | string |
| date | 100% | number |
| metabolicAge | 0% | null |
| muscleMass | 0% | null |
| physiqueRating | 0% | null |
| timestampGMT | 100% | number |
| visceralFat | 0% | null |
| weight | 100% | number |
| weightDelta | 75% | number |

</details>

<details><summary><code>weight.goal</code>: /goal-service/goal/user/effective/weightgoal/{startDate}/{endDate} (0 samples, 0 fields)</summary>

_weight goal set in Connect_

_No data._

</details>

<details><summary><code>wellness.activity</code>: /wellnessactivity-service/activity/summary/range/{fromDate}/{untilDate} (0 samples, 0 fields)</summary>

_time-in-zone summaries_

_No data._

</details>

<details><summary><code>hrv.day</code>: /hrv-service/hrv/{calendarDate} (11 samples, 23 fields)</summary>

_per-night HRV readings (5-min), status, baseline_

| Field | Filled | Type |
|---|---|---|
| endTimestampGMT | 100% | string |
| endTimestampLocal | 100% | string |
| hrvReadings[].hrvValue | 73% | number |
| hrvReadings[].readingTimeGMT | 73% | string |
| hrvReadings[].readingTimeLocal | 73% | string |
| hrvSummary.baseline.balancedLow | 73% | number |
| hrvSummary.baseline.balancedUpper | 73% | number |
| hrvSummary.baseline.lowUpper | 73% | number |
| hrvSummary.baseline.markerValue | 64% | number |
| hrvSummary.calendarDate | 100% | string |
| hrvSummary.createTimeStamp | 100% | string |
| hrvSummary.feedbackPhrase | 100% | string |
| hrvSummary.lastNight5MinHigh | 73% | number |
| hrvSummary.lastNightAvg | 73% | number |
| hrvSummary.status | 100% | string |
| hrvSummary.weeklyAvg | 73% | number |
| sleepEndTimestampGMT | 73% | string |
| sleepEndTimestampLocal | 73% | string |
| sleepStartTimestampGMT | 73% | string |
| sleepStartTimestampLocal | 73% | string |
| startTimestampGMT | 100% | string |
| startTimestampLocal | 100% | string |
| userProfilePk | 100% | number |

</details>

<details><summary><code>sleep.day</code>: /sleep-service/sleep/dailySleep (30 samples, 113 fields)</summary>

_per-night sleep detail: stages, timings, skin temp?, respiration?_

| Field | Filled | Type |
|---|---|---|
| ageGroup | 27% | string |
| autoSleepEndTimestampGMT | 0% | null |
| autoSleepStartTimestampGMT | 0% | null |
| averageRespirationValue | 27% | number |
| averageSpO2HRSleep | 3% | number |
| averageSpO2Value | 20% | number |
| avgHeartRate | 7% | number |
| avgSleepStress | 27% | number |
| awakeCount | 27% | number |
| awakeSleepSeconds | 27% | number |
| calendarDate | 27% | string |
| deepSleepSeconds | 27% | number |
| deviceRemCapable | 100% | boolean |
| highestRespirationValue | 27% | number |
| highestSpO2Value | 20% | number |
| id | 27% | number |
| lightSleepSeconds | 27% | number |
| lowestRespirationValue | 27% | number |
| lowestSpO2Value | 20% | number |
| napTimeSeconds | 27% | number |
| nextSleepNeed.actual | 10% | number |
| nextSleepNeed.baseline | 10% | number |
| nextSleepNeed.calendarDate | 10% | string |
| nextSleepNeed.deviceId | 10% | number |
| nextSleepNeed.displayedForTheDay | 10% | boolean |
| nextSleepNeed.feedback | 10% | string |
| nextSleepNeed.hrvAdjustment | 10% | string |
| nextSleepNeed.napAdjustment | 10% | string |
| nextSleepNeed.preferredActivityTracker | 10% | boolean |
| nextSleepNeed.recommendedBedtimeEndMins | 10% | number |
| nextSleepNeed.recommendedBedtimeStartMins | 10% | number |
| nextSleepNeed.sleepHistoryAdjustment | 10% | string |
| nextSleepNeed.timestampGmt | 10% | string |
| nextSleepNeed.trainingFeedback | 10% | string |
| nextSleepNeed.userProfilePk | 10% | number |
| numberOfEventsBelowThreshold | 0% | null |
| remSleepSeconds | 27% | number |
| retro | 100% | boolean |
| sleepAlignment.calendarDate | 10% | string |
| sleepAlignment.deviceId | 10% | number |
| sleepAlignment.isPreferredActivityTracker | 10% | boolean |
| sleepAlignment.lastSleepMidpointMins | 10% | number |
| sleepAlignment.optimalSleepWindowEndMins | 0% | null |
| sleepAlignment.optimalSleepWindowMidpointMins | 0% | null |
| sleepAlignment.optimalSleepWindowStartMins | 0% | null |
| sleepAlignment.sleepNeedBaselineMins | 0% | null |
| sleepAlignment.status | 10% | string |
| sleepAlignment.userId | 10% | number |
| sleepEndTimestampGMT | 27% | number |
| sleepEndTimestampLocal | 27% | number |
| sleepFromDevice | 27% | boolean |
| sleepNeed.actual | 10% | number |
| sleepNeed.baseline | 10% | number |
| sleepNeed.calendarDate | 10% | string |
| sleepNeed.deviceId | 10% | number |
| sleepNeed.displayedForTheDay | 10% | boolean |
| sleepNeed.feedback | 10% | string |
| sleepNeed.hrvAdjustment | 10% | string |
| sleepNeed.napAdjustment | 10% | string |
| sleepNeed.preferredActivityTracker | 10% | boolean |
| sleepNeed.recommendedBedtimeEndMins | 10% | number |
| sleepNeed.recommendedBedtimeStartMins | 10% | number |
| sleepNeed.sleepHistoryAdjustment | 10% | string |
| sleepNeed.timestampGmt | 10% | string |
| sleepNeed.trainingFeedback | 10% | string |
| sleepNeed.userProfilePk | 10% | number |
| sleepQualityTypePK | 0% | null |
| sleepResultTypePK | 0% | null |
| sleepScoreFeedback | 27% | string |
| sleepScoreInsight | 27% | string |
| sleepScorePersonalizedInsight | 27% | string |
| sleepScores.awakeCount.optimalEnd | 27% | number |
| sleepScores.awakeCount.optimalStart | 27% | number |
| sleepScores.awakeCount.qualifierKey | 27% | string |
| sleepScores.deepPercentage.idealEndInSeconds | 27% | number |
| sleepScores.deepPercentage.idealStartInSeconds | 27% | number |
| sleepScores.deepPercentage.optimalEnd | 27% | number |
| sleepScores.deepPercentage.optimalStart | 27% | number |
| sleepScores.deepPercentage.qualifierKey | 27% | string |
| sleepScores.deepPercentage.value | 27% | number |
| sleepScores.lightPercentage.idealEndInSeconds | 27% | number |
| sleepScores.lightPercentage.idealStartInSeconds | 27% | number |
| sleepScores.lightPercentage.optimalEnd | 27% | number |
| sleepScores.lightPercentage.optimalStart | 27% | number |
| sleepScores.lightPercentage.qualifierKey | 27% | string |
| sleepScores.lightPercentage.value | 27% | number |
| sleepScores.overall.qualifierKey | 27% | string |
| sleepScores.overall.value | 27% | number |
| sleepScores.remPercentage.idealEndInSeconds | 27% | number |
| sleepScores.remPercentage.idealStartInSeconds | 27% | number |
| sleepScores.remPercentage.optimalEnd | 27% | number |
| sleepScores.remPercentage.optimalStart | 27% | number |
| sleepScores.remPercentage.qualifierKey | 27% | string |
| sleepScores.remPercentage.value | 27% | number |
| sleepScores.restlessness.optimalEnd | 27% | number |
| sleepScores.restlessness.optimalStart | 27% | number |
| sleepScores.restlessness.qualifierKey | 27% | string |
| sleepScores.stress.optimalEnd | 27% | number |
| sleepScores.stress.optimalStart | 27% | number |
| sleepScores.stress.qualifierKey | 27% | string |
| sleepScores.totalDuration.optimalEnd | 27% | number |
| sleepScores.totalDuration.optimalStart | 27% | number |
| sleepScores.totalDuration.qualifierKey | 27% | string |
| sleepStartTimestampGMT | 27% | number |
| sleepStartTimestampLocal | 27% | number |
| sleepTimeSeconds | 27% | number |
| sleepVersion | 27% | number |
| sleepWindowConfirmationType | 27% | string |
| sleepWindowConfirmed | 27% | boolean |
| spo2Threshold | 0% | null |
| unmeasurableSleepSeconds | 27% | number |
| userNote | 0% | null |
| userProfilePK | 27% | number |

</details>

<details><summary><code>hr.day</code>: /wellness-service/wellness/dailyHeartRate (30 samples, 13 fields)</summary>

_intraday HR, RHR_

| Field | Filled | Type |
|---|---|---|
| calendarDate | 100% | string |
| endTimestampGMT | 97% | string |
| endTimestampLocal | 97% | string |
| heartRateValueDescriptors[].index | 43% | number |
| heartRateValueDescriptors[].key | 43% | string |
| heartRateValues[][] | 43% | number |
| lastSevenDaysAvgRestingHeartRate | 40% | number |
| maxHeartRate | 43% | number |
| minHeartRate | 43% | number |
| restingHeartRate | 43% | number |
| startTimestampGMT | 97% | string |
| startTimestampLocal | 97% | string |
| userProfilePK | 100% | number |

</details>

<details><summary><code>summary.day</code>: /usersummary-service/usersummary/daily (30 samples, 105 fields)</summary>

_v1 daily summary (compare with v2)_

| Field | Filled | Type |
|---|---|---|
| abnormalHeartRateAlertsCount | 0% | null |
| activeKilocalories | 97% | number |
| activeSeconds | 97% | number |
| activityStressDuration | 43% | number |
| activityStressPercentage | 97% | number |
| averageMonitoringEnvironmentAltitude | 0% | null |
| averageSpo2 | 37% | number |
| averageStressLevel | 97% | number |
| avgWakingRespirationValue | 43% | number |
| bmrKilocalories | 97% | number |
| bodyBatteryActivityEventList[].activityId | 3% | number |
| bodyBatteryActivityEventList[].activityName | 3% | string |
| bodyBatteryActivityEventList[].activityType | 3% | string |
| bodyBatteryActivityEventList[].bodyBatteryImpact | 7% | number |
| bodyBatteryActivityEventList[].deviceId | 7% | number |
| bodyBatteryActivityEventList[].durationInMilliseconds | 7% | number |
| bodyBatteryActivityEventList[].eventStartTimeGmt | 7% | string |
| bodyBatteryActivityEventList[].eventType | 7% | string |
| bodyBatteryActivityEventList[].eventUpdateTimeGmt | 7% | string |
| bodyBatteryActivityEventList[].feedbackType | 7% | string |
| bodyBatteryActivityEventList[].shortFeedback | 7% | string |
| bodyBatteryActivityEventList[].timezoneOffset | 7% | number |
| bodyBatteryAtWakeTime | 27% | number |
| bodyBatteryChargedValue | 43% | number |
| bodyBatteryDrainedValue | 43% | number |
| bodyBatteryDuringSleep | 27% | number |
| bodyBatteryDynamicFeedbackEvent.bodyBatteryLevel | 10% | string |
| bodyBatteryDynamicFeedbackEvent.eventTimestampGmt | 10% | string |
| bodyBatteryDynamicFeedbackEvent.feedbackLongType | 10% | string |
| bodyBatteryDynamicFeedbackEvent.feedbackShortType | 10% | string |
| bodyBatteryHighestValue | 43% | number |
| bodyBatteryLowestValue | 43% | number |
| bodyBatteryMostRecentValue | 43% | number |
| bodyBatteryVersion | 47% | number |
| calendarDate | 100% | string |
| consumedKilocalories | 0% | null |
| dailyStepGoal | 97% | number |
| displayName | 3% | string |
| durationInMilliseconds | 97% | number |
| endOfDayBodyBatteryDynamicFeedbackEvent.bodyBatteryLevel | 7% | string |
| endOfDayBodyBatteryDynamicFeedbackEvent.eventTimestampGmt | 7% | string |
| endOfDayBodyBatteryDynamicFeedbackEvent.feedbackLongType | 7% | string |
| endOfDayBodyBatteryDynamicFeedbackEvent.feedbackShortType | 7% | string |
| floorsAscended | 97% | number |
| floorsAscendedInMeters | 97% | number |
| floorsDescended | 97% | number |
| floorsDescendedInMeters | 97% | number |
| highestRespirationValue | 43% | number |
| highlyActiveSeconds | 97% | number |
| highStressDuration | 43% | number |
| highStressPercentage | 97% | number |
| includesActivityData | 100% | boolean |
| includesCalorieConsumedData | 100% | boolean |
| includesWellnessData | 100% | boolean |
| intensityMinutesGoal | 97% | number |
| lastSevenDaysAvgRestingHeartRate | 40% | number |
| lastSyncTimestampGMT | 0% | null |
| latestRespirationTimeGMT | 43% | string |
| latestRespirationValue | 43% | number |
| latestSpo2 | 37% | number |
| latestSpo2ReadingTimeGmt | 37% | string |
| latestSpo2ReadingTimeLocal | 37% | string |
| lowestRespirationValue | 43% | number |
| lowestSpo2 | 37% | number |
| lowStressDuration | 40% | number |
| lowStressPercentage | 97% | number |
| maxAvgHeartRate | 43% | number |
| maxHeartRate | 43% | number |
| maxStressLevel | 43% | number |
| measurableAsleepDuration | 97% | number |
| measurableAwakeDuration | 97% | number |
| mediumStressDuration | 43% | number |
| mediumStressPercentage | 97% | number |
| minAvgHeartRate | 43% | number |
| minHeartRate | 43% | number |
| moderateIntensityMinutes | 97% | number |
| netCalorieGoal | 97% | number |
| remainingKilocalories | 97% | number |
| respirationAlgorithmVersion | 43% | number |
| restingHeartRate | 40% | number |
| restStressDuration | 37% | number |
| restStressPercentage | 97% | number |
| sedentarySeconds | 97% | number |
| sleepingSeconds | 97% | number |
| source | 100% | string |
| stressDuration | 43% | number |
| stressPercentage | 97% | number |
| stressQualifier | 97% | string |
| totalDistanceMeters | 43% | number |
| totalKilocalories | 97% | number |
| totalSteps | 43% | number |
| totalStressDuration | 97% | number |
| uncategorizedStressDuration | 97% | number |
| uncategorizedStressPercentage | 97% | number |
| userDailySummaryId | 97% | number |
| userFloorsAscendedGoal | 97% | number |
| userProfileId | 100% | number |
| uuid | 97% | string |
| vigorousIntensityMinutes | 97% | number |
| wellnessDescription | 0% | null |
| wellnessDistanceMeters | 43% | number |
| wellnessEndTimeGmt | 97% | string |
| wellnessEndTimeLocal | 97% | string |
| wellnessStartTimeGmt | 97% | string |
| wellnessStartTimeLocal | 97% | string |

</details>

<details><summary><code>spo2.day</code>: /wellness-service/wellness/daily/spo2acclimation/{calendarDate} (7 samples, 30 fields)</summary>

_SpO2 if the Instinct 2 measures it_

| Field | Filled | Type |
|---|---|---|
| averageSpO2 | 57% | number |
| avgSleepSpO2 | 29% | number |
| avgTomorrowSleepSpO2 | 14% | number |
| calendarDate | 100% | string |
| endTimestampGMT | 86% | string |
| endTimestampLocal | 86% | string |
| lastSevenDaysAvgSpO2 | 86% | number |
| latestSpO2 | 57% | number |
| latestSpO2TimestampGMT | 57% | string |
| latestSpO2TimestampLocal | 57% | string |
| lowestSpO2 | 57% | number |
| monitoringEnvironmentValues | 0% | null |
| monitoringEnvironmentValuesDescriptorList | 0% | null |
| sleepEndTimestampGMT | 57% | string |
| sleepEndTimestampLocal | 57% | string |
| sleepStartTimestampGMT | 57% | string |
| sleepStartTimestampLocal | 57% | string |
| spO2HourlyAverages[][] | 57% | number |
| spO2HourlyAveragesDescriptorList[].spo2ValueDescIndex | 57% | number |
| spO2HourlyAveragesDescriptorList[].spo2ValueDescKey | 57% | string |
| spO2SingleValues | 0% | null |
| spO2SingleValuesDescriptorList[].spo2ValueDescriptorIndex | 57% | number |
| spO2SingleValuesDescriptorList[].spo2ValueDescriptorKey | 57% | string |
| startTimestampGMT | 86% | string |
| startTimestampLocal | 86% | string |
| tomorrowSleepEndTimestampGMT | 43% | string |
| tomorrowSleepEndTimestampLocal | 43% | string |
| tomorrowSleepStartTimestampGMT | 43% | string |
| tomorrowSleepStartTimestampLocal | 43% | string |
| userProfilePK | 100% | number |

</details>

<details><summary><code>nutrition.day</code>: /nutrition-service/food/logs/{date} (7 samples, 5 fields)</summary>

_only if food is logged in Connect_

| Field | Filled | Type |
|---|---|---|
| dailyNutritionGoals.adjustedCalories | 100% | number |
| dailyNutritionGoals.calories | 100% | number |
| dayEndTime | 100% | string |
| dayStartTime | 100% | string |
| mealDate | 100% | string |

</details>

<details><summary><code>activity.list</code>: /activitylist-service/activities/search/activities (3 samples, 78 fields)</summary>

_activities in the window_

| Field | Filled | Type |
|---|---|---|
| activityId | 100% | number |
| activityName | 100% | string |
| activityTrainingLoad | 100% | number |
| activityType.parentTypeId | 100% | number |
| activityType.typeId | 100% | number |
| activityType.typeKey | 100% | string |
| activityUUID | 100% | string |
| aerobicTrainingEffect | 100% | number |
| aerobicTrainingEffectMessage | 100% | string |
| anaerobicTrainingEffect | 100% | number |
| anaerobicTrainingEffectMessage | 100% | string |
| autoCalcCalories | 100% | boolean |
| averageHR | 100% | number |
| averageSpeed | 100% | number |
| avgElevation | 100% | number |
| beginTimestamp | 100% | number |
| bmrCalories | 100% | number |
| calories | 100% | number |
| decoDive | 100% | boolean |
| differenceBodyBattery | 67% | number |
| distance | 100% | number |
| duration | 100% | number |
| elapsedDuration | 100% | number |
| elevationCorrected | 100% | boolean |
| elevationGain | 100% | number |
| elevationLoss | 100% | number |
| endLatitude | 100% | number |
| endLongitude | 100% | number |
| endTimeGMT | 100% | string |
| eventType.typeId | 100% | number |
| eventType.typeKey | 100% | string |
| favorite | 100% | boolean |
| hasImages | 100% | boolean |
| hasVideo | 100% | boolean |
| hrTimeInZone_1 | 100% | number |
| hrTimeInZone_2 | 100% | number |
| hrTimeInZone_3 | 100% | number |
| hrTimeInZone_4 | 100% | number |
| hrTimeInZone_5 | 100% | number |
| isAutoCalcCalories | 100% | boolean |
| isDecoDive | 100% | boolean |
| isElevationCorrected | 100% | boolean |
| isFavorite | 100% | boolean |
| isManualActivity | 100% | boolean |
| isParent | 100% | boolean |
| isPR | 100% | boolean |
| lapCount | 100% | number |
| locationName | 100% | string |
| manualActivity | 100% | boolean |
| manufacturer | 100% | string |
| maxElevation | 100% | number |
| maxHR | 100% | number |
| maxSpeed | 100% | number |
| maxVerticalSpeed | 100% | number |
| minActivityLapDuration | 100% | number |
| minElevation | 100% | number |
| moderateIntensityMinutes | 100% | number |
| movingDuration | 100% | number |
| ownerDisplayName | 100% | string |
| ownerFullName | 100% | string |
| ownerId | 100% | number |
| ownerProfileImageUrlLarge | 100% | string |
| ownerProfileImageUrlMedium | 100% | string |
| ownerProfileImageUrlSmall | 100% | string |
| parent | 100% | boolean |
| pr | 100% | boolean |
| privacy.typeId | 100% | number |
| privacy.typeKey | 100% | string |
| qualifyingDive | 100% | boolean |
| sportTypeId | 100% | number |
| startLatitude | 100% | number |
| startLongitude | 100% | number |
| startTimeGMT | 100% | string |
| startTimeLocal | 100% | string |
| steps | 100% | number |
| trainingEffectLabel | 100% | string |
| vigorousIntensityMinutes | 100% | number |
| waterEstimated | 100% | number |

</details>

<details><summary><code>activity.detail</code>: /activity-service/activity/{activityId} (3 samples, 80 fields)</summary>

_summary, training effect, HR zones_

| Field | Filled | Type |
|---|---|---|
| accessControlRuleDTO.typeId | 100% | number |
| accessControlRuleDTO.typeKey | 100% | string |
| activityId | 100% | number |
| activityName | 100% | string |
| activityTypeDTO.parentTypeId | 100% | number |
| activityTypeDTO.typeId | 100% | number |
| activityTypeDTO.typeKey | 100% | string |
| activityUUID.uuid | 100% | string |
| description | 0% | string |
| eventTypeDTO.typeId | 100% | number |
| eventTypeDTO.typeKey | 100% | string |
| isMultiSportParent | 100% | boolean |
| locationName | 100% | string |
| metadataDTO.autoCalcCalories | 100% | boolean |
| metadataDTO.calendarEventInfo | 0% | null |
| metadataDTO.elevationCorrected | 100% | boolean |
| metadataDTO.favorite | 100% | boolean |
| metadataDTO.fileFormat.formatId | 100% | number |
| metadataDTO.fileFormat.formatKey | 100% | string |
| metadataDTO.gcj02 | 100% | boolean |
| metadataDTO.hasMultiDayActivities | 100% | boolean |
| metadataDTO.hasRunPowerWindData | 0% | null |
| metadataDTO.isOriginal | 100% | boolean |
| metadataDTO.lapCount | 100% | number |
| metadataDTO.lastUpdateDate | 100% | string |
| metadataDTO.manualActivity | 100% | boolean |
| metadataDTO.manufacturer | 100% | string |
| metadataDTO.personalRecord | 100% | boolean |
| metadataDTO.runPowerWindDataEnabled | 0% | null |
| metadataDTO.sensors | 0% | null |
| metadataDTO.trimmed | 100% | boolean |
| metadataDTO.uploadedDate | 100% | string |
| metadataDTO.userInfoDto.displayname | 100% | string |
| metadataDTO.userInfoDto.fullname | 100% | string |
| metadataDTO.userInfoDto.profileImageUrlLarge | 100% | string |
| metadataDTO.userInfoDto.profileImageUrlMedium | 100% | string |
| metadataDTO.userInfoDto.profileImageUrlSmall | 100% | string |
| metadataDTO.userInfoDto.userPro | 100% | boolean |
| metadataDTO.userInfoDto.userProfilePk | 100% | number |
| metadataDTO.videoUrl | 0% | null |
| summaryDTO.activityTrainingLoad | 100% | number |
| summaryDTO.aerobicTrainingEffectMessage | 100% | string |
| summaryDTO.anaerobicTrainingEffect | 100% | number |
| summaryDTO.anaerobicTrainingEffectMessage | 100% | string |
| summaryDTO.averageHR | 100% | number |
| summaryDTO.averageMovingSpeed | 100% | number |
| summaryDTO.averageSpeed | 100% | number |
| summaryDTO.avgElevation | 100% | number |
| summaryDTO.bmrCalories | 100% | number |
| summaryDTO.calories | 100% | number |
| summaryDTO.differenceBodyBattery | 67% | number |
| summaryDTO.directWorkoutFeel | 67% | number |
| summaryDTO.directWorkoutRpe | 67% | number |
| summaryDTO.distance | 100% | number |
| summaryDTO.duration | 100% | number |
| summaryDTO.elapsedDuration | 100% | number |
| summaryDTO.elevationGain | 100% | number |
| summaryDTO.elevationLoss | 100% | number |
| summaryDTO.endLatitude | 100% | number |
| summaryDTO.endLongitude | 100% | number |
| summaryDTO.maxElevation | 100% | number |
| summaryDTO.maxHR | 100% | number |
| summaryDTO.maxSpeed | 100% | number |
| summaryDTO.maxVerticalSpeed | 100% | number |
| summaryDTO.minActivityLapDuration | 100% | number |
| summaryDTO.minElevation | 100% | number |
| summaryDTO.minHR | 100% | number |
| summaryDTO.moderateIntensityMinutes | 100% | number |
| summaryDTO.movingDuration | 100% | number |
| summaryDTO.startLatitude | 100% | number |
| summaryDTO.startLongitude | 100% | number |
| summaryDTO.startTimeGMT | 100% | string |
| summaryDTO.startTimeLocal | 100% | string |
| summaryDTO.steps | 100% | number |
| summaryDTO.trainingEffect | 100% | number |
| summaryDTO.trainingEffectLabel | 100% | string |
| summaryDTO.vigorousIntensityMinutes | 100% | number |
| summaryDTO.waterEstimated | 100% | number |
| timeZoneUnitDTO.timeZone | 100% | string |
| userProfileId | 100% | number |

</details>

<details><summary><code>activity.workouts</code>: /activity-service/activity/{activityId}/workouts (0 samples, 0 fields)</summary>

_structured workout attached to it_

_No data._

</details>

<details><summary><code>activity.file</code>: /download-service/files/activity/{activityId} (0 samples, 0 fields)</summary>

_ZIP with the FIT: 1 Hz HR, laps, strength sets_

_No data._

</details>
