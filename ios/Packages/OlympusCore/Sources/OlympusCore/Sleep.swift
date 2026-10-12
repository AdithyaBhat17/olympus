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

/// Minutes asleep per wake-up date (yyyy-MM-dd in `calendar`'s time zone):
/// last night's sleep belongs to today. Stretches less than an hour apart are
/// one sleep; when a date has several (a nap), the longest wins. Same rules as
/// the server's Whoop parsing, so the two sources agree on what a night is.
public func mainSleepByDate(_ intervals: [SleepInterval], calendar: Calendar) -> [String: Int] {
    var sessions: [(end: Date, seconds: TimeInterval)] = []
    var lastEnd: Date?
    for i in mergeOverlapping(intervals) {
        if let end = lastEnd, i.start.timeIntervalSince(end) <= sleepSessionGap, !sessions.isEmpty {
            sessions[sessions.count - 1].end = i.end
            sessions[sessions.count - 1].seconds += i.end.timeIntervalSince(i.start)
        } else {
            sessions.append((i.end, i.end.timeIntervalSince(i.start)))
        }
        lastEnd = i.end
    }
    var byDate: [String: Int] = [:]
    for s in sessions {
        let key = dayKey(s.end, calendar: calendar)
        let minutes = Int((s.seconds / 60).rounded())
        byDate[key] = max(byDate[key] ?? 0, minutes)
    }
    return byDate
}

/// "2026-10-02" for `date` in `calendar`'s time zone.
public func dayKey(_ date: Date, calendar: Calendar) -> String {
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}
