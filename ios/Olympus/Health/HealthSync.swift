import Foundation
import HealthKit
import Observation
import OlympusCore

/// Reads Apple Health and posts daily values to /api/v1/health, in the
/// background too. HRV and resting HR from Health outrank Whoop's on the
/// server (see upsertCheckIn); Whoop only fills days Health leaves empty.
@MainActor
@Observable
final class HealthSync {
    /// Most syncs: last night's sleep plus a couple of days of late logging.
    nonisolated static let recentDays = 3
    /// The server takes at most 31 days per request.
    nonisolated static let backfillDays = 31

    private let api: API
    private let reader = HealthReader()
    private let defaults = UserDefaults.standard

    private(set) var requested: Bool
    private(set) var isSyncing = false
    private(set) var lastSync: Date?
    private(set) var lastError: String?
    private(set) var lastNotice: String?

    private var current: Task<Void, Never>?
    private var observing = false

    init(api: API) {
        self.api = api
        requested = defaults.bool(forKey: "health.requested")
        lastSync = defaults.object(forKey: "health.lastSync") as? Date
    }

    var isAvailable: Bool { reader.isAvailable }
    var store: HKHealthStore { reader.store }

    /// Ask for access (first time shows the sheet), then backfill a month.
    func connect() async {
        do {
            try await reader.requestAuthorization()
            requested = true
            defaults.set(true, forKey: "health.requested")
            start()
            await sync(days: Self.backfillDays)
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// After an update adds a Health type (heart rate, for sessions), show the
    /// sheet once more. Foreground only: the sheet can't appear in the background.
    func askForNewTypes() async {
        guard requested, reader.isAvailable, await reader.hasUnaskedTypes() else { return }
        try? await reader.requestAuthorization()
    }

    /// Register background delivery. Must run on every launch, background ones
    /// included, for HealthKit to keep waking the app.
    func start() {
        guard requested, reader.isAvailable, !observing else { return }
        observing = true
        for type in HealthReader.sampleTypes {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, error in
                guard error == nil, let self else { return completion() }
                Task { @MainActor in
                    await self.sync(days: Self.recentDays, quietly: true)
                    completion()
                }
            }
            reader.store.execute(query)
            reader.store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }

    /// One sync at a time; the observers all fire together at launch.
    func sync(days: Int = recentDays, quietly: Bool = false) async {
        if let current { return await current.value }
        if quietly, let lastSync, Date().timeIntervalSince(lastSync) < 60 { return }
        guard requested, api.auth.isSignedIn else { return }
        let task = Task { await run(days: days, quietly: quietly) }
        current = task
        await task.value
        current = nil
    }

    private struct Saved: Decodable {}

    private func run(days: Int, quietly: Bool) async {
        isSyncing = true
        lastNotice = nil
        defer { isSyncing = false }
        do {
            let cal = Calendar.current
            let dates = recentDates(count: days, calendar: cal)
            let payload = buildDays(dates: dates, readings: try await reader.readings(for: dates, calendar: cal))
            if !payload.isEmpty { try await api.post("health", IngestPayload(days: payload)) }
            // Extra, not the point of the sync: a failure here (an older server
            // without the route) mustn't hide that the days went through.
            try? await syncSessionHeartRate(days: days)
            try? await syncActivities(from: dates.first, calendar: cal)
            lastSync = Date()
            lastError = nil
            lastNotice = payload.isEmpty ? "Nothing in Health for the last \(days) days yet." : nil
            defaults.set(lastSync, forKey: "health.lastSync")
        } catch let error as HKError where error.code == .errorDatabaseInaccessible {
            // Health is encrypted while the phone is locked; the next wake retries.
            if !quietly { lastError = "Unlock your iPhone to read Health." }
        } catch {
            if !quietly { lastError = error.localizedDescription }
        }
    }

    /// Heart rate for each recent finished session, read from Health over its
    /// window. Re-sent every sync: a Garmin can land its HR hours later.
    private func syncSessionHeartRate(days: Int) async throws {
        let windows: SessionWindows = try await api.get("sessions/heart-rate", query: ["days": String(days)])
        var out: [SessionHeartRate] = []
        for w in windows.sessions {
            let minutes = try await reader.heartRateMinutes(from: w.start, to: w.end)
            if let hr = sessionHeartRate(id: w.id, minutes: minutes) { out.append(hr) }
        }
        if !out.isEmpty { try await api.post("sessions/heart-rate", SessionHeartRates(sessions: out)) }
    }

    /// Every Health workout since the first synced day, one copy per piece of
    /// training, each with HR from its window. The server replaces that range,
    /// so a workout deleted in Health goes away here too.
    private func syncActivities(from first: String?, calendar: Calendar) async throws {
        guard let first, let start = HealthReader.date(first, calendar: calendar) else { return }
        let workouts = distinctWorkouts(try await reader.workouts(from: start, to: Date()))
        var out: [ActivityPayload] = []
        for w in workouts {
            let hr = sessionHeartRate(id: w.id, minutes: try await reader.heartRateMinutes(from: w.start, to: w.end))
            out.append(ActivityPayload(w, heartRate: hr))
        }
        try await api.post("activities", ActivitiesPayload(from: start, activities: out))
    }

    #if DEBUG
    func seedSampleData() async {
        do {
            try await DebugSeed.run(store: reader.store)
            await sync(days: Self.recentDays)
        } catch {
            lastError = error.localizedDescription
        }
    }
    #endif
}
