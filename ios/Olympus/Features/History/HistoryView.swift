import OlympusCore
import SwiftUI

/// The Log tab (src/app/(app)/history/page.tsx + src/components/history-list.tsx):
/// a five-week calendar, streak stats, type filter and the session list.
struct HistoryView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Loadable(load: { try await model.api.get("history", as: HistoryScreen.self) }) { screen, reload in
            HistoryContent(screen: screen, reload: reload)
        }
        .toolbar(.hidden, for: .navigationBar)
        .navigationTitle("Log")
        .navigationDestination(for: ManualLogRoute.self) { _ in ManualLogView() }
    }
}

private struct HistoryContent: View {
    @Environment(Router.self) private var router
    let screen: HistoryScreen
    let reload: () async -> Void

    /// nil = All; a rotation letter; or "cardio" (also matches "other").
    @State private var filter: String?

    private func match(_ kind: String) -> Bool {
        filter == nil || kind == filter || (filter == "cardio" && kind == "other")
    }

    private struct SessionGroup: Identifiable {
        let label: String
        var rows: [HistoryScreen.Session]
        let index: Int
        var id: String { "\(label)-\(index)" }
    }

    private var groups: [SessionGroup] {
        var out: [SessionGroup] = []
        for s in screen.sessions {
            if !match(s.kind), !s.live { continue }
            let label = s.live ? "In progress" : HistoryDates.groupLabel(s.date, thisMonday: screen.thisMonday, lastMonday: screen.lastMonday)
            if out.last?.label == label { out[out.count - 1].rows.append(s) }
            else { out.append(SessionGroup(label: label, rows: [s], index: out.count)) }
        }
        return out
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                PageHeader(eyebrow: screen.eyebrow, title: "Log") {
                    NavigationLink(value: ManualLogRoute()) {
                        Image(systemName: "plus")
                            .font(.system(size: 19, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(Color.coral, in: Circle())
                    }
                    .accessibilityLabel("Log a past session")
                }

                HistoryCalendar(screen: screen, match: match)
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ListsChip(label: "All", selected: filter == nil) { filter = nil }
                        ForEach(screen.rotation, id: \.self) { k in
                            ListsChip(label: k, selected: filter == k) { filter = k }
                        }
                        ListsChip(label: "Cardio", selected: filter == "cardio") { filter = "cardio" }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.top, 16)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Filter")

                if screen.sessions.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Nothing logged yet").font(.system(size: 22, weight: .heavy)).foregroundStyle(Color.fg)
                        Text("Start today's session from Today, or add an old one by hand.")
                            .font(.system(size: 15)).foregroundStyle(Color.muted)
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card()
                    .padding(.horizontal, 16)
                    .padding(.top, 24)
                } else if groups.isEmpty {
                    Text("No sessions of that type in the last few weeks.")
                        .font(.system(size: 15))
                        .foregroundStyle(Color.muted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                        .padding(.horizontal, 20)
                } else {
                    ForEach(groups) { g in
                        VStack(alignment: .leading, spacing: 10) {
                            SectionLabel(g.label)
                                .padding(.horizontal, 6)
                                .accessibilityAddTraits(.isHeader)
                            VStack(spacing: 8) {
                                ForEach(g.rows) { s in
                                    HistoryRow(session: s) {
                                        router.session = s.live ? .init(id: s.id) : .init(id: s.id, summary: true)
                                    }
                                }
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
        .refreshable { await reload() }
        .tabClearance()
    }
}

// MARK: - Calendar

private struct HistoryCalendar: View {
    let screen: HistoryScreen
    let match: (String) -> Bool

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(screen.range).font(.system(size: 20, weight: .heavy)).foregroundStyle(Color.fg)
                Spacer(minLength: 8)
                HStack(spacing: 10) {
                    ForEach(screen.rotation, id: \.self) { k in legend(k, kind: k) }
                    legend("Cardio", kind: "cardio")
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Legend: " + (screen.rotation.map { "Session \($0)" } + ["cardio"]).joined(separator: ", "))
            }
            .padding(.bottom, 12)

            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(Array(["M", "T", "W", "T", "F", "S", "S"].enumerated()), id: \.offset) { _, d in
                    Text(d).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.muted)
                }
            }
            .accessibilityHidden(true)
            .padding(.bottom, 6)

            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(screen.days, id: \.date) { d in dayCell(d) }
            }

            Divider().overlay(Color.surface3).padding(.top, 16)

            HStack {
                stat(screen.stats.thisWeek.description, "This week")
                Spacer()
                stat(formatKg(screen.stats.avg), "Avg / week")
                Spacer()
                stat(screen.stats.streak.description, "Week streak")
            }
            .padding(.top, 14)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
        .card(32)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Training calendar, last five weeks")
    }

    private func legend(_ label: String, kind: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(KindColors(type: kind).k).frame(width: 10, height: 10)
            Text(label)
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(Color.muted)
    }

    private func dayCell(_ d: HistoryScreen.Day) -> some View {
        let on = d.kind.map(match) ?? false
        let colors = KindColors(type: d.kind)
        let number = Int(d.date.suffix(2)) ?? 0
        return Text("\(number)")
            .font(.num(15, weight: on ? .heavy : .semibold))
            .foregroundStyle(on ? colors.on : d.today ? Color.coral : Color.muted)
            .fixedSize()
            .frame(width: 42, height: 42)
            .background {
                if on { Circle().fill(colors.k) }
                else if d.today { Circle().strokeBorder(Color.coral, lineWidth: 3) }
            }
            .frame(maxWidth: .infinity)
            .opacity(d.future ? 0.4 : 1)
            .animation(.easeOut(duration: 0.2), value: on)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(dayLabel(d))
    }

    private func dayLabel(_ d: HistoryScreen.Day) -> String {
        var s = HistoryDates.spoken(d.date)
        if let k = d.kind { s += ": " + (k == "cardio" ? "cardio" : k == "other" ? "session" : "Session \(k)") }
        if d.today { s += ", today" }
        return s
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.num(24)).foregroundStyle(Color.fg)
            Text(label).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.muted)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Row

private struct HistoryRow: View {
    let session: HistoryScreen.Session
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 14) {
                HistoryKindTile(kind: session.kind)
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.title).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.fg).lineLimit(1)
                    Text(session.meta).font(.system(size: 15)).foregroundStyle(Color.muted).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if session.live {
                    HistoryLiveBadge()
                } else if session.kind != "cardio" {
                    Text(session.sent ? "Sent" : "Not sent")
                        .font(.system(size: 13, weight: .heavy))
                        .padding(.horizontal, 10)
                        .frame(height: 28)
                        .background(session.sent ? Color.bg : Color.apricot, in: Capsule())
                        .foregroundStyle(session.sent ? Color.muted : Color.apricotInk)
                }
                ListsChevron()
            }
            .padding(.vertical, 12)
            .padding(.leading, 12)
            .padding(.trailing, 16)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(ListsRowPress())
        .accessibilityHint(session.live ? "Opens the live session" : "Opens the session summary")
    }
}

