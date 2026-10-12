import OlympusCore
import SwiftUI

/// The Library tab (src/app/(app)/exercises/page.tsx + src/components/exercise-list.tsx).
struct LibraryView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Loadable(load: { try await model.api.get("exercises", as: LibraryScreen.self) }) { screen, reload in
            LibraryContent(screen: screen, reload: reload)
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationTitle("Library")
        .navigationDestination(for: ExerciseRoute.self) { route in ProgressDetailView(exerciseId: route.id) }
    }
}

enum LibraryFilter: String, CaseIterable, Identifiable {
    case all, push, pull, legs, arms, core, cardio, blocked
    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "All"
        case .push: "Push"
        case .pull: "Pull"
        case .legs: "Legs"
        case .arms: "Arms"
        case .core: "Core"
        case .cardio: "Cardio"
        case .blocked: "Blocked"
        }
    }

    /// Same grouping as the web's groupOf (regex on the category name).
    static func group(of category: String) -> LibraryFilter {
        if category.contains("Push") { return .push }
        if category.contains("Pull") { return .pull }
        if category.contains("Lower Body") || category.contains("Calves") { return .legs }
        if category.contains("Arms") { return .arms }
        if category.contains("Cardio") { return .cardio }
        return .core
    }
}

private struct LibraryContent: View {
    let screen: LibraryScreen
    let reload: () async -> Void

    @State private var search = ""
    @State private var filter: LibraryFilter = .all
    @State private var creating = false

    private var trimmed: String { search.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var filtered: [LibraryScreen.Exercise] {
        screen.exercises.filter { e in
            if filter == .blocked ? !e.blocked : filter != .all && LibraryFilter.group(of: e.category) != filter { return false }
            return ListsFormat.matches(search, "\(e.name) \(e.category)")
        }
    }

    private var grouped: [(category: String, rows: [LibraryScreen.Exercise])] {
        let rows = filtered
        var cats = exerciseCategories
        for c in rows.map(\.category) where !cats.contains(c) { cats.append(c) }
        return cats.compactMap { c in
            let r = rows.filter { $0.category == c }
            return r.isEmpty ? nil : (c, r)
        }
    }

    var body: some View {
        let groups = grouped
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                PageHeader(eyebrow: screen.eyebrow, title: "Library")

                ListsSearchField(placeholder: "Search exercises", text: $search)
                    .padding(.horizontal, 12)
                    .padding(.top, 16)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(LibraryFilter.allCases) { f in
                            ListsChip(label: f.label, selected: filter == f) { filter = f }
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .padding(.top, 12)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Filter")

                Group {
                    if creating {
                        LibraryCreateExercise(initialName: trimmed) { withAnimation(.snappy) { creating = false } }
                            .transition(.opacity)
                    } else {
                        Button {
                            withAnimation(.snappy) { creating = true }
                        } label: {
                            Label(
                                !trimmed.isEmpty && filtered.isEmpty ? "Add “\(trimmed)” as a custom exercise" : "New custom exercise",
                                systemImage: "plus"
                            )
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Color.coral)
                            .frame(minHeight: 44)
                            .padding(.horizontal, 8)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)

                if groups.isEmpty {
                    Text(trimmed.isEmpty ? "Nothing in this filter." : "No exercises match “\(trimmed)”.")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.muted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 32)
                        .padding(.horizontal, 20)
                }

                ForEach(groups, id: \.category) { g in
                    VStack(alignment: .leading, spacing: 10) {
                        SectionLabel(ListsFormat.category(g.category))
                            .padding(.horizontal, 8)
                            .accessibilityAddTraits(.isHeader)
                        VStack(spacing: 0) {
                            ForEach(Array(g.rows.enumerated()), id: \.element.id) { i, ex in
                                if i > 0 { Divider().overlay(Color.surface3) }
                                LibraryRow(ex: ex)
                            }
                        }
                        .background(Color.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 20)
                }
            }
            .padding(.bottom, 16)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.immediately)
        .refreshable { await reload() }
        .tabClearance()
    }
}
