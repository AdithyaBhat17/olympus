import OlympusCore
import SwiftUI

/// "Log a session" by hand (src/app/(app)/log/page.tsx + src/components/session-form.tsx).
struct ManualLogView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Loadable(load: { try await model.api.get("sessions/manual", as: ManualLogOptions.self) }) { options, _ in
            ManualLogForm(options: options)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .background(Color.bg.ignoresSafeArea())
    }
}

private let rpeValues: [Double] = stride(from: 5.0, through: 10.0, by: 0.5).map { $0 }
private let blocks = ["1", "2", "3", "Deload"]
private let defaultSetCount = 3

struct ManualFormSet: Identifiable, Equatable {
    let id = UUID()
    var reps = ""
    var weight = ""
}

struct ManualFormExercise: Identifiable, Equatable {
    let id = UUID()
    var exerciseId = ""
    var exerciseName = ""
    var sets: [ManualFormSet] = (0..<defaultSetCount).map { _ in ManualFormSet() }
    var rpe: Double?
    var notes = ""
}

private struct ManualLogForm: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let options: ManualLogOptions

    @State private var date = Date()
    @State private var sessionName = ""
    @State private var weekNumber = 1
    @State private var blockNumber = "1"
    @State private var exercises: [ManualFormExercise] = [ManualFormExercise()]
    @State private var notes = ""
    @State private var saving = false
    @State private var added: [ManualLogOptions.Exercise] = []
    @State private var picking: ManualFormExercise.ID?
    @FocusState private var nameFocused: Bool

    private var available: [ManualLogOptions.Exercise] {
        (options.exercises + added.filter { a in !options.exercises.contains { $0.id == a.id } })
    }

    private var trimmedName: String { sessionName.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canQuickFill: Bool { !trimmedName.isEmpty && options.recentSessionNames.contains(trimmedName) }

    private var nameSuggestions: [String] {
        let q = trimmedName.lowercased()
        return options.recentSessionNames
            .filter { q.isEmpty || ($0.lowercased().contains(q) && $0 != trimmedName) }
            .prefix(8)
            .map { $0 }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Manual entry").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.muted)
                    Text("Log a session").font(.system(size: 40, weight: .heavy)).tracking(-0.5).foregroundStyle(Color.fg)
                }
                .padding(.horizontal, 4)

                sessionInfo
                exerciseSection
                sessionNotes

                Button {
                    Task { await save() }
                } label: {
                    Text(saving ? "Saving…" : "Save session")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(saving)
                .opacity(saving ? 0.6 : 1)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .tabClearance()
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { hideKeyboard() }
            }
        }
        .sheet(item: Binding(
            get: { picking.map { PickTarget(id: $0) } },
            set: { picking = $0?.id }
        )) { target in
            ManualExercisePicker(
                exercises: available,
                initialQuery: exercises.first { $0.id == target.id }?.exerciseName ?? "",
                onSelect: { ex in
                    update(target.id) {
                        $0.exerciseId = ex.id
                        $0.exerciseName = ex.name
                    }
                    picking = nil
                },
                onCreated: { ex in added.append(ex) }
            )
        }
    }

    private struct PickTarget: Identifiable { let id: UUID }

    // MARK: Session info

    private var sessionInfo: some View {
        VStack(alignment: .leading, spacing: 12) {
            DatePicker("Date", selection: $date, displayedComponents: .date)
                .font(.system(size: 16))
                .foregroundStyle(Color.fg)
                .tint(.coral)
                .listsInput()

            TextField("Session name", text: $sessionName, prompt: Text("Session name (e.g. Upper A, Push)").foregroundStyle(Color.faint))
                .focused($nameFocused)
                .textInputAutocapitalization(.words)
                .submitLabel(.done)
                .listsInput()
                .accessibilityLabel("Session name")

            if nameFocused, !nameSuggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(nameSuggestions, id: \.self) { n in
                            Button(n) {
                                sessionName = n
                                nameFocused = false
                            }
                            .font(.system(size: 15, weight: .semibold))
                            .padding(.horizontal, 14)
                            .frame(height: 36)
                            .background(Color.surface2, in: Capsule())
                            .foregroundStyle(Color.fg2)
                        }
                    }
                }
                .accessibilityLabel("Recent session names")
            }

            if canQuickFill {
                Button {
                    Task { await quickFill() }
                } label: {
                    Label("Fill from last \"\(trimmedName)\"", systemImage: "arrow.clockwise")
                        .font(.system(size: 15, weight: .bold))
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .foregroundStyle(Color.coral)
                        .background(Color.bg, in: Capsule())
                        .overlay(Capsule().strokeBorder(Color.coral.opacity(0.35), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Week").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.muted)
                    Menu {
                        Picker("Week", selection: $weekNumber) {
                            ForEach(1...12, id: \.self) { Text("Week \($0)").tag($0) }
                        }
                    } label: {
                        menuLabel("Week \(weekNumber)")
                    }
                    .accessibilityLabel("Week, \(weekNumber)")
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Block").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.muted)
                    Menu {
                        Picker("Block", selection: $blockNumber) {
                            ForEach(blocks, id: \.self) { b in Text(blockLabel(b)).tag(b) }
                        }
                    } label: {
                        menuLabel(blockLabel(blockNumber))
                    }
                    .accessibilityLabel("Block, \(blockLabel(blockNumber))")
                }
            }
        }
        .padding(16)
        .card()
    }

    private func blockLabel(_ b: String) -> String { b == "Deload" ? "Deload" : "Block \(b)" }

    private func menuLabel(_ text: String) -> some View {
        HStack {
            Text(text).foregroundStyle(Color.fg)
            Spacer(minLength: 4)
            Image(systemName: "chevron.down").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.faint)
        }
        .listsInput()
    }

    // MARK: Exercises

    private var exerciseSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Exercises").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.muted)
            ForEach($exercises) { $ex in
                ManualExerciseCard(
                    exercise: $ex,
                    canRemove: exercises.count > 1,
                    pick: { picking = ex.id },
                    remove: {
                        withAnimation(.snappy) {
                            if exercises.count > 1 { exercises.removeAll { $0.id == ex.id } }
                        }
                    }
                )
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            Button {
                withAnimation(.snappy) { exercises.append(ManualFormExercise()) }
            } label: {
                Label("Add Exercise", systemImage: "plus")
            }
            .buttonStyle(ManualSecondaryButtonStyle())
        }
    }

    private var sessionNotes: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Session notes").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.muted)
            TextField(
                "Session notes",
                text: $notes,
                prompt: Text("How did it feel? Energy, sleep, anything notable...").foregroundStyle(Color.faint),
                axis: .vertical
            )
            .lineLimit(3...8)
            .padding(.vertical, 12)
            .listsInput()
            .accessibilityLabel("Session notes")
        }
    }

    // MARK: Actions

    private func update(_ id: UUID, _ change: (inout ManualFormExercise) -> Void) {
        guard let i = exercises.firstIndex(where: { $0.id == id }) else { return }
        change(&exercises[i])
    }

    private struct LastResponse: Decodable { let session: ManualSessionTemplate? }

    private func quickFill() async {
        guard !trimmedName.isEmpty else { return }
        do {
            let res = try await model.api.get("sessions/manual/last", query: ["name": trimmedName], as: LastResponse.self)
            guard let last = res.session, !last.sessionExercises.isEmpty else {
                model.show("No previous session found", kind: .error)
                return
            }
            if let w = last.weekNumber { weekNumber = min(max(w, 1), 12) }
            if let b = last.blockNumber, blocks.contains(b) { blockNumber = b }
            let names = Dictionary(available.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
            exercises = last.sessionExercises.map { se in
                var sets: [ManualFormSet]
                if let details = se.setDetails, !details.isEmpty {
                    sets = details.map { ManualFormSet(reps: String($0.reps), weight: formatKg($0.weight)) }
                } else {
                    let w = se.weight.flatMap(Double.init).map(formatKg) ?? ""
                    sets = (0..<max(se.sets ?? 1, 1)).map { _ in ManualFormSet(reps: se.reps.map(String.init) ?? "", weight: w) }
                }
                return ManualFormExercise(
                    exerciseId: se.exerciseId,
                    exerciseName: names[se.exerciseId] ?? "Exercise",
                    sets: sets,
                    rpe: se.rpe.flatMap(Double.init),
                    notes: se.notes ?? ""
                )
            }
            Haptics.tick()
            model.show("Filled from last \"\(last.sessionName)\"")
        } catch {
            model.show("Failed to load previous session", kind: .error)
        }
    }

    private func save() async {
        hideKeyboard()
        guard !trimmedName.isEmpty else {
            model.show("Enter a session name", kind: .error)
            return
        }
        var parsed: [ManualSessionInput.ExerciseInput] = []
        for ex in exercises where !ex.exerciseId.isEmpty {
            var valid: [ManualSessionInput.ExerciseInput.SetInput] = []
            for (j, s) in ex.sets.enumerated() {
                let r = s.reps.trimmingCharacters(in: .whitespaces)
                let w = s.weight.trimmingCharacters(in: .whitespaces)
                if r.isEmpty, w.isEmpty { continue }
                let label = ex.exerciseName.isEmpty ? "exercise" : ex.exerciseName
                guard let reps = Int(r), reps >= 1 else {
                    model.show("Invalid reps for \(label) (set \(j + 1))", kind: .error)
                    return
                }
                guard let weight = ListsFormat.decimal(w), weight >= 0 else {
                    model.show("Invalid weight for \(label) (set \(j + 1))", kind: .error)
                    return
                }
                valid.append(.init(reps: reps, weight: weight))
            }
            if valid.isEmpty { continue }
            let n = ex.notes.trimmingCharacters(in: .whitespacesAndNewlines)
            parsed.append(.init(exerciseId: ex.exerciseId, sets: valid, rpe: ex.rpe, notes: n.isEmpty ? nil : n, orderIndex: parsed.count))
        }
        guard !parsed.isEmpty else {
            model.show("Add at least one exercise with sets", kind: .error)
            return
        }

        let n = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let input = ManualSessionInput(
            date: Self.dayKey(date),
            sessionName: trimmedName,
            weekNumber: weekNumber,
            blockNumber: blockNumber,
            notes: n.isEmpty ? nil : n,
            exercises: parsed
        )
        saving = true
        defer { saving = false }
        do {
            struct Saved: Decodable { let id: String }
            _ = try await model.api.post("sessions/manual", ManualSaveBody(input), as: Saved.self)
            Haptics.tick()
            model.show("Session saved!")
            exercises = [ManualFormExercise()]
            notes = ""
            sessionName = ""
            model.dataChanged()
            dismiss()
        } catch {
            model.show(error)
        }
    }

    private static func dayKey(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

private func hideKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}

// MARK: - Exercise card

private struct ManualExerciseCard: View {
    @Binding var exercise: ManualFormExercise
    let canRemove: Bool
    let pick: () -> Void
    let remove: () -> Void

    private let setCol: CGFloat = 32
    private let removeCol: CGFloat = 44

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Button(action: pick) {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.muted)
                        Text(exercise.exerciseName.isEmpty ? "Search exercise…" : exercise.exerciseName)
                            .foregroundStyle(exercise.exerciseName.isEmpty ? Color.faint : Color.fg)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .listsInput()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(exercise.exerciseName.isEmpty ? "Exercise, choose one" : "Exercise, \(exercise.exerciseName)")
                .accessibilityHint("Opens the exercise search")

                if canRemove {
                    Button(action: remove) {
                        Image(systemName: "xmark")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Color.faint)
                            .frame(width: 44, height: 48)
                    }
                    .accessibilityLabel("Remove exercise")
                }
            }
            .padding(.bottom, 4)

            HStack(spacing: 8) {
                Text("Set").frame(width: setCol)
                Text("Reps").frame(maxWidth: .infinity)
                Text("Weight (kg)").frame(maxWidth: .infinity)
                Color.clear.frame(width: removeCol, height: 1)
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Color.faint)
            .accessibilityHidden(true)

            ForEach($exercise.sets) { $set in
                let i = exercise.sets.firstIndex { $0.id == set.id } ?? 0
                HStack(spacing: 8) {
                    Text("\(i + 1)")
                        .font(.num(18))
                        .foregroundStyle(Color.muted)
                        .frame(width: setCol)
                        .accessibilityHidden(true)
                    TextField("8", text: $set.reps)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .font(.num(18, weight: .bold))
                        .listsInput()
                        .accessibilityLabel("Set \(i + 1) reps")
                    TextField("0", text: $set.weight)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.center)
                        .font(.num(18, weight: .bold))
                        .listsInput()
                        .accessibilityLabel("Set \(i + 1) weight in kg")
                    Button {
                        let id = set.id
                        if exercise.sets.count > 1 { withAnimation(.snappy) { exercise.sets.removeAll { $0.id == id } } }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.faint)
                            .frame(width: removeCol, height: 44)
                    }
                    .disabled(exercise.sets.count <= 1)
                    .opacity(exercise.sets.count <= 1 ? 0.3 : 1)
                    .accessibilityLabel("Remove set \(i + 1)")
                }
            }

            Button {
                // New set copies the last one, as a convenience.
                let last = exercise.sets.last
                withAnimation(.snappy) {
                    exercise.sets.append(ManualFormSet(reps: last?.reps ?? "", weight: last?.weight ?? ""))
                }
            } label: {
                Label("Add Set", systemImage: "plus")
            }
            .buttonStyle(ManualSecondaryButtonStyle(fill: .surface2, height: 44))
            .padding(.top, 4)

            VStack(alignment: .leading, spacing: 4) {
                Text("RPE").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.faint)
                Menu {
                    Picker("RPE", selection: $exercise.rpe) {
                        Text("—").tag(Double?.none)
                        ForEach(rpeValues, id: \.self) { v in Text(formatKg(v)).tag(Double?.some(v)) }
                    }
                } label: {
                    HStack {
                        Text(exercise.rpe.map(formatKg) ?? "—").foregroundStyle(Color.fg)
                        Spacer()
                        Image(systemName: "chevron.down").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.faint)
                    }
                    .listsInput()
                }
                .accessibilityLabel("RPE, \(exercise.rpe.map(formatKg) ?? "not set")")
            }
            .padding(.top, 4)

            TextField("Notes", text: $exercise.notes, prompt: Text("Notes (optional)").foregroundStyle(Color.faint))
                .font(.system(size: 15))
                .listsInput()
                .foregroundStyle(Color.fg2)
                .accessibilityLabel("Exercise notes")
        }
        .padding(16)
        .card()
    }
}

