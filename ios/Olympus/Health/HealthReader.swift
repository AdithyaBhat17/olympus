import Foundation
import HealthKit
import OlympusCore

/// Everything the app reads from Health. Read-only: it never writes.
final class HealthReader {
    let store = HKHealthStore()

    static let protein = HKQuantityType(.dietaryProtein)
    static let water = HKQuantityType(.dietaryWater)
    static let sleep = HKCategoryType(.sleepAnalysis)
    static let hrv = HKQuantityType(.heartRateVariabilitySDNN)
    static let restingHr = HKQuantityType(.restingHeartRate)

    static let sampleTypes: [HKSampleType] = [protein, water, sleep, hrv, restingHr]

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Shows the Health permission sheet the first time. iOS never tells an app
    /// whether read access was granted (a denied type just reads as empty).
    func requestAuthorization() async throws {
        try await store.requestAuthorization(toShare: [], read: Set(Self.sampleTypes))
    }

    /// Daily values for `dates` (yyyy-MM-dd, oldest first) in `calendar`'s zone.
    func readings(for dates: [String], calendar: Calendar) async throws -> HealthReadings {
        guard let first = dates.first, let start = Self.date(first, calendar: calendar) else { return HealthReadings() }
        let end = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: Date()))!

        async let protein = daily(Self.protein, .cumulativeSum, unit: .gram(), from: start, to: end, calendar: calendar)
        async let water = daily(Self.water, .cumulativeSum, unit: .literUnit(with: .milli), from: start, to: end, calendar: calendar)
        async let hrv = daily(Self.hrv, .discreteAverage, unit: .secondUnit(with: .milli), from: start, to: end, calendar: calendar)
        async let rhr = daily(Self.restingHr, .discreteAverage, unit: .count().unitDivided(by: .minute()), from: start, to: end, calendar: calendar)
        // The first night starts the evening before the first date.
        async let sleep = sleepIntervals(from: start.addingTimeInterval(-18 * 3600), to: end)

        return try await HealthReadings(
            protein: protein,
            water: water,
            sleep: mainSleepByDate(sleep, calendar: calendar),
            hrv: hrv,
            restingHr: rhr
        )
    }

    /// One statistic per calendar day. Health already de-duplicates sources for
    /// sums (a Watch and a phone counting the same water once).
    private func daily(
        _ type: HKQuantityType,
        _ options: HKStatisticsOptions,
        unit: HKUnit,
        from start: Date,
        to end: Date,
        calendar: Calendar
    ) async throws -> [String: Double] {
        let query = HKStatisticsCollectionQueryDescriptor(
            predicate: .quantitySample(type: type, predicate: HKQuery.predicateForSamples(withStart: start, end: end)),
            options: options,
            anchorDate: calendar.startOfDay(for: start),
            intervalComponents: DateComponents(day: 1)
        )
        let collection = try await query.result(for: store)
        var out: [String: Double] = [:]
        collection.enumerateStatistics(from: start, to: end) { stats, _ in
            let q = options.contains(.cumulativeSum) ? stats.sumQuantity() : stats.averageQuantity()
            if let q { out[dayKey(stats.startDate, calendar: calendar)] = q.doubleValue(for: unit) }
        }
        return out
    }

    /// Every "asleep" sample (core, deep, REM, unspecified); "in bed" and
    /// "awake" are left out. Overlaps between sources are merged in SyncCore.
    private func sleepIntervals(from start: Date, to end: Date) async throws -> [SleepInterval] {
        let query = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: Self.sleep, predicate: HKQuery.predicateForSamples(withStart: start, end: end))],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let asleep = HKCategoryValueSleepAnalysis.allAsleepValues.map(\.rawValue)
        return try await query.result(for: store)
            .filter { asleep.contains($0.value) }
            .map { SleepInterval(start: $0.startDate, end: $0.endDate) }
    }

    private static func date(_ key: String, calendar: Calendar) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}
