import OlympusCore
import SwiftUI
import UIKit

/// Settings › Recovery sources: Whoop (server-side OAuth in the system sheet)
/// and Apple Health (read on this iPhone by HealthSync, replacing the web's
/// Shortcut + token setup).
struct SettingsRecoverySources: View {
    @Environment(AppModel.self) private var model
    let screen: SettingsScreen
    let reload: () async -> Void

    @State private var whoopFlash: String?
    @State private var whoopBusy = false
    @State private var confirmWhoopDisconnect = false

    /// WHOOP_FLASH from src/app/(app)/settings/page.tsx.
    static let whoopFlashes = [
        "connected": "Whoop connected. The last 14 nights are synced.",
        "denied": "Whoop access was declined.",
        "state_mismatch": "That Whoop sign-in expired. Try again.",
        "error": "Whoop sign-in failed. Check the server logs.",
        "not_configured": "Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET first.",
    ]

    private var whoop: SettingsScreen.Whoop { screen.whoop }
    private var timezone: String { screen.profile.timezone }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let whoopFlash {
                Text(whoopFlash)
                    .font(.system(size: 14))
                    .foregroundStyle(Color.fg2)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .transition(.opacity)
            }
            SettingsCard {
                whoopRow
                SettingsDivider()
                SettingsAppleHealthRow(serverLastSync: screen.appleHealth.lastSyncAt)
            }
        }
    }

    // MARK: Whoop

    private var whoopRow: some View {
        HStack(alignment: .center, spacing: 12) {
            SettingsIcon {
                Text("W").font(.system(size: 15, weight: .black))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Whoop").font(.system(size: 16)).foregroundStyle(Color.fg)
                Text(whoop.connected
                     ? "Sleep, HRV, resting HR, synced \(SettingsFormat.syncedAt(whoop.lastSyncAt, timezone: timezone))"
                     : "Sleep, HRV, resting HR, not connected")
                    .font(.system(size: 12))
                    .foregroundStyle(Color.muted)
                if let err = whoop.lastError {
                    Text("Last error: \(err)")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.dangerInk)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            whoopButtons
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: 56)
        .confirmationDialog("Disconnect Whoop? Synced sleep stays in your check-ins.",
                            isPresented: $confirmWhoopDisconnect, titleVisibility: .visible) {
            Button("Disconnect", role: .destructive, action: disconnectWhoop)
        }
    }

    @ViewBuilder private var whoopButtons: some View {
        if !whoop.configured {
            Text("Not set up on the server")
                .font(.system(size: 12))
                .foregroundStyle(Color.muted)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 110, alignment: .trailing)
        } else if whoop.connected {
            VStack(alignment: .trailing, spacing: 6) {
                Button(whoopBusy ? "Syncing…" : "Sync now", action: syncWhoop)
                    .buttonStyle(SettingsSmallButtonStyle())
                Button("Disconnect") { confirmWhoopDisconnect = true }
                    .buttonStyle(SettingsSmallButtonStyle(foreground: .danger))
            }
            .disabled(whoopBusy)
        } else {
            Button("Connect Whoop", action: connectWhoop)
                .buttonStyle(SettingsSmallButtonStyle())
                .disabled(whoopBusy)
        }
    }

    private struct Synced: Decodable { let nights: Int }

    private func syncWhoop() {
        whoopBusy = true
        Task {
            defer { whoopBusy = false }
            do {
                let n = try await model.api.post("integrations/whoop", Optional<API.Empty>.none, as: Synced.self).nights
                model.show("Synced \(n) night\(n == 1 ? "" : "s")")
                await reload()
            } catch {
                model.show(error)
            }
        }
    }

    private func disconnectWhoop() {
        whoopBusy = true
        Task {
            defer { whoopBusy = false }
            do {
                try await model.api.delete("integrations/whoop")
                model.show("Whoop disconnected")
                await reload()
            } catch {
                model.show(error)
            }
        }
    }

    private func connectWhoop() {
        guard let server = model.auth.serverURL else { return model.show("Add the server address first.", kind: .error) }
        guard let anchor = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else { return }
        let url = server.appending(path: "api/integrations/whoop/connect")
            .appending(queryItems: [URLQueryItem(name: "app", value: "1")])
        whoopBusy = true
        Task {
            defer { whoopBusy = false }
            do {
                let callback = try await WebAuth.start(url: url, callbackScheme: "olympus", anchor: anchor)
                let result = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
                    .queryItems?.first { $0.name == "result" }?.value
                withAnimation { whoopFlash = result.flatMap { Self.whoopFlashes[$0] } }
                await reload()
            } catch is WebAuth.Cancelled {
                // Closed the sheet: nothing to say.
            } catch {
                model.show(error)
            }
        }
    }
}

// MARK: - Apple Health

private struct SettingsAppleHealthRow: View {
    @Environment(AppModel.self) private var model
    let serverLastSync: String?

    private var health: HealthSync { model.health }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                SettingsIcon(foreground: .danger) {
                    Image(systemName: "heart.fill").font(.system(size: 16))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Apple Health").font(.system(size: 16)).foregroundStyle(Color.fg)
                    Text(status)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if health.isSyncing {
                    ProgressView().controlSize(.small)
                }
            }

            if let err = health.lastError {
                Text(err).font(.system(size: 12)).foregroundStyle(Color.dangerInk)
            } else if let notice = health.lastNotice {
                Text(notice).font(.system(size: 12)).foregroundStyle(Color.muted)
            }

            if !health.isAvailable {
                EmptyView()
            } else if !health.requested {
                Button("Allow Health access") {
                    Task { await health.connect() }
                }
                .buttonStyle(SettingsSubmitButtonStyle())
            } else {
                HStack(spacing: 8) {
                    Button(health.isSyncing ? "Syncing…" : "Sync now") {
                        Task { await health.sync() }
                    }
                    .buttonStyle(SettingsSmallButtonStyle())
                    Button("Backfill \(HealthSync.backfillDays) days") {
                        Task { await health.sync(days: HealthSync.backfillDays) }
                    }
                    .buttonStyle(SettingsSmallButtonStyle())
                }
                .disabled(health.isSyncing)
            }

            #if DEBUG
            if health.isAvailable {
                Button("Add sample data to Health") {
                    Task { await health.seedSampleData() }
                }
                .buttonStyle(SettingsTextButtonStyle())
                .disabled(health.isSyncing)
            }
            #endif

            Text("Olympus reads protein, water, sleep, HRV and resting HR from Health, in the background too. Where Health has no HRV or resting HR, Whoop's fill in.")
                .font(.system(size: 13))
                .foregroundStyle(Color.muted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var status: String {
        if !health.isAvailable { return "Health isn't available on this device" }
        if !health.requested { return "Protein, water, sleep, HRV and resting HR" }
        if health.isSyncing { return "Reading Health…" }
        if let last = health.lastSync { return "Reading Health in the background, last sync \(SettingsFormat.ago(last))" }
        if let serverLastSync { return "Reading Health in the background, last sync \(Dates.ago(serverLastSync))" }
        return "Reading Health in the background"
    }
}
