import OlympusCore
import SwiftUI

// Shared with the widget extension (the workout Live Activity).

/// The Coral palette from src/app/globals.css (:root and the .kind-* blocks).
extension Color {
    init(rgb r: Double, _ g: Double, _ b: Double) { self.init(red: r / 255, green: g / 255, blue: b / 255) }

    static let bg = Color(rgb: 251, 246, 244)
    static let surface = Color(rgb: 243, 232, 228)
    static let surface2 = Color(rgb: 238, 226, 221)
    static let surface3 = Color(rgb: 233, 217, 211)
    static let lineStrong = Color(rgb: 220, 200, 192)
    static let fg = Color(rgb: 30, 20, 18)
    static let fg2 = Color(rgb: 63, 48, 44)
    static let muted = Color(rgb: 116, 98, 93)
    static let faint = Color(rgb: 156, 138, 132)
    static let coral = Color(rgb: 198, 61, 34)
    static let coralDeep = Color(rgb: 143, 41, 20)
    static let berry = Color(rgb: 142, 59, 94)
    static let apricot = Color(rgb: 242, 166, 90)
    static let apricotInk = Color(rgb: 61, 31, 5)
    static let danger = Color(rgb: 179, 38, 30)
    static let dangerInk = Color(rgb: 140, 29, 24)
}

/// A session type's colour block: background, text on it, and text on the page.
struct KindColors {
    let k: Color
    let on: Color
    let text: Color
    let k3: Color

    init(_ kind: SessionKind) {
        switch kind {
        case .coral: (k, on, text, k3) = (.coral, .white, .coral, Color(rgb: 230, 125, 98))
        case .berry: (k, on, text, k3) = (.berry, .white, .berry, Color(rgb: 186, 112, 143))
        case .apricot: (k, on, text, k3) = (.apricot, .apricotInk, Color(rgb: 154, 79, 12), Color(rgb: 248, 201, 156))
        case .ink: (k, on, text, k3) = (.fg, .white, .fg, Color(rgb: 97, 74, 65))
        }
    }

    init(type: String?) { self.init(SessionKind(type)) }
}

extension Font {
    /// The web's "num" numerals: SF Pro Rounded, extrabold, tabular.
    static func num(_ size: CGFloat, weight: Font.Weight = .heavy) -> Font {
        .system(size: size, weight: weight, design: .rounded).monospacedDigit()
    }
}
