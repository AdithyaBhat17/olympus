import Foundation

/// One day for POST /api/ingest/health. Nil fields are left out of the JSON,
/// so the server leaves them alone.
public struct DayValues: Codable, Equatable, Sendable {
    public var date: String
    public var proteinG: Int?
    public var waterMl: Int?
    public var sleepMin: Int?
    /// SDNN, the only HRV Apple Health stores.
    public var hrvMs: Int?
    public var restingHr: Int?

    public init(date: String, proteinG: Int? = nil, waterMl: Int? = nil, sleepMin: Int? = nil, hrvMs: Int? = nil, restingHr: Int? = nil) {
        self.date = date
        self.proteinG = proteinG
        self.waterMl = waterMl
        self.sleepMin = sleepMin
        self.hrvMs = hrvMs
        self.restingHr = restingHr
    }

    public var isEmpty: Bool {
        proteinG == nil && waterMl == nil && sleepMin == nil && hrvMs == nil && restingHr == nil
    }
}

public struct IngestPayload: Codable, Equatable, Sendable {
    public var days: [DayValues]
    public init(days: [DayValues]) { self.days = days }
}

/// What Health read for a run of days, keyed by yyyy-MM-dd.
public struct HealthReadings: Sendable {
    public var protein: [String: Double] = [:]
    public var water: [String: Double] = [:]
    public var sleep: [String: Int] = [:]
    public var hrv: [String: Double] = [:]
    public var restingHr: [String: Double] = [:]

    public init(protein: [String: Double] = [:], water: [String: Double] = [:], sleep: [String: Int] = [:], hrv: [String: Double] = [:], restingHr: [String: Double] = [:]) {
        self.protein = protein
        self.water = water
        self.sleep = sleep
        self.hrv = hrv
        self.restingHr = restingHr
    }
}

/// The server rejects the whole batch if one value is out of range, so a bad
/// sample (a typo in MyFitnessPal, a glitchy sensor) is dropped here instead.
/// Ranges match src/app/api/ingest/health/route.ts.
func inRange(_ v: Double?, _ range: ClosedRange<Double>) -> Int? {
    guard let v, v.isFinite else { return nil }
    let r = v.rounded()
    return range.contains(r) ? Int(r) : nil
}

/// Days in `dates` order (oldest first is fine) with at least one value.
/// Zero protein or water means nothing was logged, not that none was eaten,
/// so it's left out rather than overwriting what the athlete typed.
public func buildDays(dates: [String], readings r: HealthReadings) -> [DayValues] {
    dates.compactMap { d in
        let day = DayValues(
            date: d,
            proteinG: inRange(r.protein[d], 1...1000),
            waterMl: inRange(r.water[d], 1...20000),
            sleepMin: inRange(r.sleep[d].map(Double.init), 1...1440),
            hrvMs: inRange(r.hrv[d], 1...500),
            restingHr: inRange(r.restingHr[d], 20...200)
        )
        return day.isEmpty ? nil : day
    }
}

/// The last `count` dates ending today, oldest first.
public func recentDates(count: Int, now: Date = Date(), calendar: Calendar) -> [String] {
    let today = calendar.startOfDay(for: now)
    return (0..<count).reversed().compactMap { offset in
        calendar.date(byAdding: .day, value: -offset, to: today).map { dayKey($0, calendar: calendar) }
    }
}
