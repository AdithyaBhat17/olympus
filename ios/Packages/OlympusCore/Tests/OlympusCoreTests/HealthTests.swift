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
