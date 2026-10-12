import OlympusCore
import SwiftUI

/// One lift's progress (src/app/(app)/progress/[exerciseId]/page.tsx).
struct ProgressDetailView: View {
    @Environment(AppModel.self) private var model
    let exerciseId: String

    var body: some View {
        Loadable(load: { try await model.api.get("progress/\(exerciseId)", as: ExerciseProgressScreen.self) }) { screen, reload in
            ProgressDetailContent(s: screen, reload: reload)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .background(Color.bg.ignoresSafeArea())
    }
}

private struct ProgressDetailContent: View {
    @Environment(Router.self) private var router
    let s: ExerciseProgressScreen
    let reload: () async -> Void

    @State private var editingWeight = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(s.eyebrow).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.muted)
                    Text(s.name)
                        .font(.system(size: 40, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundStyle(Color.fg)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)

                headline
                    .padding(.horizontal, 20)
                    .padding(.top, 18)

                Group {
                    if s.points.contains(where: { $0.top != nil }) {
                        ProgressChart(points: s.points, today: s.today, loadMode: s.loadMode)
                    } else {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Nothing to chart yet").font(.system(size: 28, weight: .heavy))
                            Text("Log \(s.name) once and the chart starts here.").font(.system(size: 17)).opacity(0.9)
                        }
                        .foregroundStyle(KindColors(.coral).on)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 32)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(KindColors(.coral).k, in: RoundedRectangle(cornerRadius: 36, style: .continuous))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)

                tiles
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                ProgressBumpCard(bump: s.bump)
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                if !s.recent.isEmpty {
                    recent
                        .padding(.horizontal, 16)
                        .padding(.top, 24)
                }

                if let cue = s.formCue {
                    Button {
                        router.formCue = .init(cue: cue, exerciseId: s.id)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "play.fill")
                                .font(.system(size: 13))
                                .frame(width: 36, height: 36)
                                .background(Color.white.opacity(0.2), in: Circle())
                            Text("Form cues").font(.system(size: 17, weight: .heavy))
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 14, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .frame(height: 64)
                        .background(Color.berry, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                    }
                    .buttonStyle(ListsRowPress())
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                }

