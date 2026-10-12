import SwiftUI

/// Loads a screen's data from /api/v1 and keeps it fresh: shows a skeleton
/// first, an error with Retry on failure, reloads on pull-to-refresh and
/// whenever the app's data changes (outbox synced, app foregrounded).
///
///     Loadable(load: { try await api.get("today", as: TodayScreen.self) }) { screen, reload in
///         TodayContent(screen: screen, reload: reload)
///     }
struct Loadable<Value, Content: View, Placeholder: View>: View {
    @Environment(AppModel.self) private var model
    let load: () async throws -> Value
    @ViewBuilder var content: (Value, _ reload: @escaping () async -> Void) -> Content
    @ViewBuilder var placeholder: () -> Placeholder

    @State private var value: Value?
    @State private var error: String?

    var body: some View {
        Group {
            if let value {
                content(value, reload)
            } else if let error {
                ErrorState(message: error) { Task { await reload() } }
            } else {
                placeholder()
            }
        }
        .task(id: model.dataVersion) { await reload() }
    }

    private func reload() async {
        do {
            let v = try await load()
            value = v
            error = nil
        } catch is CancellationError {
        } catch let e as URLError where e.code == .cancelled {
        } catch {
            // Keep showing stale data if we have it; only an empty screen shows the error.
            if value == nil { self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
            else { model.show(error) }
        }
    }
}

extension Loadable where Placeholder == SkeletonScreen {
    init(load: @escaping () async throws -> Value, @ViewBuilder content: @escaping (Value, _ reload: @escaping () async -> Void) -> Content) {
        self.load = load
        self.content = content
        placeholder = { SkeletonScreen() }
    }
}

struct ErrorState: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 36, weight: .semibold))
                .foregroundStyle(Color.muted)
            Text(message)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.fg2)
                .multilineTextAlignment(.center)
            Button("Try again", action: retry)
                .buttonStyle(SecondaryButtonStyle())
                .frame(maxWidth: 220)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Generic loading skeleton (the web's loading.tsx shimmer blocks).
struct SkeletonScreen: View {
    @State private var pulse = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            RoundedRectangle(cornerRadius: 6).fill(Color.surface2).frame(width: 140, height: 14)
            RoundedRectangle(cornerRadius: 10).fill(Color.surface2).frame(width: 200, height: 36)
            RoundedRectangle(cornerRadius: 32, style: .continuous).fill(Color.surface).frame(height: 220).padding(.top, 8)
            RoundedRectangle(cornerRadius: 32, style: .continuous).fill(Color.surface).frame(height: 160)
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .opacity(pulse ? 0.55 : 1)
        .animation(.easeInOut(duration: 0.9).repeatForever(), value: pulse)
        .onAppear { pulse = true }
        .accessibilityLabel("Loading")
    }
}
