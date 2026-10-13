import ActivityKit
import Foundation
import OlympusCore

/// Starts, updates and ends the workout Live Activity. Only one runs at a
/// time: starting another session ends the previous one's.
@MainActor
enum WorkoutActivity {
    /// Sessions ended this launch: a live view still on screen for a moment
    /// after finish or discard mustn't start their activity again.
    private static var ended: Set<String> = []
    /// What each activity was last sent. Updates run in Tasks, so the
    /// activity's own content can lag behind and isn't safe to compare against.
    private static var sent: [String: WorkoutAttributes.ContentState] = [:]

    static func update(_ attributes: WorkoutAttributes, _ state: WorkoutAttributes.ContentState) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled, !ended.contains(attributes.sessionId) else { return }
        // Stale once the rest runs out, so the widget can say "Rest's up"
        // without the app (possibly suspended) having to wake for it.
        let content = ActivityContent(state: state, staleDate: state.restEnd)
        var current: Activity<WorkoutAttributes>?
        for activity in Activity<WorkoutAttributes>.activities {
            if activity.attributes.sessionId == attributes.sessionId, current == nil {
                current = activity
            } else {
                Task { await activity.end(nil, dismissalPolicy: .immediate) }
            }
        }
        if let current {
            guard sent[attributes.sessionId] != state else { return }
            sent[attributes.sessionId] = state
            Task { await current.update(content) }
        } else if (try? Activity.request(attributes: attributes, content: content)) != nil {
            sent[attributes.sessionId] = state
        }
    }

    /// Record a state the activity was given outside `update` (the rest buttons).
    fileprivate static func didSend(_ sessionId: String, _ state: WorkoutAttributes.ContentState) {
        sent[sessionId] = state
    }

    /// End the session's activity (finished, discarded or deleted). Use
    /// RestTimer.sessionEnded, which also clears the session's rest.
    static func end(_ sessionId: String) {
        ended.insert(sessionId)
        sent[sessionId] = nil
        for activity in Activity<WorkoutAttributes>.activities where activity.attributes.sessionId == sessionId {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
    }

    /// End activities for sessions finished or deleted elsewhere (the web,
    /// another phone). Run when the app comes to the foreground.
    static func reconcile(_ api: API) async {
        for activity in Activity<WorkoutAttributes>.activities {
            let id = activity.attributes.sessionId
            do {
                let screen = try await api.get("sessions/\(id)", as: LiveSessionScreen.self)
                if screen.view.status == .done { RestTimer.sessionEnded(id) }
            } catch let error as APIError where error.status == 404 {
                RestTimer.sessionEnded(id)
            } catch {
                // Offline or a server hiccup: keep it; the next foreground checks again.
            }
        }
    }
}

/// The Live Activity's "+30" and "Skip" (WorkoutIntents), run in the app even
/// when it's in the background. They change the saved rest the same way the
/// rest pill does, then tell an open live session to pick it up.
@MainActor
enum WorkoutRestActions {
    /// Posted with the session id as the object.
    static let restChanged = Notification.Name("olympus.restChanged")

    static func add(_ sec: Double, sessionId: String) async {
        await apply(RestState.adding(sec, to: RestTimer.load(sessionId)), sessionId: sessionId)
    }

    static func skip(sessionId: String) async {
        await apply(nil, sessionId: sessionId)
    }

    private static func apply(_ rest: RestState?, sessionId: String) async {
        RestTimer.save(sessionId, rest)
        let activity = Activity<WorkoutAttributes>.activities.first { $0.attributes.sessionId == sessionId }
        if let rest {
            RestTimer.scheduleNotification(endAt: rest.endAt, nextLabel: activity?.content.state.nextLabel)
        } else {
            RestTimer.cancelNotification()
        }
        if let activity {
            var state = activity.content.state
            state.restStart = rest.map { $0.endAt.addingTimeInterval(-$0.totalSec) }
            state.restEnd = rest?.endAt
            WorkoutActivity.didSend(sessionId, state)
            await activity.update(ActivityContent(state: state, staleDate: state.restEnd))
        }
        NotificationCenter.default.post(name: restChanged, object: sessionId)
    }
}

#if DEBUG
extension WorkoutActivity {
    private static var demoStarted = false

    /// Run with `-demoLiveActivity` to see the activity mid-rest without a server.
    /// Once per launch, so coming back to the app doesn't reset the rest.
    static func startDemoIfAsked() {
        guard !demoStarted, ProcessInfo.processInfo.arguments.contains("-demoLiveActivity") else { return }
        demoStarted = true
        let now = Date()
        RestTimer.save("demo", RestState(endAt: now.addingTimeInterval(90), totalSec: 120, label: "Rest"))
        update(
            WorkoutAttributes(sessionId: "demo", title: "Session A, Upper Push", sessionType: "A", startedAt: now.addingTimeInterval(-24 * 60)),
            WorkoutAttributes.ContentState(
                exercise: "Incline Dumbbell Press", detail: "Set 3 of 4", doneCount: 2, total: 6,
                restStart: now.addingTimeInterval(-30), restEnd: now.addingTimeInterval(90), nextLabel: "set 3"
            )
        )
    }
}
#endif
