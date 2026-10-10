import OlympusCore
import SwiftUI

/// Presented full screen over the tabs: the live session, and its finish /
/// summary screen on top. Opens straight on the summary when asked (from the
/// log) or when the session turns out to be done already.
struct SessionFlow: View {
    let route: Router.SessionRoute

    @Environment(AppModel.self) private var model
    @State private var showSummary: Bool
    /// The live screen loads only once it's needed (not when opened on a done session's summary).
    @State private var liveMounted: Bool

    init(route: Router.SessionRoute) {
        self.route = route
        _showSummary = State(initialValue: route.summary)
        _liveMounted = State(initialValue: !route.summary)
    }

    var body: some View {
        ZStack {
            Color.bg.ignoresSafeArea()
            if liveMounted {
                Loadable(load: { try await model.api.get("sessions/\(route.id)", as: LiveSessionScreen.self) }) { screen, reload in
                    if screen.view.status == .done {
                        SessionFinishView(sessionId: route.id, onBackToSession: {})
                    } else {
                        SessionLiveView(screen: screen, reload: reload, onFinish: openSummary)
                    }
                }
            }
            if showSummary {
                SessionFinishView(sessionId: route.id, onBackToSession: backToSession)
                    .transition(.move(edge: .trailing))
                    .zIndex(1)
            }
        }
    }

    private func openSummary() {
        withAnimation(.spring(duration: 0.4, bounce: 0.1)) { showSummary = true }
    }

    private func backToSession() {
        liveMounted = true
        withAnimation(.spring(duration: 0.4, bounce: 0.1)) { showSummary = false }
    }
}
