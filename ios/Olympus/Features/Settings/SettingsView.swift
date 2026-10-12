import OlympusCore
import SwiftUI

/// Settings (src/app/(app)/settings/page.tsx), from GET /api/v1/settings.
/// Pushed from the avatar on Today.
struct SettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Loadable(load: { try await model.api.get("settings", as: SettingsScreen.self) }) { screen, reload in
            SettingsContent(screen: screen, reload: reload)
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(Color.bg, for: .navigationBar)
    }
}

private struct SettingsContent: View {
    @Environment(AppModel.self) private var model
    let screen: SettingsScreen
    let reload: () async -> Void

    @State private var confirmSignOut = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                profileHeader
                SettingsClaudeSection(claude: screen.claude, timezone: screen.profile.timezone, reload: reload)
                SettingsSection(title: "Your training") {
                    SettingsProfileForm(profile: screen.profile)
                }
                SettingsSection(title: "Injuries & limits") {
                    SettingsInjuries(items: screen.injuries, reload: reload)
                }
                SettingsSection(title: "Recovery sources") {
                    SettingsRecoverySources(screen: screen, reload: reload)
                }
                SettingsSection(title: "On the gym floor") {
                    SettingsGymFloorPrefs()
                }
                footer
            }
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await reload() }
        .tabClearance()
    }

    /// The Google name, like the web; the email until the server has it.
    private var displayName: String {
        screen.profile.displayName ?? screen.email
    }

    private var profileHeader: some View {
        HStack(spacing: 14) {
            Text(displayName.first.map { String($0).uppercased() } ?? "?")
                .font(.num(28))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Color.coral, in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(displayName)
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(Color.fg)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text("Signed in with Google, \(screen.email)")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            NavigationLink {
                FormCueListView()
            } label: {
                Text("Form cues")
            }
            .buttonStyle(SecondaryButtonStyle())

            Button {
                confirmSignOut = true
            } label: {
                Text("Sign out")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.danger)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .confirmationDialog("Sign out of Olympus on this iPhone?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) {
                    Task { await model.signOut() }
                }
            }

            Text(versionLine)
                .font(.system(size: 12))
                .foregroundStyle(Color.faint)
                .multilineTextAlignment(.center)
                .padding(.top, 4)
        }
        .padding(.horizontal, 12)
        .padding(.top, 22)
    }

    private var versionLine: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        let host = model.auth.serverURL?.host() ?? "no server"
        return "Olympus \(version) (\(build)), \(host)"
    }
}

// MARK: - Your PT

private struct SettingsClaudeSection: View {
    @Environment(AppModel.self) private var model
    let claude: SettingsScreen.Claude
    let timezone: String
    let reload: () async -> Void

    @State private var confirmDisconnect = false
    @State private var busy = false
    @State private var auditOpen = false

    var body: some View {
        SettingsSection(title: "Your PT") {
            SettingsCard(padding: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        SettingsIcon(tint: .settingsInfoBg, foreground: .settingsInfo) {
                            Image(systemName: "waveform.path.ecg").font(.system(size: 16, weight: .semibold))
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Claude connector").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.fg)
                            Text(status)
                                .font(.system(size: 13))
                                .foregroundStyle(claude.connected ? Color.settingsInfo : Color.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        if claude.connected {
                            Button("Disconnect") { confirmDisconnect = true }
                                .buttonStyle(SettingsSmallButtonStyle(foreground: .danger))
                                .disabled(busy)
                                .confirmationDialog(
                                    "Disconnect every Claude client? You'll need to reconnect the connector.",
                                    isPresented: $confirmDisconnect, titleVisibility: .visible
                                ) {
                                    Button("Disconnect", role: .destructive, action: disconnect)
                                }
                        }
                    }

                    SettingsCopyField(label: "Custom connector URL", value: claude.connectorUrl)

                    if !claude.connected {
                        Text("In Claude: Settings › Connectors › Add custom connector, paste the URL, then sign in with Google when asked.")
                            .font(.system(size: 13))
                            .foregroundStyle(Color.muted)
                            .lineSpacing(3)
                            .padding(.horizontal, 4)
                    }

                    if !claude.clients.isEmpty || !claude.writes.isEmpty {
                        audit
                    }
                }
            }
        }
    }

    private var status: String {
        guard claude.connected else { return "Not connected" }
        guard let w = claude.lastWrite else { return "Connected" }
        return "Connected, last \(w.kind) \(SettingsFormat.syncedAt(w.at, timezone: timezone))"
    }

    private var audit: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { auditOpen.toggle() }
            } label: {
                HStack {
                    Text("Clients & audit log").font(.system(size: 14)).foregroundStyle(Color.fg2)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Color.faint)
                        .rotationEffect(.degrees(auditOpen ? 90 : 0))
                }
                .padding(.horizontal, 4)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(auditOpen ? "Collapses" : "Expands")

            if auditOpen {
                ForEach(claude.clients) { c in
                    HStack(spacing: 12) {
                        Text(c.name).foregroundStyle(Color.fg2).lineLimit(1)
                        Spacer()
                        Text("used \(Dates.ago(c.lastUsedAt))").foregroundStyle(Color.muted)
                    }
                    .font(.system(size: 14))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 10)
                    SettingsDivider()
                }
                if claude.writes.isEmpty {
                    Text("Claude hasn't changed anything yet.")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.muted)
                        .padding(.horizontal, 4)
                        .padding(.top, 8)
                } else {
                    ForEach(Array(claude.writes.prefix(15).enumerated()), id: \.element.id) { i, w in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 12) {
                                Text(w.tool).font(.system(size: 13)).foregroundStyle(Color.fg2)
                                Spacer()
                                Text((w.ok ? "" : "Rejected, ") + SettingsFormat.dayTime(w.at, timezone: timezone))
                                    .font(.system(size: 11))
                                    .foregroundStyle(w.ok ? Color.muted : Color.dangerInk)
                            }
                            if let summary = w.summary {
                                Text(summary)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Color.muted)
                                    .lineLimit(3)
                            }
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 10)
                        if i < min(claude.writes.count, 15) - 1 { SettingsDivider() }
                    }
                }
            }
        }
    }

    private func disconnect() {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await model.api.delete("integrations/claude")
                model.show("Claude disconnected")
                await reload()
            } catch {
                model.show(error)
            }
        }
    }
}

// MARK: - On the gym floor

private struct SettingsGymFloorPrefs: View {
    @State private var haptics = Prefs.haptics
    @State private var keepAwake = Prefs.keepAwake

    var body: some View {
        SettingsCard {
            toggle("Haptic tick on log & rest end", sub: "A light tap when you log a set and when rest is up", isOn: $haptics)
                .onChange(of: haptics) { _, v in
                    Prefs.haptics = v
                    if v { Haptics.tick() }
                }
            SettingsDivider()
            toggle("Keep screen awake in a session", sub: "The screen stays on while a session is open", isOn: $keepAwake)
                .onChange(of: keepAwake) { _, v in Prefs.keepAwake = v }
        }
    }

    private func toggle(_ title: String, sub: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 16)).foregroundStyle(Color.fg)
                Text(sub).font(.system(size: 12)).foregroundStyle(Color.muted)
            }
        }
        .tint(.coral)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: 56)
    }
}
