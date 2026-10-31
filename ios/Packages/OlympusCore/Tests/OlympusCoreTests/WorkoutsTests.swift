import XCTest
@testable import OlympusCore

final class WorkoutsTests: XCTestCase {
    func t(_ s: String) -> Date { ISO8601DateFormatter().date(from: "2026-10-31T\(s):00Z")! }

    func workout(_ id: String, _ source: String, _ from: String, _ to: String, distance: Double? = nil, kcal: Double? = nil, type: String = "running") -> HealthWorkout {
        HealthWorkout(id: id, activityType: type, source: source, start: t(from), end: t(to), distanceM: distance, activeKcal: kcal)
    }

    func testTheSameRunFromTwoAppsIsKeptOnce() {
        let garmin = workout("g", "Garmin Connect", "17:00", "17:50", distance: 10_000, kcal: 600)
        let strava = workout("s", "Strava", "17:00", "17:49", distance: 10_010)
        XCTAssertEqual(distinctWorkouts([strava, garmin]).map(\.id), ["g"])
    }

    func testSeparateWorkoutsStaySeparate() {
        let lift = workout("l", "Garmin Connect", "06:00", "07:10", type: "traditionalStrengthTraining")
        let run = workout("r", "Garmin Connect", "07:05", "07:45")
        XCTAssertEqual(distinctWorkouts([run, lift]).map(\.id), ["l", "r"])
    }

    func testTiesPickTheSameCopyEveryTime() {
        let a = workout("a", "B app", "17:00", "17:50")
        let b = workout("b", "A app", "17:00", "17:50")
        XCTAssertEqual(distinctWorkouts([a, b]).map(\.id), ["b"])
        XCTAssertEqual(distinctWorkouts([b, a]).map(\.id), ["b"])
    }

    func testZeroLengthWorkoutsAreDropped() {
        XCTAssertEqual(distinctWorkouts([workout("z", "Watch", "10:00", "10:00")]), [])
    }

    func testPayloadDropsImpossibleValuesAndCarriesHeartRate() {
        let w = workout("g", "Garmin Connect", "17:00", "17:50", distance: 10_000.4, kcal: -5)
        let hr = SessionHeartRate(id: "g", device: "Garmin Connect", avgHr: 152, maxHr: 178, coveredMin: 50)
        let p = ActivityPayload(w, heartRate: hr)
        XCTAssertEqual(p.distanceM, 10_000)
        XCTAssertNil(p.activeKcal)
        XCTAssertEqual(p.avgHr, 152)
        XCTAssertEqual(p.endMs - p.startMs, 50 * 60_000)
    }
}
