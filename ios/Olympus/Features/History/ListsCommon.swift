import OlympusCore
import SwiftUI

// Pieces shared by the Log, Progress and Library tabs.

/// Push the progress screen for an exercise (Progress list, Library).
struct ExerciseRoute: Hashable {
    let id: String
}

/// Push "Log a session" from the Log tab.
struct ManualLogRoute: Hashable {}

enum ListsFormat {
    /// "Upper Body — Push (Vertical)" → "Upper Body, Push (Vertical)" (formatCategory).
    static func category(_ c: String) -> String { c.replacingOccurrences(of: " — ", with: ", ") }

    /// "2026-10-02" → "02/10" (formatDdMm).
    static func ddmm(_ iso: String) -> String {
        let p = iso.split(separator: "-")
        return p.count == 3 ? "\(p[2])/\(p[1])" : iso
    }

    /// Words of a search box, lowercased; every word must appear in the haystack.
    static func matches(_ query: String, _ haystack: String) -> Bool {
        let words = query.lowercased().split(whereSeparator: \.isWhitespace)
        guard !words.isEmpty else { return true }
        let hay = haystack.lowercased()
        return words.allSatisfy { hay.contains($0) }
    }

    /// "8,5" or "8.5" → 8.5.
    static func decimal(_ s: String) -> Double? {
        Double(s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }
}

/// The web's .search-field: surface capsule with a magnifier.
struct ListsSearchField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.muted)
                .accessibilityHidden(true)
            TextField(placeholder, text: $text, prompt: Text(placeholder).foregroundStyle(Color.faint))
                .font(.system(size: 16))
                .foregroundStyle(Color.fg)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .accessibilityLabel(placeholder)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Color.faint)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .background(Color.surface, in: Capsule())
    }
}

/// The web's .chip / .chip-on filter button.
struct ListsChip: View {
    let label: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tick()
            withAnimation(.snappy(duration: 0.2)) { action() }
        } label: {
            Text(label)
                .font(.system(size: 15, weight: .heavy))
                .padding(.horizontal, 18)
                .frame(height: 44)
                .background(selected ? Color.fg : Color.surface, in: Capsule())
                .foregroundStyle(selected ? Color.bg : Color.fg)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Trailing row chevron.
struct ListsChevron: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(Color.faint)
            .accessibilityHidden(true)
    }
}

/// Press feedback for big rows (the web's .press-soft).
struct ListsRowPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

/// Small capsule button (the web's .btn-ghost / accent variants) for sheets and inline forms.
struct ListsSmallButtonStyle: ButtonStyle {
    var tint: Color = .surface2
    var foreground: Color = .fg2
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(tint, in: Capsule())
            .foregroundStyle(foreground)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

/// Text field styled like the web's .input-base.
struct ListsInputStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 16))
            .foregroundStyle(Color.fg)
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
            .background(Color.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

extension View {
    func listsInput() -> some View { modifier(ListsInputStyle()) }
}

/// Lays children out left to right and wraps (tags under a library row).
struct ListsFlow: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, maxX: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0, x + s.width > width {
                x = 0
                y += rowH + spacing
                rowH = 0
            }
            x += s.width + spacing
            maxX = max(maxX, x - spacing)
            rowH = max(rowH, s.height)
        }
        return CGSize(width: maxX, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX, x + s.width > bounds.maxX {
                x = bounds.minX
                y += rowH + spacing
                rowH = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}

// MARK: - Bodies that must send JSON null explicitly (zod .nullable() rejects a missing key)

struct ListsBlockBody: Encodable {
    let reason: String?
    enum CodingKeys: String, CodingKey { case reason }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(reason, forKey: .reason)
    }
}

struct ListsCarriageBody: Encodable {
    let kgPerSide: Double?
    enum CodingKeys: String, CodingKey { case kgPerSide }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kgPerSide, forKey: .kgPerSide)
    }
}

struct ListsCreateExerciseBody: Encodable {
    let name: String
    let category: String
}

struct ListsCreatedExercise: Decodable {
    let exercise: ManualLogOptions.Exercise
}
