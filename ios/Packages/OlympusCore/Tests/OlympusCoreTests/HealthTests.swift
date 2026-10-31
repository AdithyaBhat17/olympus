import XCTest
@testable import OlympusCore

final class SleepTests: XCTestCase {
    // Abu Dhabi, +04:00, no DST.
    var cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Dubai")!
        return c
    }()

    func t(_ s: String) -> Date { ISO8601DateFormatter().date(from: s)! }

    func testOverlappingSourcesAreNotDoubleCounted() {
        // Watch and Whoop both logged 23:00–06:00 local.
        let night = [
            SleepInterval(start: t("2026-10-01T19:00:00Z"), end: t("2026-10-02T02:00:00Z")),
            SleepInterval(start: t("2026-10-01T19:30:00Z"), end: t("2026-10-02T02:00:00Z")),
        ]
        XCTAssertEqual(mainSleepByDate(night, calendar: cal), ["2026-10-02": 420])
    }

    func testShortWakesJoinAndTheNightBelongsToTheWakeUpDay() {
        // 23:00–02:00, awake 20 min, 02:20–06:00 local.
        let night = [
            SleepInterval(start: t("2026-10-01T19:00:00Z"), end: t("2026-10-01T22:00:00Z")),
            SleepInterval(start: t("2026-10-01T22:20:00Z"), end: t("2026-10-02T02:00:00Z")),
        ]
        XCTAssertEqual(mainSleepByDate(night, calendar: cal), ["2026-10-02": 400])
    }

    func testANapDoesNotReplaceTheNight() {
        let samples = [
            SleepInterval(start: t("2026-10-01T19:00:00Z"), end: t("2026-10-02T02:00:00Z")), // night, 420
            SleepInterval(start: t("2026-10-02T10:00:00Z"), end: t("2026-10-02T10:40:00Z")), // 14:00 nap, 40
        ]
        XCTAssertEqual(mainSleepByDate(samples, calendar: cal), ["2026-10-02": 420])
    }

    func testZeroLengthSamplesAreIgnored() {
        let s = [SleepInterval(start: t("2026-10-02T01:00:00Z"), end: t("2026-10-02T01:00:00Z"))]
        XCTAssertEqual(mainSleepByDate(s, calendar: cal), [:])
    }
}

