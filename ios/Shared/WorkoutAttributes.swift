import ActivityKit
import Foundation

/// The live session on the Lock Screen and in the Dynamic Island. The app
/// starts and updates it (WorkoutActivity); the widget extension draws it.
/// Timers render from dates, so nothing has to update while a rest counts down.
struct WorkoutAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// The exercise being worked on; nil once everything is done.
        var exercise: String?
        /// "Set 2 of 4", "Warm-up W1", "All exercises done".
        var detail: String
        var doneCount: Int
        var total: Int
        /// The current rest, when one is running.
        var restStart: Date?
        var restEnd: Date?
        /// "Set 3" or the next exercise, for "Next up".
        var nextLabel: String?
    }

    var sessionId: String
    /// "Session A, Upper Push".
    var title: String
    var sessionType: String?
    var startedAt: Date

    /// Where a tap on the activity goes.
    var url: URL { URL(string: "olympus://session/\(sessionId)")! }
}