struct ManualSecondaryButtonStyle: ButtonStyle {
    var fill: Color = .surface
    var height: CGFloat = 48
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .bold))
            .frame(maxWidth: .infinity, minHeight: height)
            .background(fill, in: Capsule())
            .foregroundStyle(Color.fg)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

/// ManualSessionInput with the nullable fields sent as JSON null (the server's zod
/// schema uses .nullable(), which rejects a missing key).
private struct ManualSaveBody: Encodable {
    let input: ManualSessionInput
    init(_ input: ManualSessionInput) { self.input = input }

    private enum K: String, CodingKey { case date, sessionName, weekNumber, blockNumber, notes, exercises }
    private enum EK: String, CodingKey { case exerciseId, sets, rpe, notes, orderIndex }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        try c.encode(input.date, forKey: .date)
        try c.encode(input.sessionName, forKey: .sessionName)
        try c.encode(input.weekNumber, forKey: .weekNumber)
        try c.encode(input.blockNumber, forKey: .blockNumber)
        try c.encode(input.notes, forKey: .notes)
        var list = c.nestedUnkeyedContainer(forKey: .exercises)
        for ex in input.exercises {
            var e = list.nestedContainer(keyedBy: EK.self)
            try e.encode(ex.exerciseId, forKey: .exerciseId)
            try e.encode(ex.sets, forKey: .sets)
            try e.encode(ex.rpe, forKey: .rpe)
            try e.encode(ex.notes, forKey: .notes)
            try e.encode(ex.orderIndex, forKey: .orderIndex)
        }
    }
}
