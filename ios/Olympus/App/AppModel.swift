import Foundation
import Observation
import OlympusCore
import SwiftUI

/// What every screen shares: sign-in, the API, the offline outbox, toasts.
@MainActor
@Observable
final class AppModel {
    let auth: Auth
    let api: API
    let outbox: Outbox
    let health: HealthSync

    /// Gym-floor writes saved on this phone, waiting for a connection.
    private(set) var pendingCount = 0
    /// Bumped after the outbox syncs (or anything else changes server data), so open screens reload.
    private(set) var dataVersion = 0
    var toast: Toast?

    struct Toast: Identifiable, Equatable {
        enum Kind { case info, error }
        let id = UUID()
        let text: String
        let kind: Kind
        var undo: (@MainActor () -> Void)?

        static func == (a: Toast, b: Toast) -> Bool { a.id == b.id }
    }

    private var flushTimer: Timer?

    init() {
        let auth = Auth()
        let api = API(auth: auth)
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.auth = auth
        self.api = api
        outbox = Outbox(fileURL: dir.appendingPathComponent("outbox.json"), executor: OutboxRunner(api: api))
        health = HealthSync(api: api)
        Task { await self.watchOutbox() }
    }

    private func watchOutbox() async {
        _ = await outbox.subscribe { [weak self] n in
            Task { @MainActor in self?.pendingChanged(n) }
        }
    }

    private func pendingChanged(_ n: Int) {
        pendingCount = n
        // While anything is queued, retry every 15 s (like the web's OfflineSync).
        if n > 0, flushTimer == nil {
            flushTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
                Task { @MainActor in await self?.flush() }
            }
        } else if n == 0 {
            flushTimer?.invalidate()
            flushTimer = nil
        }
    }

    /// Replay queued writes. Called on foreground, on a timer, and after sign-in.
    func flush() async {
        let report = await outbox.flush()
        if let first = report.rejected.first {
            let n = report.rejected.count
            show("Couldn't sync \(n) change\(n == 1 ? "" : "s"): \(first)", kind: .error)
        }
        if report.synced > 0 || !report.rejected.isEmpty { dataChanged() }
    }

    func dataChanged() { dataVersion += 1 }

    func show(_ text: String, kind: Toast.Kind = .info, undo: (@MainActor () -> Void)? = nil) {
        toast = Toast(text: text, kind: kind, undo: undo)
    }

    func show(_ error: Error) {
        // A screen closing mid-request isn't worth a toast.
        if error is CancellationError { return }
        show((error as? LocalizedError)?.errorDescription ?? error.localizedDescription, kind: .error)
    }

    /**
     * Optimistic write through the outbox (src/lib/offline/mutate.ts): apply
     * now, roll back if the server says no, toast if it's only saved locally.
     */
    @discardableResult
    func mutate(_ op: OutboxOp, apply: () -> Void = {}, rollback: @escaping () -> Void = {}, onOk: (Data) -> Void = { _ in }) async -> SendResult {
        apply()
        let result = await outbox.send(op)
        switch result {
        case let .ok(data): onOk(data)
        case let .rejected(message):
            rollback()
            show(message, kind: .error)
        case .queued:
            show("Saved on this phone. It syncs when you're back online.")
        }
        return result
    }

    func signedIn() async {
        await flush()
        dataChanged()
        // The phone's timezone, for an athlete who's never set one.
        struct TZ: Encodable { let timezone: String }
        try? await api.post("me/timezone", TZ(timezone: TimeZone.current.identifier))
        health.start()
    }

    func signOut() async {
        await auth.signOut()
        dataChanged()
    }
}
