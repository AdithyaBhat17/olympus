import Foundation

/// A finished session's started→finished window, from GET /api/v1/sessions/heart-rate.
public struct SessionWindow: Codable, Equatable, Sendable {
    public let id: String
    public let startMs: Double
    public let endMs: Double

    public init(id: String, startMs: Double, endMs: Double) {
        self.id = id
        self.startMs = startMs
        self.endMs = endMs
    }

    public var start: Date { Date(timeIntervalSince1970: startMs / 1000) }
    public var end: Date { Date(timeIntervalSince1970: endMs / 1000) }
}

public struct SessionWindows: Codable, Equatable, Sendable {
    public let sessions: [SessionWindow]
}

/// One minute of heart rate from one Health source.
public struct HeartRateMinute: Equatable, Sendable {
    public let source: String
    public let avg: Double
    public let max: Double

    public init(source: String, avg: Double, max: Double) {
        self.source = source
        self.avg = avg
        self.max = max
    }
}

/// One session's heart rate, for POST /api/v1/sessions/heart-rate.
public struct SessionHeartRate: Codable, Equatable, Sendable {
    public var id: String
    public var device: String?
    public var avgHr: Int
    public var maxHr: Int
    public var coveredMin: Int
}

public struct SessionHeartRates: Codable, Equatable, Sendable {
    public var sessions: [SessionHeartRate]
    public init(sessions: [SessionHeartRate]) { self.sessions = sessions }
}

/// Fewer minutes than this is a stray reading, not a session.
let minHeartRateMinutes = 3

/// The session's heart rate from the one source with the most minutes in it.
/// A Watch and Garmin Connect can both write HR for the same hour; mixing them
/// would blend two sensors. Ties go to the alphabetically first source, so a
/// re-sync picks the same one. Readings outside what the server takes (a
/// sensor glitch) are dropped first.
public func sessionHeartRate(id: String, minutes: [HeartRateMinute]) -> SessionHeartRate? {
    let plausible = minutes.filter { (30...240).contains($0.avg) && (30...240).contains($0.max) }
    let bySource = Dictionary(grouping: plausible, by: \.source)
    guard let (source, mins) = bySource.max(by: { a, b in
        a.value.count != b.value.count ? a.value.count < b.value.count : a.key > b.key
    }), mins.count >= minHeartRateMinutes else { return nil }
    let avg = Int((mins.map(\.avg).reduce(0, +) / Double(mins.count)).rounded())
    let max = Int(mins.map(\.max).max()!.rounded())
    return SessionHeartRate(id: id, device: String(source.prefix(80)), avgHr: avg, maxHr: Swift.max(max, avg), coveredMin: mins.count)
}
