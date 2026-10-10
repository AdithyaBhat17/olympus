import OlympusCore
import SwiftUI

/// Settings › Injuries & limits (src/components/settings/injuries.tsx). Each one
/// is a rule for your PT plus the movements it rules out: an exercise is blocked
/// when every word of a pattern is in its name.
struct SettingsInjuries: View {
    @Environment(AppModel.self) private var model
    let items: [SettingsScreen.Injury]
    let reload: () async -> Void

    enum Editing: Equatable {
        case new
        case existing(String)
    }

    @State private var editing: Editing?
    @State private var removing: SettingsScreen.Injury?
    @State private var busy = false

    var body: some View {
        SettingsCard {
            if items.isEmpty, editing == nil {
                Text("None on file. Add an injury and your PT won't programme the movements it rules out.")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.muted)
                    .padding(16)
            }
            ForEach(items) { item in
                if editing == .existing(item.id) {
                    SettingsInjuryForm(initial: item, reload: reload) { editing = nil }
                } else {
                    row(item)
                }
                SettingsDivider()
            }
            if editing == .new {
                SettingsInjuryForm(initial: nil, reload: reload) { editing = nil }
            } else {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { editing = .new }
                } label: {
                    Text("Add an injury or limit")
                        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                        .padding(.horizontal, 16)
                }
                .buttonStyle(SettingsTextButtonStyle())
            }
        }
        .confirmationDialog(
            removing.map { "Remove \"\($0.region)\"? Its blocked movements become available again." } ?? "",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible,
            presenting: removing
        ) { item in
            Button("Remove", role: .destructive) { remove(item) }
        }
    }

    private func row(_ item: SettingsScreen.Injury) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.region).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.fg)
                    Text(item.rule).font(.system(size: 13)).foregroundStyle(Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 0) {
                    Button("Edit") {
                        withAnimation(.easeInOut(duration: 0.2)) { editing = .existing(item.id) }
                    }
                    .buttonStyle(SettingsTextButtonStyle())
                    .padding(.horizontal, 7)
                    .accessibilityLabel("Edit \(item.region)")
                    Button("Remove") { removing = item }
                        .buttonStyle(SettingsTextButtonStyle(foreground: .danger))
                        .padding(.horizontal, 7)
                        .disabled(busy)
                        .accessibilityLabel("Remove \(item.region)")
                }
                .padding(.vertical, -8)
                .padding(.trailing, -8)
            }
            if !item.blockedPatterns.isEmpty {
                SettingsFlowLayout(spacing: 4) {
                    ForEach(item.blockedPatterns, id: \.self) { p in
                        Pill(text: p, tint: .surface3, foreground: .fg2)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private func remove(_ item: SettingsScreen.Injury) {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await model.api.delete("injuries/\(item.id)")
                model.show("\(item.region) removed")
                await reload()
            } catch {
                model.show(error)
            }
        }
    }
}

/// Add or edit one injury. The region is the key, so it's read-only when editing.
private struct SettingsInjuryForm: View {
    @Environment(AppModel.self) private var model
    let initial: SettingsScreen.Injury?
    let reload: () async -> Void
    let done: () -> Void

    @State private var region: String
    @State private var rule: String
    @State private var patterns: String
    @State private var saving = false
    @FocusState private var focus: Bool

    init(initial: SettingsScreen.Injury?, reload: @escaping () async -> Void, done: @escaping () -> Void) {
        self.initial = initial
        self.reload = reload
        self.done = done
        _region = State(initialValue: initial?.region ?? "")
        _rule = State(initialValue: initial?.rule ?? "")
        _patterns = State(initialValue: initial?.blockedPatterns.joined(separator: ", ") ?? "")
    }

    private struct Payload: Encodable {
        let region: String
        let rule: String
        let blockedPatterns: [String]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                SettingsFieldLabel("Where")
                TextField("Left knee", text: Binding(get: { region }, set: { region = String($0.prefix(80)) }))
                    .disabled(initial != nil)
                    .settingsInput(readOnly: initial != nil)
                    .focused($focus)
                    .accessibilityLabel("Where")
            }
            VStack(alignment: .leading, spacing: 4) {
                SettingsFieldLabel("Rule for your PT")
                TextField("No deep knee flexion under load", text: Binding(get: { rule }, set: { rule = String($0.prefix(500)) }), axis: .vertical)
                    .lineLimit(1...4)
                    .padding(.vertical, 12)
                    .settingsInput()
                    .accessibilityLabel("Rule for your PT")
            }
            VStack(alignment: .leading, spacing: 4) {
                SettingsFieldLabel("Blocked movements, comma-separated")
                TextField("lunge, pistol squat", text: $patterns)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .settingsInput()
                    .accessibilityLabel("Blocked movements, comma-separated")
            }
            HStack(spacing: 8) {
                Button("Cancel") { withAnimation(.easeInOut(duration: 0.2)) { done() } }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.fg)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                Button(saving ? "Saving…" : "Save", action: submit)
                    .buttonStyle(SettingsSubmitButtonStyle())
                    .disabled(saving)
            }
        }
        .padding(16)
        .onAppear { if initial == nil { focus = true } }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(initial.map { "Edit \($0.region)" } ?? "Add an injury")
    }

    private func submit() {
        let r = region.trimmingCharacters(in: .whitespacesAndNewlines)
        let ru = rule.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !r.isEmpty, !ru.isEmpty else { return model.show("Name it and say what to avoid", kind: .error) }
        let blocked = patterns.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        saving = true
        Task {
            defer { saving = false }
            do {
                try await model.api.post("injuries", Payload(region: r, rule: ru, blockedPatterns: blocked))
                model.show("\(r) saved")
                done()
                await reload()
            } catch {
                model.show(error)
            }
        }
    }
}
