import OlympusCore
import SwiftUI

/// One library exercise: a normal row (pushes its progress) or a blocked row.
struct LibraryRow: View {
    let ex: LibraryScreen.Exercise

    var body: some View {
        if ex.blocked { LibraryBlockedRow(ex: ex) } else { normal }
    }

    private struct Tag: Hashable {
        let text: String
        var info = false
    }

    /// Small pills: equipment, compound, load-mode rules (max three).
    private var tags: [Tag] {
        var t: [Tag] = []
        if let eq = ex.equipment, !eq.isEmpty {
            let e = eq.replacingOccurrences(of: "_", with: " ").lowercased()
            t.append(Tag(text: e.prefix(1).uppercased() + e.dropFirst()))
        }
        if ex.isCompound { t.append(Tag(text: "Compound")) }
        if ex.loadMode == .counterweight { t.append(Tag(text: "Counterweight, lower is harder", info: true)) }
        if ex.loadMode == .perSide {
            t.append(Tag(text: "Per side" + (ex.carriageKgPerSide.map { ", +\(formatKg($0))" } ?? ""), info: true))
        }
        if ex.loadMode == .time { t.append(Tag(text: "Timed")) }
        if ex.status == "SUB" { t.append(Tag(text: "Substitute")) }
        if ex.isCustom { t.append(Tag(text: "Yours")) }
        if ex.hasFormCues { t.append(Tag(text: "Form cues")) }
        return Array(t.prefix(3))
    }

    private var unit: String {
        switch ex.loadMode {
        case .counterweight: " cw"
        case .time: " min"
        default: ""
        }
    }

    private var normal: some View {
        VStack(spacing: 0) {
            NavigationLink(value: ExerciseRoute(id: ex.id)) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ex.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.fg)
                            .multilineTextAlignment(.leading)
                        if !tags.isEmpty {
                            ListsFlow(spacing: 4) {
                                ForEach(tags, id: \.self) { tag in
                                    Pill(
                                        text: tag.text,
                                        tint: tag.info ? Color.berry.opacity(0.1) : .surface3,
                                        foreground: tag.info ? .berry : .fg2
                                    )
                                }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if let kg = ex.workingKg {
                        HStack(alignment: .firstTextBaseline, spacing: 0) {
                            Text(formatKg(kg)).font(.num(20)).foregroundStyle(Color.fg)
                            if !unit.isEmpty {
                                Text(unit).font(.system(size: 13)).foregroundStyle(Color.muted)
                            }
                        }
                        .accessibilityLabel("Working weight \(formatKg(kg))\(unit.isEmpty ? " kg" : unit)")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .buttonStyle(ListsRowPress())

            if ex.loadMode == .perSide {
                LibraryCarriageEditor(ex: ex)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                    .padding(.top, -4)
            }
        }
    }
}

private struct LibraryBlockedRow: View {
    @Environment(AppModel.self) private var model
    let ex: LibraryScreen.Exercise
    @State private var pending = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(ex.name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.fg2)
                        .strikethrough(true, color: .danger)
                    if let reason = ex.blockedReason, !reason.isEmpty {
                        Label {
                            Text(reason)
                        } icon: {
                            Image(systemName: "nosign").font(.system(size: 11, weight: .bold))
                        }
                        .labelStyle(LibraryTightLabel())
                        .font(.system(size: 12))
                        .foregroundStyle(Color.dangerInk)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(ex.name), blocked\(ex.blockedReason.map { ", \($0)" } ?? "")")

                if ex.blockedBy == "you" {
                    Button(pending ? "Unblocking…" : "Unblock") { Task { await unblock() } }
                        .font(.system(size: 14))
                        .foregroundStyle(Color.coral)
                        .frame(minHeight: 44)
                        .padding(.horizontal, 4)
                        .disabled(pending)
                        .opacity(pending ? 0.5 : 1)
                        .accessibilityLabel("Unblock \(ex.name)")
                } else {
                    Text(ex.blockedBy == "injury" ? "Injury" : "Blocked")
                        .font(.system(size: 11))
                        .foregroundStyle(Color.muted)
                }
            }
            if !ex.substitutes.isEmpty {
                Text("Use instead → \(ex.substitutes.joined(separator: ", "))")
                    .font(.system(size: 12))
                    .foregroundStyle(Color.berry)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func unblock() async {
        pending = true
        defer { pending = false }
        do {
            try await model.api.put("exercises/\(ex.id)/block", ListsBlockBody(reason: nil))
            Haptics.tick()
            model.show("\(ex.name) is back in your library")
            model.dataChanged()
        } catch {
            model.show(error)
        }
    }
}

private struct LibraryTightLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon
            configuration.title
        }
    }
}

