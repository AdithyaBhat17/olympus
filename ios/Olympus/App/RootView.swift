import OlympusCore
import SwiftUI
import UIKit

enum Tab: Hashable, CaseIterable {
    case today, log, progress, library

    var icon: String {
        switch self {
        case .today: "sun.max.fill"
        case .log: "list.bullet.rectangle.fill"
        case .progress: "chart.line.uptrend.xyaxis"
        case .library: "books.vertical.fill"
        }
    }

    var label: String {
        switch self {
        case .today: "Today"
        case .log: "Log"
        case .progress: "Progress"
        case .library: "Library"
        }
    }
}

/// What's presented over the tabs: the live session (and its finish screen) and form cues.
@MainActor
@Observable
final class Router {
    var tab: Tab = .today
    /// A session to show full screen: live, or its summary when done.
    var session: SessionRoute?
    var formCue: FormCueRoute?

    struct SessionRoute: Identifiable, Hashable {
        let id: String
        var summary = false
    }

    struct FormCueRoute: Identifiable, Hashable {
        let cue: String
        var exerciseId: String?
        var id: String { cue + (exerciseId ?? "") }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var router = Router()

    var body: some View {
        Group {
            if model.auth.isSignedIn {
                MainTabs()
                    .environment(router)
                    .task { await model.signedIn() }
            } else {
                SignInView()
            }
        }
        .overlay(alignment: .top) { ToastOverlay() }
    }
}

struct MainTabs: View {
    @Environment(Router.self) private var router
    @State private var keyboardUp = false

    var body: some View {
        @Bindable var router = router
        ZStack(alignment: .bottom) {
            // All four stay alive, so switching tabs keeps each one's data and
            // scroll position (and never re-fetches into an error when offline).
            ZStack {
                tab(.today) { TodayView() }
                tab(.log) { HistoryView() }
                tab(.progress) { ProgressListView() }
                tab(.library) { LibraryView() }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.bg.ignoresSafeArea())
            .overlay(alignment: .top) { StatusBarScrim() }

            // Out of the way while typing, like system tab bars (it would ride up on the keyboard).
            if !keyboardUp {
                TabPill(selection: $router.tab)
                    .padding(.bottom, 8)
                    .transition(.opacity)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            withAnimation(.easeOut(duration: 0.15)) { keyboardUp = true }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            withAnimation(.easeOut(duration: 0.2)) { keyboardUp = false }
        }
        .fullScreenCover(item: $router.session) { route in
            SessionFlow(route: route)
        }
        .sheet(item: $router.formCue) { route in
            FormCueView(route: route)
        }
    }
}

extension MainTabs {
    private func tab<Content: View>(_ t: Tab, @ViewBuilder _ content: () -> Content) -> some View {
        let on = router.tab == t
        return NavigationStack { content() }
            .opacity(on ? 1 : 0)
            .allowsHitTesting(on)
            .accessibilityHidden(!on)
    }
}

/// The floating dark pill from src/components/bottom-nav.tsx: four icon tabs,
/// a white capsule that springs to the active one.
struct TabPill: View {
    @Binding var selection: Tab
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases, id: \.self) { tab in
                Button {
                    Haptics.tick()
                    withAnimation(.spring(duration: 0.5, bounce: 0.25)) { selection = tab }
                } label: {
                    Image(systemName: tab.icon)
                        .font(.system(size: 20, weight: .semibold))
                        .frame(width: 66, height: 52)
                        .foregroundStyle(selection == tab ? Color.fg : Color.white.opacity(0.7))
                        .background {
                            if selection == tab {
                                Capsule().fill(.white).matchedGeometryEffect(id: "pill", in: ns)
                            }
                        }
                }
                .accessibilityLabel(tab.label)
                .accessibilityAddTraits(selection == tab ? .isSelected : [])
            }
        }
        .padding(6)
        .background(Color.fg, in: Capsule())
        .shadow(color: .black.opacity(0.18), radius: 18, y: 8)
    }
}

/// Content scrolls under the status bar (the tab pages hide the nav bar to
/// draw the web's big headers), so fade it out behind the clock.
struct StatusBarScrim: View {
    var body: some View {
        GeometryReader { g in
            LinearGradient(
                stops: [.init(color: .bg, location: 0), .init(color: .bg, location: 0.6), .init(color: .bg.opacity(0), location: 1)],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: g.safeAreaInsets.top + 14)
            .ignoresSafeArea(edges: .top)
        }
        .frame(height: 0)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Space at the bottom of tab pages so content clears the floating tab bar.
extension View {
    func tabClearance() -> some View { safeAreaPadding(.bottom, 88) }
}

struct ToastOverlay: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if let toast = model.toast {
            HStack(spacing: 12) {
                Image(systemName: toast.kind == .error ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(toast.kind == .error ? Color.danger : Color.coral)
                Text(toast.text)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.fg)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if let undo = toast.undo {
                    Button("Undo") {
                        undo()
                        model.toast = nil
                    }
                    .font(.system(size: 15, weight: .bold))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
            .padding(.horizontal, 16)
            .transition(.move(edge: .top).combined(with: .opacity))
            .task(id: toast.id) {
                try? await Task.sleep(for: .seconds(toast.undo == nil ? 3 : 4))
                withAnimation { if model.toast?.id == toast.id { model.toast = nil } }
            }
            .onTapGesture { withAnimation { model.toast = nil } }
        }
    }
}
