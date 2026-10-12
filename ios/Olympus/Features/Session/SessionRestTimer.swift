import OlympusCore
import SwiftUI
import UserNotifications

/// One rest between sets (timers.tsx RestState).
struct RestState: Codable, Equatable {
    var endAt: Date
    var totalSec: Double
    var label: String
}

/// The rest timer's persistence and its "Rest's up" local notification.
/// The web asks its server to push at endAt; here the phone schedules it.
enum RestTimer {
    /// AppDelegate hides this one while the app is on screen.
    static let notificationId = "olympus-rest"

    private static func key(_ sessionId: String) -> String { "olympus.rest.\(sessionId)" }

    /// Survives app restarts; a timer that ended more than 2 s ago comes back idle.
    static func load(_ sessionId: String) -> RestState? {
        guard let data = UserDefaults.standard.data(forKey: key(sessionId)),
              let v = try? JSONDecoder().decode(RestState.self, from: data) else { return nil }
        if Date().timeIntervalSince(v.endAt) > 2 { return nil }
        return v
    }

    static func save(_ sessionId: String, _ rest: RestState?) {
        if let rest, let data = try? JSONEncoder().encode(rest) {
            UserDefaults.standard.set(data, forKey: key(sessionId))
        } else {
            UserDefaults.standard.removeObject(forKey: key(sessionId))
        }
    }

    /// Clear everything about a session's rest: the saved timer and any pending notification.
    static func clear(_ sessionId: String) {
        save(sessionId, nil)
        cancelNotification()
    }

    /// Schedule "Rest's up" at `endAt` (asks for permission the first time).
    static func scheduleNotification(endAt: Date, nextLabel: String?) {
        let delay = endAt.timeIntervalSinceNow
        guard delay > 1 else {
            cancelNotification()
            return
        }
        let body = nextLabel.map { "Next up: \($0)" } ?? "Time for the next set"
        Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            switch settings.authorizationStatus {
            case .notDetermined:
                guard (try? await center.requestAuthorization(options: [.alert, .sound])) == true else { return }
            case .denied:
                return
            default:
                break
            }
            let content = UNMutableNotificationContent()
            content.title = "Rest's up"
            content.body = body
            content.sound = .default
            let remaining = endAt.timeIntervalSinceNow
            guard remaining > 0.5 else { return }
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: remaining, repeats: false)
            // Same identifier replaces any earlier rest.
            try? await center.add(UNNotificationRequest(identifier: notificationId, content: content, trigger: trigger))
        }
    }

    static func cancelNotification() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [notificationId])
        center.removeDeliveredNotifications(withIdentifiers: [notificationId])
    }
}

/// "24:10" since `startedAt`, ticking every second.
struct SessionElapsed: View {
    let startedAt: String?

    var body: some View {
        if let start = Dates.instant(startedAt) {
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                Text(Self.format(ctx.date.timeIntervalSince(start)))
                    .monospacedDigit()
            }
        } else {
            Text("0:00")
        }
    }

    static func format(_ sec: Double) -> String {
        let s = clock(sec)
        // "04:10" → "4:10", like the web's replace(/^0(\d)/).
        if s.hasPrefix("0"), s.count > 1, s[s.index(after: s.startIndex)].isNumber { return String(s.dropFirst()) }
        return s
    }
}

/// Floating rest pill in the thumb zone (timers.tsx RestPill). The ring drains
/// linearly; the last 10 s turn berry with "Get set". At 0: haptic, then idle.
struct RestPill: View {
    let rest: RestState?
    let nextLabel: String?
    let onAdd: (Double) -> Void
    let onSkip: () -> Void

    private static let getSetSec: Double = 10

    var body: some View {
        Group {
            if let rest {
                TimelineView(.periodic(from: .now, by: 0.25)) { ctx in
                    active(rest, now: ctx.date)
                }
                .id(rest.endAt.timeIntervalSince1970 - rest.totalSec)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                idle
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 10)
        .animation(.spring(duration: 0.45, bounce: 0.25), value: rest == nil)
        .task(id: rest) { await watchEnd() }
    }

    /// Rest end: buzz once (if the app is on screen at the time), then go idle 2.5 s later.
    private func watchEnd() async {
        guard let rest else { return }
        let wait = rest.endAt.timeIntervalSinceNow
        if wait > 0 {
            try? await Task.sleep(for: .seconds(wait))
            if Task.isCancelled { return }
        }
        // Don't buzz for a timer that ran out while we weren't looking.
        if Date().timeIntervalSince(rest.endAt) < 5 { Haptics.restEnd() }
        try? await Task.sleep(for: .seconds(2.5))
        if Task.isCancelled { return }
        onSkip()
    }

    private func active(_ rest: RestState, now: Date) -> some View {
        let remaining = max(0, rest.endAt.timeIntervalSince(now))
        let finished = remaining <= 0
        let getSet = remaining > 0 && remaining <= Self.getSetSec
        let frac = rest.totalSec > 0 ? min(1, remaining / rest.totalSec) : 0
        let tint = getSet || finished ? SessionPalette.info : Color.coral
        let title = finished ? "Rest is up. Go!" : getSet ? "Get set. Next up: \(nextLabel ?? "next set")" : rest.label

        return HStack(spacing: 12) {
            ZStack {
                Circle().stroke(Color.surface3, lineWidth: 5)
                Circle()
                    .trim(from: 0, to: frac)
                    .stroke(tint, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 0.25), value: frac)
            }
            .frame(width: 44, height: 44)
            .padding(4)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(getSet || finished ? SessionPalette.info : Color.muted)
                    .lineLimit(1)
                Text(shortClock(remaining))
                    .font(.num(30))
                    .monospacedDigit()
                    .foregroundStyle(Color.fg)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Rest timer, \(shortClock(remaining)) left. \(title)")

            Button { onAdd(30) } label: {
                Text("+30")
                    .font(.system(size: 15, weight: .bold))
                    .frame(minWidth: 56, minHeight: 52)
                    .background(Color.surface, in: Capsule())
                    .foregroundStyle(Color.fg)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add 30 seconds")

            Button(action: onSkip) {
                Text("Skip")
                    .font(.system(size: 15, weight: .bold))
                    .frame(minWidth: 64, minHeight: 52)
                    .background(Color.fg, in: Capsule())
                    .foregroundStyle(Color.bg)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Skip rest")
        }
        .padding(.leading, 12)
        .padding(.trailing, 10)
        .frame(height: 76)
        .frame(maxWidth: 480)
        .background(.ultraThinMaterial, in: Capsule())
        .background(Color.surface.opacity(0.82), in: Capsule())
        .shadow(color: .black.opacity(0.12), radius: 18, y: 8)
    }

    private var idle: some View {
        HStack(spacing: 8) {
            Image(systemName: "timer")
                .font(.system(size: 14, weight: .semibold))
            Text("Rest starts the moment you tick a set")
                .font(.system(size: 13))
        }
        .foregroundStyle(Color.muted)
        .frame(maxWidth: 480)
        .frame(height: 56)
        .background(.ultraThinMaterial, in: Capsule())
        .background(Color.surface.opacity(0.7), in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Rest timer idle. Rest starts the moment you tick a set")
    }
}