                ProgressBlockToggle(exerciseId: s.id, name: s.name, blocked: s.blocked, reason: s.blockReason)
                    .padding(.horizontal, 16)
                    .padding(.top, 24)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await reload() }
        .tabClearance()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit working weight") { editingWeight = true }
                    .font(.system(size: 17, weight: .bold))
                    .tint(.fg)
            }
        }
        .sheet(isPresented: $editingWeight) {
            ProgressWorkingWeightSheet(exerciseId: s.id, exerciseName: s.name, currentKg: s.workingKg)
        }
    }

    private var headline: some View {
        HStack(alignment: .bottom, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(s.workingKg.map(formatKg) ?? "—").font(.num(72))
                Text(" \(s.unit)").font(.system(size: 22, weight: .bold)).foregroundStyle(Color.muted)
            }
            .foregroundStyle(Color.fg)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Working weight \(s.workingKg.map(formatKg) ?? "not set") \(s.unit)")

            VStack(alignment: .leading, spacing: 2) {
                if let d = s.deltaLine {
                    if d.tone == "up" {
                        Pill(text: d.text, tint: .apricot, foreground: .apricotInk)
                            .font(.system(size: 15, weight: .heavy))
                    } else {
                        Text(d.text)
                            .font(.system(size: 15, weight: .heavy))
                            .foregroundStyle(d.tone == "down" ? Color.dangerInk : Color.muted)
                    }
                }
                if let t = s.newestTop {
                    Text("Top set, \(formatKg(t.weight)) × \(t.reps)").font(.system(size: 13)).foregroundStyle(Color.muted)
                }
                if let o = s.overrideDate {
                    Text("Set by hand \(ListsFormat.ddmm(o))").font(.system(size: 13)).foregroundStyle(Color.muted)
                }
            }
            .padding(.bottom, 6)
        }
    }

    private var tiles: some View {
        HStack(spacing: 8) {
            tile("Est. 1RM", s.e1rm.map(formatKg) ?? "—", color: .fg)
            tile("Sessions", "\(s.sessionCount)\(s.sessionCountCapped ? "+" : "")", color: .fg)
            tile("Next open", s.nextKg.map(formatKg) ?? "—", color: .coral)
        }
    }

    private func tile(_ label: String, _ value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.muted)
            Text(value).font(.num(24)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(26)
        .accessibilityElement(children: .combine)
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Recent sessions").padding(.horizontal, 6).accessibilityAddTraits(.isHeader)
            VStack(spacing: 6) {
                ForEach(s.recent) { h in
                    HStack(spacing: 12) {
                        Text(h.dateLabel)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.muted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                            .frame(width: 96, alignment: .leading)
                        Text(h.sets)
                            .font(.num(15))
                            .foregroundStyle(Color.fg2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if h.record {
                            Pill(text: "Record", tint: .apricot, foreground: .apricotInk)
                        } else if h.underloaded {
                            Text("!").font(.num(17)).foregroundStyle(Color.coral)
                                .accessibilityLabel("Underloaded")
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

// MARK: - Next bump

private struct ProgressBumpCard: View {
    let bump: ExerciseProgressScreen.Bump

    private var text: AttributedString {
        var out = AttributedString(bump.before)
        out.foregroundColor = .fg2
        if let after = bump.after {
            var label = AttributedString(bump.label)
            label.font = .system(size: 15, weight: .semibold)
            label.foregroundColor = .fg
            var tail = AttributedString(after)
            tail.foregroundColor = .fg2
            out += label + tail
        }
        var held = AttributedString(" Held if sleep < \(formatHours(bump.minSleepMin)) h on the day.")
        held.foregroundColor = .muted
        return out + held
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel("Next bump").accessibilityAddTraits(.isHeader)
                Spacer(minLength: 12)
                Text(bump.incrementLabel)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .multilineTextAlignment(.trailing)
            }
            HStack(spacing: 6) {
                ForEach(0..<max(bump.needed, 0), id: \.self) { i in
                    Capsule().fill(i < bump.hits ? Color.apricot : Color.surface3).frame(height: 12)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Clean sessions toward the next bump")
            .accessibilityValue("\(bump.label) sessions")
            Text(text)
                .font(.system(size: 15))
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .card(28)
    }
}

// MARK: - Working weight sheet

/// "Set working weight": an audited override. A big jump comes back as a guard
/// message with a "Force with reason" retry (working-weight-form.tsx).
private struct ProgressWorkingWeightSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let exerciseId: String
    let exerciseName: String

    @State private var kg: String
    @State private var reason = ""
    @State private var guardMessage: String?
    @State private var error: String?
    @State private var pending = false
    @FocusState private var kgFocused: Bool

    init(exerciseId: String, exerciseName: String, currentKg: Double?) {
        self.exerciseId = exerciseId
        self.exerciseName = exerciseName
        _kg = State(initialValue: currentKg.map(formatKg) ?? "")
    }

    private struct WeightBody: Encodable {
        let kg: Double
        let reason: String
        let force: Bool
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Working weight").font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.fg)
                Text("\(exerciseName), goes in the audit log for your PT").font(.system(size: 13)).foregroundStyle(Color.muted)
            }
            .padding(.horizontal, 6)

            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Kg").font(.system(size: 12)).foregroundStyle(Color.muted).padding(.horizontal, 4)
                    TextField("", text: $kg)
                        .keyboardType(.decimalPad)
                        .focused($kgFocused)
                        .font(.num(24))
                        .listsInput()
                        .onChange(of: kg) { guardMessage = nil }
                        .accessibilityLabel("Kg")
                }
                .frame(width: 120)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Reason").font(.system(size: 12)).foregroundStyle(Color.muted).padding(.horizontal, 4)
                    TextField("Reason", text: $reason, prompt: Text("New machine, recalibrated…").foregroundStyle(Color.faint))
                        .listsInput()
                        .onChange(of: reason) { if reason.count > 300 { reason = String(reason.prefix(300)) } }
                        .submitLabel(.done)
                        .onSubmit { Task { await submit(force: false) } }
                        .accessibilityLabel("Reason")
                }
            }

            if let error {
                Text(error).font(.system(size: 14)).foregroundStyle(Color.dangerInk).padding(.horizontal, 4)
            }

            if let guardMessage {
                VStack(alignment: .leading, spacing: 12) {
                    Text(guardMessage).font(.system(size: 14)).foregroundStyle(Color.fg2).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Button("Change it") { self.guardMessage = nil }
                            .buttonStyle(ListsSmallButtonStyle())
                        Button(pending ? "Saving…" : "Force with reason") { Task { await submit(force: true) } }
                            .buttonStyle(ListsSmallButtonStyle(tint: .coral, foreground: .white))
                            .disabled(pending)
                    }
                }
                .padding(12)
                .background(Color.coral.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.coral.opacity(0.35), lineWidth: 1))
            } else {
                Button(pending ? "Saving…" : "Save") { Task { await submit(force: false) } }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(pending)
                    .opacity(pending ? 0.5 : 1)
            }
        }
        .padding(20)
        .padding(.top, 8)
        .fittedSheet()
        .onAppear { kgFocused = true }
    }

    private func submit(force: Bool) async {
        guard let value = ListsFormat.decimal(kg), value.isFinite, value >= 0, value <= 1000 else {
            error = "Enter a weight between 0 and 1000 kg."
            return
        }
        let r = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !r.isEmpty else {
            error = force ? "Forcing a jump needs a reason." : "Add a short reason. It goes in the audit log."
            return
        }
        error = nil
        pending = true
        defer { pending = false }
        do {
            let res = try await model.api.post(
                "exercises/\(exerciseId)/working-weight",
                WeightBody(kg: value, reason: r, force: force),
                as: WorkingWeightResult.self
            )
            guard res.ok else {
                Haptics.warning()
                guardMessage = res.message
                return
            }
            Haptics.tick()
            model.show(res.message)
            guardMessage = nil
            reason = ""
            model.dataChanged()
            dismiss()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}

// MARK: - Block toggle

/// Take an exercise off the table for this athlete only (block-toggle.tsx).
private struct ProgressBlockToggle: View {
    @Environment(AppModel.self) private var model
    let exerciseId: String
    let name: String
    let blocked: Bool
    let reason: String?

    @State private var open = false
    @State private var draft = ""
    @State private var pending = false

    var body: some View {
        if blocked {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Blocked for you").font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.fg)
                    if let reason, !reason.isEmpty {
                        Text(reason).font(.system(size: 13)).foregroundStyle(Color.dangerInk)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Button(pending ? "Unblocking…" : "Unblock") { Task { await save(nil) } }
                    .font(.system(size: 17, weight: .bold))
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .background(Color.surface2, in: Capsule())
                    .foregroundStyle(Color.fg)
                    .disabled(pending)
                    .opacity(pending ? 0.5 : 1)
            }
            .padding(16)
            .card(26)
        } else {
            Button("Block this exercise for me") { open = true }
                .font(.system(size: 14))
                .foregroundStyle(Color.danger)
                .frame(minHeight: 44)
                .padding(.horizontal, 8)
                .sheet(isPresented: $open) { sheet }
        }
    }

    private var sheet: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Block \(name)").font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.fg)
                Text("Only for you. Your PT will use a substitute instead.").font(.system(size: 13)).foregroundStyle(Color.muted)
            }
            .padding(.horizontal, 6)
            VStack(alignment: .leading, spacing: 4) {
                Text("Why (optional)").font(.system(size: 12)).foregroundStyle(Color.muted).padding(.horizontal, 4)
                TextField("Why (optional)", text: $draft, prompt: Text("Sore wrist, gym doesn't have it…").foregroundStyle(Color.faint))
                    .listsInput()
                    .onChange(of: draft) { if draft.count > 200 { draft = String(draft.prefix(200)) } }
                    .submitLabel(.done)
                    .accessibilityLabel("Why (optional)")
            }
            HStack(spacing: 8) {
                Button("Cancel") { open = false }
                    .buttonStyle(ListsSmallButtonStyle())
                Button(pending ? "Blocking…" : "Block") { Task { await save(draft) } }
                    .buttonStyle(ListsSmallButtonStyle(tint: .coral, foreground: .white))
                    .disabled(pending)
            }
        }
        .padding(20)
        .padding(.top, 8)
        .fittedSheet()
    }

    private func save(_ next: String?) async {
        pending = true
        defer { pending = false }
        do {
            try await model.api.put("exercises/\(exerciseId)/block", ListsBlockBody(reason: next))
            Haptics.tick()
            model.show(next == nil ? "\(name) is back in your library" : "\(name) blocked")
            open = false
            draft = ""
            model.dataChanged()
        } catch {
            model.show(error)
        }
    }
}
