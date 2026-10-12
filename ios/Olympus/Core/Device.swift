import SwiftUI
import UIKit

/// Gym-floor preferences (the web keeps them in localStorage `olympus.prefs`).
enum Prefs {
    static var haptics: Bool {
        get { UserDefaults.standard.object(forKey: "prefs.haptics") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "prefs.haptics") }
    }

    static var keepAwake: Bool {
        get { UserDefaults.standard.object(forKey: "prefs.keepAwake") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "prefs.keepAwake") }
    }
}

/// hapticTick / hapticRestEnd from src/lib/haptics.ts.
@MainActor
enum Haptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let notify = UINotificationFeedbackGenerator()

    /// Set logged, RPE picked, flag done, water +250, Let's go.
    static func tick() {
        guard Prefs.haptics else { return }
        light.impactOccurred()
    }

    /// Rest is up.
    static func restEnd() {
        guard Prefs.haptics else { return }
        notify.notificationOccurred(.success)
    }

    static func warning() {
        guard Prefs.haptics else { return }
        notify.notificationOccurred(.warning)
    }
}

/// Screen stays on during a live session (useWakeLock), if the athlete wants it.
struct KeepAwake: ViewModifier {
    func body(content: Content) -> some View {
        content
            .onAppear { UIApplication.shared.isIdleTimerDisabled = Prefs.keepAwake }
            .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }
}

extension View {
    func keepsScreenAwake() -> some View { modifier(KeepAwake()) }
}

/// Server dates: "2026-10-02" days and ISO 8601 instants.
enum Dates {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoNoFraction = ISO8601DateFormatter()

    static func instant(_ s: String?) -> Date? {
        guard let s else { return nil }
        return iso.date(from: s) ?? isoNoFraction.date(from: s)
    }

    /// Today in the device's zone, "2026-10-02".
    static func todayKey() -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    /// "07:12" for an instant in `timezone` (the athlete's, not the phone's).
    static func time(_ s: String?, timezone: String? = nil) -> String? {
        guard let d = instant(s) else { return nil }
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        if let tz = timezone.flatMap(TimeZone.init(identifier:)) { f.timeZone = tz }
        return f.string(from: d)
    }

    /// "just now", "5 min ago", "3 h ago", "2 d ago".
    static func ago(_ s: String?) -> String {
        guard let d = instant(s) else { return "never" }
        let sec = Int(Date().timeIntervalSince(d))
        if sec < 60 { return "just now" }
        if sec < 3600 { return "\(sec / 60) min ago" }
        if sec < 86400 { return "\(sec / 3600) h ago" }
        return "\(sec / 86400) d ago"
    }
}
