#if DEBUG
import HealthKit

/// Debug builds only: writes three days of realistic samples so the Simulator
/// (whose Health is empty) can exercise the whole read → POST path. Release
/// builds never ask for write access.
enum DebugSeed {
    static func run(store: HKHealthStore) async throws {
        let types: Set<HKSampleType> = [HealthReader.protein, HealthReader.water, HealthReader.sleep, HealthReader.hrv, HealthReader.restingHr]
        try await store.requestAuthorization(toShare: types, read: [])

        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        var samples: [HKSample] = []
        for daysAgo in 0..<3 {
            let day = cal.date(byAdding: .day, value: -daysAgo, to: today)!
            let at = { (h: Int, m: Int) in cal.date(bySettingHour: h, minute: m, second: 0, of: day)! }
            let prev = { (h: Int, m: Int) in at(h, m).addingTimeInterval(-86_400) }

            func qty(_ type: HKQuantityType, _ value: Double, _ unit: HKUnit, _ date: Date) -> HKQuantitySample {
                HKQuantitySample(type: type, quantity: HKQuantity(unit: unit, doubleValue: value), start: date, end: date)
            }
            func sleep(_ value: HKCategoryValueSleepAnalysis, _ start: Date, _ end: Date) -> HKCategorySample {
                HKCategorySample(type: HealthReader.sleep, value: value.rawValue, start: start, end: end)
            }

            samples += [
                qty(HealthReader.protein, 60, .gram(), at(8, 0)),
                qty(HealthReader.protein, 80.4 - Double(daysAgo * 10), .gram(), at(13, 0)),
                qty(HealthReader.water, 1200, .literUnit(with: .milli), at(9, 0)),
                qty(HealthReader.water, 1200 + Double(daysAgo * 300), .literUnit(with: .milli), at(15, 0)),
                // 23:00–02:00 + 02:20–06:30 asleep = 6h 50m. "In bed" overlaps and must not count.
                sleep(.inBed, prev(22, 40), at(6, 45)),
                sleep(.asleepCore, prev(23, 0), at(2, 0)),
                sleep(.asleepREM, at(2, 20), at(6, 30)),
                qty(HealthReader.hrv, 45 + Double(daysAgo), .secondUnit(with: .milli), at(3, 0)),
                qty(HealthReader.hrv, 51 + Double(daysAgo), .secondUnit(with: .milli), at(5, 0)),
                qty(HealthReader.restingHr, 55 + Double(daysAgo), .count().unitDivided(by: .minute()), at(7, 0)),
            ]
        }
        try await store.save(samples)
    }
}
#endif
