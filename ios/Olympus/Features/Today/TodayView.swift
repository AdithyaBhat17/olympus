import OlympusCore
import SwiftUI

/// The Today tab (src/app/(app)/today/page.tsx): header with the avatar that
/// opens Settings, the next-session card, recovery bubbles and the PT's flags.
struct TodayView: View {
    @Environment(AppModel.self) private var model
    /// The avatar letter, remembered so the header doesn't flash "?" on launch.
    @AppStorage("today.initial") private var initial = "?"

    var body: some View {
        Loadable(load: load) { screen, reload in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header(eyebrow: screen.eyebrow)
                    TodayNextSessionCard(data: screen.next)
                        .padding(.horizontal, 16)
                        .padding(.top, 20)
                    TodayRecoveryCard(data: screen.recovery)
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                    TodayFlagsList(flags: screen.flags)
                        .padding(.horizontal, 12)
                        .padding(.top, 22)
                }
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .refreshable { await reload() }
            .tabClearance()
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Today")
        .toolbar(.hidden, for: .navigationBar)
    }

    private func load() async throws -> TodayScreen {
        async let today = model.api.get("today", as: TodayScreen.self)
        async let me = try? model.api.get("me", as: Me.self)
        let screen = try await today
        if let me = await me, let first = (me.profile.displayName ?? me.email).first {
            initial = String(first).uppercased()
        }
        return screen
    }

    private func header(eyebrow: String) -> some View {
        PageHeader(eyebrow: eyebrow, title: "Today") {
            NavigationLink {
                SettingsView()
            } label: {
                Text(initial)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.fg)
                    .frame(width: 44, height: 44)
                    .background(Color.surface2, in: Circle())
            }
            .accessibilityLabel("Settings")
        }
    }
}