final class SleepStageTests: XCTestCase {
    var cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Dubai")!
        return c
    }()

    func t(_ s: String) -> Date { ISO8601DateFormatter().date(from: s)! }

    func sample(_ start: String, _ end: String, _ stage: SleepStage, _ source: String = "Apple Watch") -> SleepSample {
        SleepSample(start: t(start), end: t(end), stage: stage, source: source)
    }

    func testStagesComeFromOneSourceWhileMinutesMergeAll() {
        // Local 23:00–06:00. The Watch stages the night with a 10 min wake;
        // Garmin stages most of it too; Whoop writes plain "asleep".
        let samples = [
            sample("2026-10-01T19:00:00Z", "2026-10-01T20:00:00Z", .light),
            sample("2026-10-01T20:00:00Z", "2026-10-01T21:30:00Z", .deep),
            sample("2026-10-01T21:30:00Z", "2026-10-01T21:40:00Z", .awake),
            sample("2026-10-01T21:40:00Z", "2026-10-02T00:00:00Z", .light),
            sample("2026-10-02T00:00:00Z", "2026-10-02T02:00:00Z", .rem),
            sample("2026-10-01T19:00:00Z", "2026-10-02T01:00:00Z", .light, "Garmin Connect"),
            sample("2026-10-01T18:30:00Z", "2026-10-02T02:00:00Z", .unspecified, "WHOOP"),
        ]
        let night = sleepNightsByDate(samples, calendar: cal)["2026-10-02"]
        XCTAssertEqual(night?.minutes, 450) // 22:30–06:00 across every source
        XCTAssertEqual(night?.detail, SleepDetail(
            device: "Apple Watch", bedtime: "22:30", wakeTime: "06:00",
            deepMin: 90, remMin: 120, lightMin: 200, awakeMin: 10, awakenings: 1
        ))
    }

    func testAwakeOutsideTheNightIsNotCounted() {
        let samples = [
            sample("2026-10-01T18:40:00Z", "2026-10-01T19:00:00Z", .awake), // lying awake before
            sample("2026-10-01T19:00:00Z", "2026-10-02T02:00:00Z", .light),
            sample("2026-10-02T02:00:00Z", "2026-10-02T02:15:00Z", .awake), // after the alarm
        ]
        let d = sleepNightsByDate(samples, calendar: cal)["2026-10-02"]?.detail
        XCTAssertEqual(d?.awakeMin, 0)
        XCTAssertEqual(d?.awakenings, 0)
    }

    func testUnstagedNightKeepsTimesButNoStages() {
        let samples = [sample("2026-10-01T19:00:00Z", "2026-10-02T02:00:00Z", .unspecified, "iPhone")]
        let night = sleepNightsByDate(samples, calendar: cal)["2026-10-02"]
        XCTAssertEqual(night?.minutes, 420)
        XCTAssertEqual(night?.detail, SleepDetail(bedtime: "23:00", wakeTime: "06:00"))
    }

    func testANapDoesNotReplaceTheNightsStages() {
        let samples = [
            sample("2026-10-01T19:00:00Z", "2026-10-02T02:00:00Z", .deep),
            sample("2026-10-02T10:00:00Z", "2026-10-02T10:40:00Z", .light),
        ]
        let d = sleepNightsByDate(samples, calendar: cal)["2026-10-02"]?.detail
        XCTAssertEqual(d?.deepMin, 420)
        XCTAssertEqual(d?.lightMin, 0)
    }
}

final class PayloadTests: XCTestCase {
    func testDaysWithNothingAreDroppedAndOutOfRangeValuesSkipped() {
        let r = HealthReadings(
            protein: ["2026-10-01": 0, "2026-10-02": 141.6],
            water: ["2026-10-02": 25_000], // over the server's 20 L cap
            sleep: ["2026-10-02": 412],
            hrv: ["2026-10-02": 48.4],
            restingHr: ["2026-10-02": 54.6]
        )
        let days = buildDays(dates: ["2026-10-01", "2026-10-02"], readings: r)
        XCTAssertEqual(days, [DayValues(date: "2026-10-02", proteinG: 142, sleepMin: 412, hrvMs: 48, restingHr: 55)])
    }

    func testSleepDetailOnlyRidesWithAValidNight() {
        let detail = SleepDetail(bedtime: "23:00", wakeTime: "06:00", deepMin: 80)
        let r = HealthReadings(
            sleep: ["2026-10-01": 0, "2026-10-02": 412],
            sleepDetail: ["2026-10-01": detail, "2026-10-02": detail],
            hrv: ["2026-10-01": 40]
        )
        XCTAssertEqual(buildDays(dates: ["2026-10-01", "2026-10-02"], readings: r), [
            DayValues(date: "2026-10-01", hrvMs: 40),
            DayValues(date: "2026-10-02", sleepMin: 412, sleepDetail: detail),
        ])
    }

    func testNilFieldsAreOmittedFromJSON() throws {
        let data = try JSONEncoder().encode(IngestPayload(days: [DayValues(date: "2026-10-02", hrvMs: 48)]))
        let json = try JSONSerialization.jsonObject(with: data) as! [String: [[String: Any]]]
        XCTAssertEqual(json["days"]?.first?.keys.sorted(), ["date", "hrvMs"])
    }

    func testRecentDatesEndTodayOldestFirst() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Dubai")!
        let now = ISO8601DateFormatter().date(from: "2026-10-02T21:30:00Z")! // 01:30 on the 3rd locally
        XCTAssertEqual(recentDates(count: 3, now: now, calendar: cal), ["2026-10-01", "2026-10-02", "2026-10-03"])
    }
}
