import OlympusCore
import SwiftUI

// Building blocks shared by the Settings sections (the web's card-group,
// rows, small buttons and inputs from src/components/settings/*).

extension Color {
    /// The web's `info` (berry) and its 10 % background.
    static let settingsInfo = Color.berry
    static let settingsInfoBg = Color.berry.opacity(0.1)
}

/// Section label above a group: "YOUR PT".
struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title)
                .padding(.horizontal, 8)
                .accessibilityAddTraits(.isHeader)
            content()
        }
        .padding(.horizontal, 12)
        .padding(.top, 22)
    }
}

/// The surface card a section sits in.
struct SettingsCard<Content: View>: View {
    var padding: CGFloat = 0
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct SettingsDivider: View {
    var body: some View { Rectangle().fill(Color.surface3).frame(height: 1) }
}

/// The 32 pt rounded-square icon at the start of a row.
struct SettingsIcon<Glyph: View>: View {
    var tint: Color = .surface3
    var foreground: Color = .fg
    @ViewBuilder var glyph: () -> Glyph

    var body: some View {
        glyph()
            .foregroundStyle(foreground)
            .frame(width: 32, height: 32)
            .background(tint, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// Small rounded button inside a row: "Disconnect", "Sync now".
struct SettingsSmallButtonStyle: ButtonStyle {
    var foreground: Color = .fg2
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Color.surface3, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.5)
    }
}

/// Accent text button: "Edit", "Add an injury or limit".
struct SettingsTextButtonStyle: ButtonStyle {
    var foreground: Color = .coral
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .opacity(isEnabled ? (configuration.isPressed ? 0.6 : 1) : 0.5)
    }
}

/// Full-width accent button used to submit a form ("Save").
struct SettingsSubmitButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Color.coral, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.5)
    }
}

/// Label above a field.
struct SettingsFieldLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.system(size: 12)).foregroundStyle(Color.muted).padding(.horizontal, 4)
    }
}

/// The web's input-base: sunk rounded field.
struct SettingsInput: ViewModifier {
    var numeric = false
    var readOnly = false
    func body(content: Content) -> some View {
        content
            .font(numeric ? .num(18, weight: .bold) : .system(size: 16))
            .foregroundStyle(readOnly ? Color.muted : Color.fg)
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .background(Color.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

extension View {
    func settingsInput(numeric: Bool = false, readOnly: Bool = false) -> some View {
        modifier(SettingsInput(numeric: numeric, readOnly: readOnly))
    }
}

/// Selectable value with a Copy button that turns into "✓ Copied" for 1.6 s.
struct SettingsCopyField: View {
    let label: String
    let value: String
    @State private var copied = false
    @State private var resetTask: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SettingsFieldLabel(label)
            HStack(spacing: 8) {
                Text(value)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.fg2)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button(action: copy) {
                    HStack(spacing: 6) {
                        if copied {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .heavy))
                                .transition(.scale.combined(with: .opacity))
                        }
                        Text(copied ? "Copied" : "Copy")
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(copied ? Color.settingsInfo : Color.fg)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(copied ? Color.settingsInfoBg : Color.surface3, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(copied ? "\(label) copied" : "Copy \(label)")
            }
            .padding(.leading, 14)
            .padding(.trailing, 6)
            .padding(.vertical, 6)
            .background(Color.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func copy() {
        UIPasteboard.general.string = value
        Haptics.tick()
        withAnimation(.easeOut(duration: 0.2)) { copied = true }
        resetTask?.cancel()
        resetTask = Task {
            try? await Task.sleep(for: .seconds(1.6))
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.2)) { copied = false }
        }
    }
}

/// Wrapping row of tags (blocked movements).
struct SettingsFlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for i in row.indices {
                let size = subviews[i].sizeThatFits(.unspecified)
                subviews[i].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for (i, view) in subviews.enumerated() {
            let size = view.sizeThatFits(.unspecified)
            if !row.indices.isEmpty, row.width + spacing + size.width > width {
                rows.append(row)
                row = Row()
            }
            row.width += (row.indices.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.indices.append(i)
        }
        if !row.indices.isEmpty { rows.append(row) }
        return rows
    }
}

enum SettingsFormat {
    /// "07:12" within 20 h (in the athlete's zone), else "3 d ago".
    static func syncedAt(_ iso: String?, timezone: String) -> String {
        guard let d = Dates.instant(iso) else { return "never" }
        if Date().timeIntervalSince(d) < 20 * 3600 { return Dates.time(iso, timezone: timezone) ?? Dates.ago(iso) }
        return Dates.ago(iso)
    }

    /// "10/10, 07:12" like the web's en-GB toLocaleString.
    static func dayTime(_ iso: String, timezone: String) -> String {
        guard let d = Dates.instant(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.dateFormat = "dd/MM, HH:mm"
        if let tz = TimeZone(identifier: timezone) { f.timeZone = tz }
        return f.string(from: d)
    }

    /// Local "ago" for a Date (HealthSync keeps Dates, not strings).
    static func ago(_ d: Date?) -> String {
        guard let d else { return "never" }
        let s = Int(Date().timeIntervalSince(d))
        if s < 60 { return "just now" }
        if s < 3600 { return "\(s / 60) min ago" }
        if s < 86400 { return "\(s / 3600) h ago" }
        return "\(s / 86400) d ago"
    }

    /// 7.5 → "7.5", 7 → "7".
    static func number(_ v: Double) -> String { String(format: "%g", v) }
}