/// Carriage per side for an iso-lateral machine (CarriageEditor).
private struct LibraryCarriageEditor: View {
    @Environment(AppModel.self) private var model
    let ex: LibraryScreen.Exercise

    @State private var editing = false
    @State private var value = ""
    @State private var pending = false
    @FocusState private var focused: Bool

    var body: some View {
        if editing {
            VStack(alignment: .leading, spacing: 8) {
                Text("Carriage per side (kg). Saved per machine and added to the plates you log.")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    TextField("e.g. 8.2", text: $value)
                        .keyboardType(.decimalPad)
                        .focused($focused)
                        .font(.num(18, weight: .bold))
                        .padding(.horizontal, 14)
                        .frame(width: 112, height: 44)
                        .background(Color.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .accessibilityLabel("Carriage per side in kg")
                    Button("Cancel") { editing = false }
                        .buttonStyle(ListsSmallButtonStyle())
                    Button(pending ? "Saving…" : "Save") { Task { await save() } }
                        .buttonStyle(ListsSmallButtonStyle(tint: .coral, foreground: .white))
                        .disabled(pending)
                }
            }
            .padding(.top, 4)
            .onAppear { focused = true }
        } else {
            HStack(spacing: 12) {
                HStack(spacing: 4) {
                    Text("Carriage").font(.system(size: 13)).foregroundStyle(Color.muted)
                    Text(ex.carriageKgPerSide.map { "\(formatKg($0)) kg/side" } ?? "not set")
                        .font(.num(16))
                        .foregroundStyle(Color.fg2)
                }
                .accessibilityElement(children: .combine)
                Spacer()
                Button("Edit") {
                    value = ex.carriageKgPerSide.map(formatKg) ?? ""
                    editing = true
                }
                .font(.system(size: 14))
                .foregroundStyle(Color.coral)
                .frame(minHeight: 44)
                .padding(.horizontal, 4)
                .accessibilityLabel("Edit carriage for \(ex.name)")
            }
        }
    }

    private func save() async {
        let raw = value.trimmingCharacters(in: .whitespaces)
        let kg: Double? = raw.isEmpty ? nil : ListsFormat.decimal(raw) ?? .nan
        if let kg, !kg.isFinite || kg < 0 || kg > 100 {
            model.show("Carriage must be between 0 and 100 kg", kind: .error)
            return
        }
        pending = true
        defer { pending = false }
        do {
            try await model.api.put("exercises/\(ex.id)/carriage", ListsCarriageBody(kgPerSide: kg))
            Haptics.tick()
            model.show(kg.map { "\(ex.name): carriage \(formatKg($0)) kg/side" } ?? "\(ex.name): carriage cleared")
            editing = false
            model.dataChanged()
        } catch {
            model.show(error)
        }
    }
}

/// Inline "New custom exercise" form.
struct LibraryCreateExercise: View {
    @Environment(AppModel.self) private var model
    let onDone: () -> Void

    @State private var name: String
    @State private var category = exerciseCategories[0]
    @State private var pending = false

    init(initialName: String, onDone: @escaping () -> Void) {
        self.onDone = onDone
        _name = State(initialValue: initialName)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Name").font(.system(size: 12)).foregroundStyle(Color.muted)
                TextField("Name", text: $name)
                    .listsInput()
                    .onChange(of: name) { if name.count > 100 { name = String(name.prefix(100)) } }
                    .accessibilityLabel("Name")
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Category").font(.system(size: 12)).foregroundStyle(Color.muted)
                Menu {
                    Picker("Category", selection: $category) {
                        ForEach(exerciseCategories, id: \.self) { Text(ListsFormat.category($0)).tag($0) }
                    }
                } label: {
                    HStack {
                        Text(ListsFormat.category(category)).foregroundStyle(Color.fg).lineLimit(1)
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.down").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.faint)
                    }
                    .listsInput()
                }
                .accessibilityLabel("Category, \(ListsFormat.category(category))")
            }
            HStack(spacing: 8) {
                Button("Cancel", action: onDone)
                    .buttonStyle(ListsSmallButtonStyle())
                Button(pending ? "Adding…" : "Add exercise") { Task { await submit() } }
                    .buttonStyle(ListsSmallButtonStyle(tint: .coral, foreground: .white))
                    .disabled(pending)
            }
        }
        .padding(16)
        .card()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("New custom exercise")
    }

    private func submit() async {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else {
            model.show("Give the exercise a name", kind: .error)
            return
        }
        pending = true
        defer { pending = false }
        do {
            _ = try await model.api.post("exercises", ListsCreateExerciseBody(name: n, category: category), as: ListsCreatedExercise.self)
            Haptics.tick()
            model.show("Added \(n)")
            onDone()
            model.dataChanged()
        } catch {
            model.show("Failed to create exercise", kind: .error)
        }
    }
}
