import Foundation

/// One Health workout and the app or device that wrote it.
public struct HealthWorkout: Equatable, Sendable {
    public let id: String
    /// Health's activity type, e.g. "running".
    public let activityType: String
    public let source: String
    public let start: Date
    public let end: Date
    public let distanceM: Double?
    public let activeKcal: Double?

    public init(id: String, activityType: String, source: String, start: Date, end: Date, distanceM: Double? = nil, activeKcal: Double? = nil) {
        self.id = id
        self.activityType = activityType
        self.source = source
        self.start = start
        self.end = end
        self.distanceM = distanceM
        self.activeKcal = activeKcal
    }

    var seconds: TimeInterval { end.timeIntervalSince(start) }
}

/// Same rule as the server's sameTraining (src/server/activity-overlap.ts):
/// overlapping for at least half of the shorter one.
func sameTraining(_ a: (start: Date, end: Date), _ b: (start: Date, end: Date)) -> Bool {
    let overlap = min(a.end, b.end).timeIntervalSince(max(a.start, b.start))
    let shorter = min(a.end.timeIntervalSince(a.start), b.end.timeIntervalSince(b.start))
    return shorter > 0 && overlap >= shorter / 2
}

/// One workout per piece of training. Garmin Connect and Strava (or a Watch
/// worn alongside) can each write the same run to Health; the copy that says
/// the most (distance, energy) wins, then the longer one, then the
/// alphabetically first source so a re-sync keeps the same one.
public func distinctWorkouts(_ workouts: [HealthWorkout]) -> [HealthWorkout] {
    func better(_ a: HealthWorkout, _ b: HealthWorkout) -> Bool {
        let detail = { (w: HealthWorkout) in (w.distanceM != nil ? 1 : 0) + (w.activeKcal != nil ? 1 : 0) }
        if detail(a) != detail(b) { return detail(a) > detail(b) }
        if a.seconds != b.seconds { return a.seconds > b.seconds }
        return a.source != b.source ? a.source < b.source : a.id < b.id
    }
    var kept: [HealthWorkout] = []
    for w in workouts.filter({ $0.seconds > 0 }).sorted(by: { $0.start < $1.start }) {
        if let i = kept.firstIndex(where: { sameTraining(($0.start, $0.end), (w.start, w.end)) }) {
            if better(w, kept[i]) { kept[i] = w }
        } else {
            kept.append(w)
        }
    }
    return kept
}

/// One activity for POST /api/v1/activities. Nil fields are left out.
public struct ActivityPayload: Codable, Equatable, Sendable {
    public var id: String
    public var activityType: String
    public var device: String?
    public var startMs: Int
    public var endMs: Int
    public var distanceM: Int?
    public var activeKcal: Int?
    public var avgHr: Int?
    public var maxHr: Int?
    public var hrCoveredMin: Int?

    /// Values the server would reject (a glitchy reading) are dropped here,
    /// so one bad workout doesn't fail the batch. Ranges match external-activities.ts.
    public init(_ w: HealthWorkout, heartRate: SessionHeartRate?) {
        id = String(w.id.prefix(64))
        activityType = String(w.activityType.prefix(40))
        device = String(w.source.prefix(80))
        startMs = Int((w.start.timeIntervalSince1970 * 1000).rounded())
        endMs = Int((w.end.timeIntervalSince1970 * 1000).rounded())
        distanceM = inRange(w.distanceM, 0...1_000_000)
        activeKcal = inRange(w.activeKcal, 0...20_000)
        avgHr = heartRate?.avgHr
        maxHr = heartRate?.maxHr
        hrCoveredMin = heartRate?.coveredMin
    }
}

public struct ActivitiesPayload: Codable, Equatable, Sendable {
    public var fromMs: Int
    public var activities: [ActivityPayload]

    public init(from: Date, activities: [ActivityPayload]) {
        fromMs = Int((from.timeIntervalSince1970 * 1000).rounded())
        self.activities = activities
    }
}
