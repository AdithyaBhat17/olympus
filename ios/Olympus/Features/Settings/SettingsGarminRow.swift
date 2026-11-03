import OlympusCore
import SwiftUI
import UIKit

/// Settings › Recovery sources › Garmin: the web's Garmin card. The server
/// does the syncing with a personal API key from Garmin Connect; this row
/// shows its state and connects, syncs, replaces the key or disconnects.
struct SettingsGarminRow: View {
    @Environment(AppModel.self) private var model
    let garmin: SettingsScreen.Garmin
    let timezone: String
    let reload: () async -> Void

    @State private var busy = false
    @State private var keySheet = false
    @State private var confirmDisconnect = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            SettingsIcon {
                Text("G").font(.system(size: 15, weight: .black))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Garmin").font(.system(size: 16)).foregroundStyle(Color.fg)
                Text(garmin.connected
                     ? "Sleep, HRV, resting HR, activities, synced \(SettingsFormat.syncedAt(garmin.lastSyncAt, timezone: timezone))"
                     : "Sleep, HRV, resting HR, activities, not connected")
                    .font(.system(size: 12))
                    .foregroundStyle(Color.muted)
                if garmin.connected, let left = garmin.keyDaysLeft, left <= 14 {
                    Text(left < 0
                         ? "API key expired. Create a new one in Garmin Connect."
                         : "API key expires in \(left) day\(left == 1 ? "" : "s").")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.dangerInk)
                }
                if let err = garmin.lastError {
                    Text("Last error: \(err)")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.dangerInk)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            buttons
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: 56)
        .sheet(isPresented: $keySheet) {
            GarminKeySheet(replacing: garmin.connected, expiresAt: garmin.keyExpiresAt) { await reload() }
        }
        .confirmationDialog("Disconnect Garmin? Synced data stays in your check-ins.",
                            isPresented: $confirmDisconnect, titleVisibility: .visible) {
            Button("Disconnect", role: .destructive, action: disconnect)
        }
    }

    @ViewBuilder private var buttons: some View {
        if !garmin.configured {
            Text("Not set up on the server")
                .font(.system(size: 12))
                .foregroundStyle(Color.muted)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 110, alignment: .trailing)
        } else if garmin.connected {
            VStack(alignment: .trailing, spacing: 6) {
                Button(busy ? "Syncing…" : "Sync now", action: sync)
                    .buttonStyle(SettingsSmallButtonStyle())
                Menu {
                    Button("Replace API key", systemImage: "key") { keySheet = true }
                    Button("Disconnect", systemImage: "xmark.circle", role: .destructive) { confirmDisconnect = true }
                } label: {
                    Text("Manage")
                }
                .buttonStyle(SettingsSmallButtonStyle())
            }
            .disabled(busy)
        } else {
            Button("Set up") { keySheet = true }
                .buttonStyle(SettingsSmallButtonStyle())
        }
    }

    private struct Synced: Decodable { let days: Int }

    private func sync() {
        busy = true
        Task {
            defer { busy = false }
            do {
                let n = try await model.api.post("integrations/garmin", Optional<API.Empty>.none, as: Synced.self).days
                model.show("Synced \(n) day\(n == 1 ? "" : "s")")
                await reload()
            } catch {
                model.show(error)
            }
        }
    }

    private func disconnect() {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await model.api.delete("integrations/garmin")
                model.show("Garmin disconnected")
                await reload()
            } catch {
                model.show(error)
            }
        }
    }
}

/// Paste the personal API key from Garmin Connect and the date it expires.
private struct GarminKeySheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let replacing: Bool
    let expiresAt: String?
    let done: () async -> Void

    @State private var key = ""
    @State private var expires = Calendar.current.date(byAdding: .year, value: 1, to: Date()) ?? Date()
    @State private var busy = false
    @FocusState private var keyFocused: Bool

    private struct KeyBody: Encodable { let apiKey: String; let expiresOn: String }
    private struct Synced: Decodable { let days: Int }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(replacing ? "Replace Garmin key" : "Connect Garmin")
                .font(.system(size: 24, weight: .heavy))
                .foregroundStyle(Color.fg)

            Text("In Garmin Connect on the web: Settings › Personal API token › Create key. Copy it (Garmin shows it once) and paste it here with its expiry date. It's stored encrypted and only ever sent to Garmin.")
                .font(.system(size: 14))
                .foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 6) {
                Text("API key").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.muted)
                HStack(spacing: 8) {
                    SecureField("Paste the key", text: $key)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($keyFocused)
                        .font(.system(size: 16))
                        .padding(.horizontal, 14)
                        .frame(height: 48)
                        .background(Color.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    Button {
                        if let s = UIPasteboard.general.string { key = s.trimmingCharacters(in: .whitespacesAndNewlines) }
                    } label: {
                        Text("Paste")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.fg)
                            .padding(.horizontal, 16)
                            .frame(height: 48)
                            .background(Color.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(PressStyle())
                }
            }

            HStack {
                Text("Expires on").font(.system(size: 16)).foregroundStyle(Color.fg)
                Spacer()
                DatePicker("Expires on", selection: $expires, in: Date()..., displayedComponents: .date)
                    .labelsHidden()
                    .tint(Color.coral)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            Button(action: connect) {
                Text(busy ? "Checking with Garmin…" : replacing ? "Replace key" : "Connect Garmin")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(Color.coral.opacity(canSubmit ? 1 : 0.4), in: Capsule())
            }
            .buttonStyle(PressStyle())
            .disabled(!canSubmit)
        }
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 16)
        .fittedSheet()
        .interactiveDismissDisabled(busy)
    }

    private var canSubmit: Bool { !busy && key.trimmingCharacters(in: .whitespaces).count >= 20 }

    private func connect() {
        busy = true
        keyFocused = false
        let day = expires.formatted(.iso8601.year().month().day())
        Task {
            defer { busy = false }
            do {
                let n = try await model.api.put("integrations/garmin", KeyBody(apiKey: key.trimmingCharacters(in: .whitespacesAndNewlines), expiresOn: day), as: Synced.self).days
                model.show("Garmin connected. Synced \(n) day\(n == 1 ? "" : "s").")
                await done()
                dismiss()
            } catch {
                model.show(error)
            }
        }
    }
}
