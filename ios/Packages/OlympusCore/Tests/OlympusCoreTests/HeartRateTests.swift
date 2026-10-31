import XCTest
@testable import OlympusCore

final class HeartRateTests: XCTestCase {
    func minutes(_ source: String, _ values: [(Double, Double)]) -> [HeartRateMinute] {
        values.map { HeartRateMinute(source: source, avg: $0.0, max: $0.1) }
    }

    func testAveragesMinutesAndTakesThePeak() {
        let hr = sessionHeartRate(id: "s1", minutes: minutes("Garmin Connect", [(100, 110), (120, 150), (131, 140)]))
        XCTAssertEqual(hr, SessionHeartRate(id: "s1", device: "Garmin Connect", avgHr: 117, maxHr: 150, coveredMin: 3))
    }

    func testOneSourceWinsInsteadOfBlendingTwoSensors() {
        let watch = minutes("Apple Watch", [(90, 95), (92, 96), (94, 97)])
        let garmin = minutes("Garmin Connect", [(120, 130), (125, 140), (130, 150), (135, 155)])
        let hr = sessionHeartRate(id: "s1", minutes: watch + garmin)
        XCTAssertEqual(hr?.device, "Garmin Connect")
        XCTAssertEqual(hr?.avgHr, 128)
        XCTAssertEqual(hr?.coveredMin, 4)
    }

    func testTiesPickTheSameSourceEveryTime() {
        let a = minutes("B device", [(100, 100), (100, 100), (100, 100)])
        let b = minutes("A device", [(110, 110), (110, 110), (110, 110)])
        XCTAssertEqual(sessionHeartRate(id: "s1", minutes: a + b)?.device, "A device")
        XCTAssertEqual(sessionHeartRate(id: "s1", minutes: b + a)?.device, "A device")
    }

    func testTooFewMinutesIsNoSummary() {
        XCTAssertNil(sessionHeartRate(id: "s1", minutes: minutes("Apple Watch", [(80, 85), (82, 90)])))
        XCTAssertNil(sessionHeartRate(id: "s1", minutes: []))
    }

    func testGlitchyReadingsAreDropped() {
        let hr = sessionHeartRate(id: "s1", minutes: minutes("Apple Watch", [(100, 110), (0, 0), (110, 255), (120, 130), (110, 120)]))
        XCTAssertEqual(hr?.coveredMin, 3)
        XCTAssertEqual(hr?.maxHr, 130)
    }

    func testWindowsDecodeFromTheServer() throws {
        let json = #"{"sessions":[{"id":"s1","startMs":1761900000000,"endMs":1761904500000}]}"#
        let w = try JSONDecoder().decode(SessionWindows.self, from: Data(json.utf8))
        XCTAssertEqual(w.sessions.first?.end.timeIntervalSince(w.sessions.first!.start), 4500)
    }
}