private struct HistoryKindTile: View {
    let kind: String

    var body: some View {
        let c = KindColors(type: kind)
        ZStack {
            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(c.k)
            if kind == "cardio" {
                Image(systemName: "waveform.path.ecg").font(.system(size: 20, weight: .semibold))
            } else if kind == "other" {
                Image(systemName: "dumbbell.fill").font(.system(size: 18, weight: .semibold))
            } else {
                Text(kind).font(.num(20))
            }
        }
        .foregroundStyle(c.on)
        .frame(width: 48, height: 48)
        .accessibilityHidden(true)
    }
}

private struct HistoryLiveBadge: View {
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(Color.coral).frame(width: 6, height: 6)
                .opacity(pulse ? 0.3 : 1)
                .animation(.easeInOut(duration: 0.9).repeatForever(), value: pulse)
            Text("Live").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.coral)
        }
        .onAppear { pulse = true }
    }
}

// MARK: - Dates

enum HistoryDates {
    private static let utc = TimeZone(identifier: "UTC")!

    private static func date(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = utc
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: iso)
    }

    private static func format(_ iso: String, _ pattern: String) -> String {
        guard let d = date(iso) else { return iso }
        let f = DateFormatter()
        f.timeZone = utc
        f.locale = Locale(identifier: "en_GB")
        f.dateFormat = pattern
        return f.string(from: d)
    }

    /// "This week", "Last week", or "October 2026".
    static func groupLabel(_ iso: String, thisMonday: String, lastMonday: String) -> String {
        if iso >= thisMonday { return "This week" }
        if iso >= lastMonday { return "Last week" }
        return format(iso, "MMMM yyyy")
    }

    /// "Friday 2 October" for VoiceOver.
    static func spoken(_ iso: String) -> String { format(iso, "EEEE d MMMM") }
}
