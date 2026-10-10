import OlympusCore
import SwiftUI

/// Colours the live session and finish screens use that the shared Theme doesn't
/// name (tailwind.config.ts: info = berry, accent = coral, danger tints).
enum SessionPalette {
    static let info = Color.berry
    static let infoBg = Color.berry.opacity(0.1)
    static let accentBg = Color.coral.opacity(0.1)
    static let accentLine = Color.coral.opacity(0.35)
    static let dangerBg = Color.danger.opacity(0.1)
    static let dangerLine = Color.danger.opacity(0.35)
    static let dangerDot = Color.danger.opacity(0.15)
    static let key = Color.surface3
    static let line = Color.lineStrong.opacity(0.6)
}

/// "Lower Body — Quad Dominant" → "Lower Body, Quad Dominant" (formatCategory).
func sessionCategory(_ category: String) -> String {
    category.replacingOccurrences(of: " — ", with: ", ")
}

/// "W1" for warm-ups, then 1, 2, 3 for working sets (set-table.tsx setLabels).
func sessionSetLabels(_ sets: [LiveSet]) -> [String] {
    var w = 0
    var n = 0
    return sets.map { s in
        let type = s.logged?.type ?? s.planned?.type ?? .working
        if type == .warmup {
            w += 1
            return "W\(w)"
        }
        n += 1
        return String(n)
    }
}

/// Round 44pt button on a colour block ("btn-round on-k").
struct SessionRoundButton: View {
    let systemImage: String
    let label: String
    var foreground: Color = .white
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 17, weight: .bold))
                .frame(width: 44, height: 44)
                .background(foreground.opacity(0.18), in: Circle())
                .foregroundStyle(foreground)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Soft pressable capsule ("btn-secondary" on the light sheet).
struct SessionSoftButtonStyle: ButtonStyle {
    var fill: Color = .surface2
    var foreground: Color = .fg
    var height: CGFloat = 52
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .bold))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, minHeight: height)
            .padding(.horizontal, 8)
            .background(fill, in: Capsule())
            .foregroundStyle(foreground)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

/// The light panel that overlaps the colour block ("sheet-over").
struct SessionSheetOver: ViewModifier {
    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 40, topTrailingRadius: 40, style: .continuous)
                    .fill(Color.bg)
            )
            .padding(.top, -40)
    }
}

extension View {
    func sessionSheetOver() -> some View { modifier(SessionSheetOver()) }
}

/// Bottom sheet chrome (sheet.tsx): 40 pt corners, grabber, sized to its content.
struct SessionBottomSheet: ViewModifier {
    let height: CGFloat
    func body(content: Content) -> some View {
        content
            .presentationDetents([.height(min(max(height, 200), 900))])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(40)
            .presentationBackground(Color.bg)
    }
}

extension View {
    func sessionBottomSheet(height: CGFloat) -> some View { modifier(SessionBottomSheet(height: height)) }

    /// Reports this view's height (for sizing a sheet to its content).
    func sessionMeasureHeight(_ height: Binding<CGFloat>) -> some View {
        onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height.wrappedValue = $0 }
    }
}
