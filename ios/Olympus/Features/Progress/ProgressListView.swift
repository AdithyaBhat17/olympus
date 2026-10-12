import OlympusCore
import SwiftUI

/// The Progress tab (src/app/(app)/progress/page.tsx + src/components/progress/progress-list.tsx):
/// every lift with a working weight and its trend.
struct ProgressListView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Loadable(load: { try await model.api.get("progress", as: ProgressScreen.self) }) { screen, reload in
            ProgressListContent(screen: screen, reload: reload)
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationTitle("Progress")
        .navigationDestination(for: ExerciseRoute.self) { route in ProgressDetailView(exerciseId: route.id) }
    }
}

private struct ProgressListContent: View {
    @Environment(Router.self) private var router
    let screen: ProgressScreen
    let reload: () async -> Void
    @State private var query = ""

    private var groups: [(category: String, rows: [ProgressScreen.Row])] {
        var out: [(category: String, rows: [ProgressScreen.Row])] = []
        for r in screen.rows where ListsFormat.matches(query, "\(r.name) \(r.category)") {
            if out.last?.category == r.category { out[out.count - 1].rows.append(r) }
            else { out.append((r.category, [r])) }
        }
        return out
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                PageHeader(eyebrow: screen.eyebrow, title: "Progress")

                if screen.rows.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Nothing logged yet").font(.system(size: 22, weight: .heavy)).foregroundStyle(Color.fg)
                        Text("Finish a session and each lift shows up here with its working weight and trend.")
                            .font(.system(size: 15)).foregroundStyle(Color.muted)
                        Button("Go to Today") { router.tab = .today }
                            .buttonStyle(SecondaryButtonStyle())
                            .padding(.top, 8)
                    }
                    .padding(16)
                    .card()
                    .padding(.horizontal, 16)
                    .padding(.top, 24)
                } else {
                    ListsSearchField(placeholder: "Search lifts", text: $query)
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .padding(.bottom, 4)

                    let groups = groups
                    if groups.isEmpty {
                        Text("No lifts match “\(query.trimmingCharacters(in: .whitespaces))”.")
                            .font(.system(size: 14))
                            .foregroundStyle(Color.muted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 32)
                            .padding(.horizontal, 20)
                    }

                    ForEach(groups, id: \.category) { g in
                        VStack(alignment: .leading, spacing: 10) {
                            SectionLabel(ListsFormat.category(g.category))
                                .padding(.horizontal, 6)
                                .accessibilityAddTraits(.isHeader)
                            VStack(spacing: 6) {
                                ForEach(g.rows) { r in ProgressRowView(row: r) }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 24)
                    }
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

private struct ProgressRowView: View {
    let row: ProgressScreen.Row

    var body: some View {
        NavigationLink(value: ExerciseRoute(id: row.id)) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(row.name).font(.system(size: 17, weight: .bold)).foregroundStyle(Color.fg).lineLimit(1)
                    Text("Last \(ListsFormat.ddmm(row.lastDate))").font(.system(size: 15)).foregroundStyle(Color.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text(row.load).font(.num(22)).foregroundStyle(Color.fg)
                    if let unit = row.unit {
                        Text(" \(unit)").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.muted)
                    }
                }
                ProgressTrendMark(trend: row.trend)
                ListsChevron()
            }
            .padding(.vertical, 10)
            .padding(.leading, 18)
            .padding(.trailing, 14)
            .frame(minHeight: 64)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(ListsRowPress())
        .accessibilityElement(children: .combine)
        .accessibilityValue(row.trendLabel)
    }
}

/// ↑ / ↓ / – circle beside a lift.
struct ProgressTrendMark: View {
    let trend: String

    var body: some View {
        Text(trend == "up" ? "↑" : trend == "down" ? "↓" : "–")
            .font(.num(15))
            .frame(width: 28, height: 28)
            .background(trend == "up" ? Color.apricot : trend == "down" ? Color.bg : Color.clear, in: Circle())
            .foregroundStyle(trend == "up" ? Color.apricotInk : trend == "down" ? Color.dangerInk : Color.faint)
            .accessibilityHidden(true)
    }
}
