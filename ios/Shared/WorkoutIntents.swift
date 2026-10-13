import AppIntents
import Foundation

// The Live Activity's rest buttons. Both targets compile these (the widget to
// draw the buttons), but iOS always performs a LiveActivityIntent in the app's
// process, so only the app's copy does anything.

struct AddRestIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Add 30 seconds of rest"
    static var isDiscoverable = false

    @Parameter(title: "Session")
    var sessionId: String

    init() {}
    init(sessionId: String) { self.sessionId = sessionId }

    func perform() async throws -> some IntentResult {
        #if !WIDGET_EXTENSION
        await WorkoutRestActions.add(30, sessionId: sessionId)
        #endif
        return .result()
    }
}

struct SkipRestIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip rest"
    static var isDiscoverable = false

    @Parameter(title: "Session")
    var sessionId: String

    init() {}
    init(sessionId: String) { self.sessionId = sessionId }

    func perform() async throws -> some IntentResult {
        #if !WIDGET_EXTENSION
        await WorkoutRestActions.skip(sessionId: sessionId)
        #endif
        return .result()
    }
}
