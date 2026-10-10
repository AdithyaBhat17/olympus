import OlympusCore
import SwiftUI

/// Grouped rows on a surface card (".card-group").
private struct SessionCardGroup<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title)
                .padding(.horizontal, 8)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                content()
            }
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        }
        .padding(.horizontal, 12)
        .padding(.top, 22)
    }
}

private struct RowDivider: View {
    var body: some View {
        Rectangle().fill(SessionPalette.line).frame(height: 1).padding(.leading, 16)
    }
}

/// session-lists.tsx UpNextList.
struct SessionUpNextList: View {
    let items: [LiveItem]
    /// 1-based position of each item in the session.
    let positions: [String: Int]
    let onSelect: (String) -> Void

    var body: some View {
        if !items.isEmpty {
            SessionCardGroup(title: "Up next") {
                ForEach(Array(items.enumerated()), id: \.element.key) { i, it in
                    if i > 0 { RowDivider() }
                    Button { onSelect(it.key) } label: { row(it) }
                        .buttonStyle(SessionRowStyle())
                }
            }
        }
    }

    private func row(_ it: LiveItem) -> some View {
        let timed = it.exercise.loadMode == .time
        let load: Double? = timed ? it.plannedMinutes.map { Double($0.total) } : (it.openKg ?? it.lastTopKg)
        return HStack(spacing: 12) {
            Text("\(positions[it.key] ?? 0)")
                .font(.num(15))
                .foregroundStyle(Color.faint)
                .frame(minWidth: 16, alignment: .leading)
            HStack(spacing: 6) {
                Text(it.exercise.name).lineLimit(1)
                if it.straps { SessionStrapsChip() }
            }
            .font(.system(size: 15))
            .foregroundStyle(Color.fg)
            .frame(maxWidth: .infinity, alignment: .leading)
            if let load {
                HStack(alignment: .lastTextBaseline, spacing: 2) {
                    Text(formatKg(load)).font(.num(18)).foregroundStyle(Color.fg2)
                    if timed { Text("min").font(.system(size: 13)).foregroundStyle(Color.muted) }
                }
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
    }
}

/// session-lists.tsx CompletedList.
struct SessionCompletedList: View {
    let items: [LiveItem]
    let onSelect: (String) -> Void

    var body: some View {
        if !items.isEmpty {
            SessionCardGroup(title: "Done") {
                ForEach(Array(items.enumerated()), id: \.element.key) { i, it in
                    if i > 0 { RowDivider() }
                    let summary = it.completedSummary
                    Button { onSelect(it.key) } label: { row(it, summary.text, summary.pr) }
                        .buttonStyle(SessionRowStyle())
                        .accessibilityLabel("\(it.exercise.name), done: \(summary.text)\(summary.pr ? ", top set PR" : ""). Open")
                }
            }
        }
    }

    private func row(_ it: LiveItem, _ text: String, _ pr: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .heavy))
                .frame(width: 24, height: 24)
                .background(SessionPalette.accentBg, in: Circle())
                .foregroundStyle(Color.coral)
            Text(it.exercise.name)
                .font(.system(size: 15))
                .foregroundStyle(Color.muted)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if pr {
                Text("PR ↑").font(.num(15)).foregroundStyle(SessionPalette.info)
            }
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(pr ? Color.fg2 : Color.faint)
                .lineLimit(1)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
    }
}

struct SessionRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .background(configuration.isPressed ? Color.surface3 : Color.clear)
    }
}
