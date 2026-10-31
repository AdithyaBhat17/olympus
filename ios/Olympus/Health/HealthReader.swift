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

    static let heartRate = HKQuantityType(.heartRate)

    /// Types whose new samples wake the app. Heart rate isn't one: it's written
    /// all day, and session HR rides along on the syncs these trigger.
    static let workout = HKObjectType.workoutType()

    static let sampleTypes: [HKSampleType] = [protein, water, sleep, hrv, restingHr, workout]
    static let readTypes: Set<HKObjectType> = Set(sampleTypes + [heartRate])

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Shows the Health permission sheet the first time. iOS never tells an app
    /// whether read access was granted (a denied type just reads as empty).
    func requestAuthorization() async throws {
        try await store.requestAuthorization(toShare: [], read: Self.readTypes)
    }

    /// True when a type was added since the athlete last saw the sheet (an app
    /// update), so it's worth showing again.
    func hasUnaskedTypes() async -> Bool {
        (try? await store.statusForAuthorizationRequest(toShare: [], read: Self.readTypes)) == .shouldRequest
    }

    /// Per-minute heart rate between `start` and `end`, kept apart by the app
    /// or device that wrote it. Health's own per-minute statistics also unpack
    /// the series a Watch records during a workout.
    func heartRateMinutes(from start: Date, to end: Date) async throws -> [HeartRateMinute] {
        let query = HKStatisticsCollectionQueryDescriptor(
            predicate: .quantitySample(type: Self.heartRate, predicate: HKQuery.predicateForSamples(withStart: start, end: end)),
            options: [.discreteAverage, .discreteMax, .separateBySource],
            anchorDate: start,
            intervalComponents: DateComponents(minute: 1)
        )
        let unit = HKUnit.count().unitDivided(by: .minute())
        var out: [HeartRateMinute] = []
        try await query.result(for: store).enumerateStatistics(from: start, to: end) { stats, _ in
            for source in stats.sources ?? [] {
                guard let avg = stats.averageQuantity(for: source), let max = stats.maximumQuantity(for: source) else { continue }
                out.append(HeartRateMinute(source: source.name, avg: avg.doubleValue(for: unit), max: max.doubleValue(for: unit)))
            }
        }
        return out
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
        async let sleep = sleepSamples(from: start.addingTimeInterval(-18 * 3600), to: end)

        return try await HealthReadings(
            protein: protein,
            water: water,
            nights: sleepNightsByDate(sleep, calendar: calendar),
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

    /// Every sleep sample with its stage and the app that wrote it; "in bed"
    /// is left out. Overlaps between sources are handled in OlympusCore.
    private func sleepSamples(from start: Date, to end: Date) async throws -> [SleepSample] {
        let query = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: Self.sleep, predicate: HKQuery.predicateForSamples(withStart: start, end: end))],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        return try await query.result(for: store).compactMap { s in
            let stage: SleepStage
            switch HKCategoryValueSleepAnalysis(rawValue: s.value) {
            case .asleepCore: stage = .light
            case .asleepDeep: stage = .deep
            case .asleepREM: stage = .rem
            case .asleepUnspecified: stage = .unspecified
            case .awake: stage = .awake
            default: return nil
            }
            return SleepSample(start: s.startDate, end: s.endDate, stage: stage, source: s.sourceRevision.source.name)
        }
    }

    /// Every workout that started in [start, end), from any app or device.
    func workouts(from start: Date, to end: Date) async throws -> [HealthWorkout] {
        let query = HKSampleQueryDescriptor(
            predicates: [.workout(HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate))],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        return try await query.result(for: store).map { w in
            // Whichever distance the activity records (walking/running, cycling, swimming...).
            let distance = w.allStatistics.first { $0.key.identifier.hasPrefix("HKQuantityTypeIdentifierDistance") }?
                .value.sumQuantity()?.doubleValue(for: .meter())
            let kcal = w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
            return HealthWorkout(
                id: w.uuid.uuidString,
                activityType: Self.name(w.workoutActivityType),
                source: w.sourceRevision.source.name,
                start: w.startDate,
                end: w.endDate,
                distanceM: distance,
                activeKcal: kcal
            )
        }
    }

    /// Health's own name for the type, for Claude to read.
    static func name(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: "running"
        case .walking: "walking"
        case .hiking: "hiking"
        case .cycling: "cycling"
        case .swimming: "swimming"
        case .rowing: "rowing"
        case .elliptical: "elliptical"
        case .stairClimbing, .stairs: "stairs"
        case .highIntensityIntervalTraining: "hiit"
        case .mixedCardio: "mixedCardio"
        case .crossTraining: "crossTraining"
        case .functionalStrengthTraining: "functionalStrength"
        case .traditionalStrengthTraining: "strength"
        case .coreTraining: "core"
        case .yoga: "yoga"
        case .pilates: "pilates"
        case .flexibility: "flexibility"
        case .mindAndBody: "mindAndBody"
        case .cooldown: "cooldown"
        case .jumpRope: "jumpRope"
        case .boxing: "boxing"
        case .kickboxing: "kickboxing"
        case .martialArts: "martialArts"
        case .climbing: "climbing"
        case .cardioDance, .socialDance: "dance"
        case .soccer: "football"
        case .basketball: "basketball"
        case .tennis: "tennis"
        case .badminton: "badminton"
        case .squash: "squash"
        case .pickleball: "pickleball"
        case .cricket: "cricket"
        case .golf: "golf"
        case .paddleSports: "paddling"
        case .surfingSports: "surfing"
        case .snowSports, .downhillSkiing, .crossCountrySkiing, .snowboarding: "snowSports"
        default: "other"
        }
    }

    static func date(_ key: String, calendar: Calendar) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}
