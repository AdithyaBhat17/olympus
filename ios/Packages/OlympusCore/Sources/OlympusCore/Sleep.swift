import Foundation

/// One "asleep" stretch from Health (core, deep, REM or unspecified).
public struct SleepInterval: Equatable, Sendable {
    public let start: Date
    public let end: Date

    public init(start: Date, end: Date) {
        self.start = start
        self.end = end
    }
}

/// Wakes shorter than this keep a night together; longer ones start a new sleep.
public let sleepSessionGap: TimeInterval = 60 * 60

/// Overlapping intervals collapsed into one. A Watch and a phone (or a Whoop
/// writing to Health) often record the same night, and counting both would
/// double it.
public func mergeOverlapping(_ intervals: [SleepInterval]) -> [SleepInterval] {
    let sorted = intervals.filter { $0.end > $0.start }.sorted { $0.start < $1.start }
    var merged: [SleepInterval] = []
    for i in sorted {
        if let last = merged.last, i.start <= last.end {
            merged[merged.count - 1] = SleepInterval(start: last.start, end: max(last.end, i.end))
        } else {
            merged.append(i)
        }
    }
    return merged
}

/// The main sleep per wake-up date (yyyy-MM-dd in `calendar`'s time zone):
/// last night's sleep belongs to today. Stretches less than an hour apart are
/// one sleep; when a date has several (a nap), the longest wins. Same rules as
/// the server's Whoop parsing, so the two sources agree on what a night is.
func mainSleepSessions(_ intervals: [SleepInterval], calendar: Calendar) -> [String: (start: Date, end: Date, seconds: TimeInterval)] {
    var sessions: [(start: Date, end: Date, seconds: TimeInterval)] = []
    for i in mergeOverlapping(intervals) {
        if let last = sessions.last, i.start.timeIntervalSince(last.end) <= sleepSessionGap {
            sessions[sessions.count - 1].end = i.end
            sessions[sessions.count - 1].seconds += i.end.timeIntervalSince(i.start)
        } else {
            sessions.append((i.start, i.end, i.end.timeIntervalSince(i.start)))
        }
    }
    var byDate: [String: (start: Date, end: Date, seconds: TimeInterval)] = [:]
    for s in sessions {
        let key = dayKey(s.end, calendar: calendar)
        if (byDate[key]?.seconds ?? -1) < s.seconds { byDate[key] = s }
    }
    return byDate
}

/// Minutes asleep per wake-up date; see mainSleepSessions.
public func mainSleepByDate(_ intervals: [SleepInterval], calendar: Calendar) -> [String: Int] {
    mainSleepSessions(intervals, calendar: calendar).mapValues { Int(($0.seconds / 60).rounded()) }
}

/// "2026-10-02" for `date` in `calendar`'s time zone.
public func dayKey(_ date: Date, calendar: Calendar) -> String {
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}

// MARK: Stages

/// Health's sleep values, minus "in bed" (it overlaps the rest).
public enum SleepStage: Sendable {
    case awake, light, deep, rem, unspecified

    var isAsleep: Bool { self != .awake }
}

/// One Health sleep sample and the app or device that wrote it.
public struct SleepSample: Equatable, Sendable {
    public let start: Date
    public let end: Date
    public let stage: SleepStage
    public let source: String

    public init(start: Date, end: Date, stage: SleepStage, source: String) {
        self.start = start
        self.end = end
        self.stage = stage
        self.source = source
    }
}

/// How one night went, for POST /api/v1/health. Nil fields are left out.
public struct SleepDetail: Codable, Equatable, Sendable {
    public var device: String?
    public var bedtime: String?
    public var wakeTime: String?
    public var deepMin: Int?
    public var remMin: Int?
    public var lightMin: Int?
    public var awakeMin: Int?
    public var awakenings: Int?

    public init(device: String? = nil, bedtime: String? = nil, wakeTime: String? = nil, deepMin: Int? = nil, remMin: Int? = nil, lightMin: Int? = nil, awakeMin: Int? = nil, awakenings: Int? = nil) {
        self.device = device
        self.bedtime = bedtime
        self.wakeTime = wakeTime
        self.deepMin = deepMin
        self.remMin = remMin
        self.lightMin = lightMin
        self.awakeMin = awakeMin
        self.awakenings = awakenings
    }
}

public struct SleepNight: Equatable, Sendable {
    public let minutes: Int
    public let detail: SleepDetail
}

/// The main sleep per wake-up date, with its stages. Minutes merge every
/// source, like mainSleepByDate. Stages come from one source only, the one
/// that staged the most of the night: a Watch and a Garmin both writing REM
/// for the same hours would otherwise count it twice.
public func sleepNightsByDate(_ samples: [SleepSample], calendar: Calendar) -> [String: SleepNight] {
    let asleep = samples.filter(\.stage.isAsleep).map { SleepInterval(start: $0.start, end: $0.end) }
    return mainSleepSessions(asleep, calendar: calendar).mapValues { session in
        var detail = SleepDetail(
            bedtime: clockTime(session.start, calendar: calendar),
            wakeTime: clockTime(session.end, calendar: calendar)
        )
        var bySource: [String: [SleepStage: TimeInterval]] = [:]
        var awakenings: [String: Int] = [:]
        for s in samples {
            let overlap = min(s.end, session.end).timeIntervalSince(max(s.start, session.start))
            guard overlap > 0 else { continue }
            bySource[s.source, default: [:]][s.stage, default: 0] += overlap
            if s.stage == .awake { awakenings[s.source, default: 0] += 1 }
        }
        let staged = { (t: [SleepStage: TimeInterval]) in (t[.light] ?? 0) + (t[.deep] ?? 0) + (t[.rem] ?? 0) }
        // Ties go to the alphabetically first source, so a re-sync picks the same one.
        let best = bySource.filter { staged($0.value) > 0 }.max { a, b in
            staged(a.value) != staged(b.value) ? staged(a.value) < staged(b.value) : a.key > b.key
        }
        if let (source, t) = best {
            let minutes = { (stage: SleepStage) in Int(((t[stage] ?? 0) / 60).rounded()) }
            detail.device = String(source.prefix(80))
            detail.deepMin = minutes(.deep)
            detail.remMin = minutes(.rem)
            detail.lightMin = minutes(.light)
            detail.awakeMin = minutes(.awake)
            detail.awakenings = awakenings[source] ?? 0
        }
        return SleepNight(minutes: Int((session.seconds / 60).rounded()), detail: detail)
    }
}

/// "23:10" for `date` in `calendar`'s time zone.
func clockTime(_ date: Date, calendar: Calendar) -> String {
    let c = calendar.dateComponents([.hour, .minute], from: date)
    return String(format: "%02d:%02d", c.hour!, c.minute!)
}
