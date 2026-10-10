import OlympusCore
import SwiftUI

/// The manual log's exercise search (src/components/exercise-search.tsx) as a sheet:
/// grouped by category with status dots, and "+ Add 'X' as custom exercise".
struct ManualExercisePicker: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let exercises: [ManualLogOptions.Exercise]
    let onSelect: (ManualLogOptions.Exercise) -> Void
    let onCreated: (ManualLogOptions.Exercise) -> Void

    @State private var query: String
    @State private var showCategories = false
    @State private var creating = false
    @FocusState private var focused: Bool

    init(
        exercises: [ManualLogOptions.Exercise],
        initialQuery: String,
        onSelect: @escaping (ManualLogOptions.Exercise) -> Void,
        onCreated: @escaping (ManualLogOptions.Exercise) -> Void
    ) {
        self.exercises = exercises
        self.onSelect = onSelect
        self.onCreated = onCreated
        _query = State(initialValue: initialQuery)
    }

    private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var filtered: [ManualLogOptions.Exercise] {
        trimmed.isEmpty ? exercises : exercises.filter { $0.name.lowercased().contains(trimmed.lowercased()) }
    }

    /// Categories in first-seen order, like the web's reduce.
    private var grouped: [(category: String, rows: [ManualLogOptions.Exercise])] {
        var order: [String] = []
        var map: [String: [ManualLogOptions.Exercise]] = [:]
        for e in filtered {
            if map[e.category] == nil { order.append(e.category) }
            map[e.category, default: []].append(e)
        }
        return order.map { ($0, map[$0] ?? []) }
    }

    private var hasExactMatch: Bool {
        exercises.contains { $0.name.lowercased() == trimmed.lowercased() }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Color.muted).accessibilityHidden(true)
                    TextField("Exercise", text: $query, prompt: Text("Search exercise…").foregroundStyle(Color.faint))
                        .focused($focused)
                        .autocorrectionDisabled()
                        .onChange(of: query) { showCategories = false }
                        .accessibilityLabel("Exercise")
                    if !query.isEmpty {
                        Button { query = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(Color.faint)
                        }
                        .accessibilityLabel("Clear search")
                    }
                }
                .listsInput()
                .padding(.horizontal, 16)
                .padding(.bottom, 8)

                List {
                    if !trimmed.isEmpty, !hasExactMatch {
                        Section {
                            if showCategories {
                                Text("Pick a category:")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Color.muted)
                                    .listRowBackground(Color.surface)
                                ForEach(exerciseCategories, id: \.self) { cat in
                                    Button(ListsFormat.category(cat)) {
                                        Task { await create(category: cat) }
                                    }
                                    .disabled(creating)
                                    .font(.system(size: 15))
                                    .foregroundStyle(Color.fg2)
                                    .listRowBackground(Color.surface)
                                }
                            } else {
                                Button("+ Add \"\(trimmed)\" as custom exercise") {
                                    withAnimation { showCategories = true }
                                }
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(Color.coral)
                                .listRowBackground(Color.surface)
                            }
                        }
                    }

                    ForEach(grouped, id: \.category) { g in
                        Section {
                            ForEach(g.rows) { ex in
                                Button {
                                    Haptics.tick()
                                    onSelect(ex)
                                } label: {
                                    HStack(spacing: 8) {
                                        Text(ex.name).foregroundStyle(Color.fg).lineLimit(1)
                                        Spacer(minLength: 8)
                                        Circle().fill(dotColor(ex.status)).frame(width: 8, height: 8)
                                    }
                                    .font(.system(size: 15))
                                    .frame(minHeight: 36)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(ex.name), \(statusLabel(ex.status))")
                                .listRowBackground(Color.surface)
                            }
                        } header: {
                            Text(g.category)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Color.muted)
                                .textCase(nil)
                        }
                    }

                    if filtered.isEmpty, trimmed.isEmpty {
                        Text("No exercises found")
                            .font(.system(size: 14))
                            .foregroundStyle(Color.muted)
                            .frame(maxWidth: .infinity)
                            .listRowBackground(Color.clear)
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .scrollDismissesKeyboard(.immediately)
            }
            .background(Color.bg.ignoresSafeArea())
            .navigationTitle("Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.tint(.coral)
                }
            }
        }
        .presentationDetents([.large])
        .presentationBackground(Color.bg)
        .onAppear { focused = true }
    }

    private func dotColor(_ status: String) -> Color {
        switch status {
        case "SUB": .coral
        case "NO": .danger
        default: .berry
        }
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "SUB": "Sub"
        case "NO": "Blocked"
        default: "Active"
        }
    }

    private func create(category: String) async {
        creating = true
        defer { creating = false }
        do {
            let res = try await model.api.post(
                "exercises",
                ListsCreateExerciseBody(name: trimmed, category: category),
                as: ListsCreatedExercise.self
            )
            onCreated(res.exercise)
            onSelect(res.exercise)
            model.dataChanged()
        } catch {
            model.show("Failed to create exercise", kind: .error)
        }
    }
}
