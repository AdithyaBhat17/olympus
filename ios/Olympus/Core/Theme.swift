import OlympusCore
import SwiftUI

/// Small-caps style section label ("RECOVERY").
struct SectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 13, weight: .bold))
            .tracking(0.6)
            .foregroundStyle(Color.muted)
    }
}

/// Eyebrow + big title, like the web's PageHeader.
struct PageHeader<Action: View>: View {
    let eyebrow: String?
    let title: String
    @ViewBuilder var action: () -> Action

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 4) {
                if let eyebrow {
                    Text(eyebrow).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.muted)
                }
                Text(title).font(.system(size: 40, weight: .heavy)).tracking(-0.5).foregroundStyle(Color.fg)
            }
            Spacer(minLength: 12)
            action()
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }
}

extension PageHeader where Action == EmptyView {
    init(eyebrow: String?, title: String) {
        self.init(eyebrow: eyebrow, title: title) { EmptyView() }
    }
}

/// Primary call to action: full-width coral capsule.
struct PrimaryButtonStyle: ButtonStyle {
    var tint: Color = .coral
    var foreground: Color = .white
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 19, weight: .heavy))
            .frame(maxWidth: .infinity, minHeight: 60)
            .background(tint, in: Capsule())
            .foregroundStyle(foreground)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .bold))
            .frame(maxWidth: .infinity, minHeight: 54)
            .background(Color.surface2, in: Capsule())
            .foregroundStyle(Color.fg)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

/// Rounded "pill" chip: tags and small buttons.
struct Pill: View {
    let text: String
    var tint: Color = .surface2
    var foreground: Color = .fg2
    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .bold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(tint, in: Capsule())
            .foregroundStyle(foreground)
    }
}

extension View {
    /// The web's card: surface fill, large continuous radius.
    func card(_ radius: CGFloat = 28, fill: Color = .surface) -> some View {
        background(fill, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// A bottom sheet as tall as its content (the web's Sheet): grabber, 40 pt
/// corners, warm background. The content must not stretch vertically.
struct FittedSheet: ViewModifier {
    @State private var height: CGFloat = 320

    func body(content: Content) -> some View {
        content
            .fixedSize(horizontal: false, vertical: true)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
            .frame(maxHeight: .infinity, alignment: .top)
            .presentationDetents([.height(height)])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(40)
            .presentationBackground(Color.bg)
    }
}

extension View {
    func fittedSheet() -> some View { modifier(FittedSheet()) }
}

/// A blur behind the status bar for full-screen scrolling views whose
/// background changes colour as they scroll (the session's colour block).
struct StatusBarBlur: View {
    /// Shown only once content has scrolled under the status bar.
    var visible = true

    var body: some View {
        GeometryReader { g in
            Rectangle()
                .fill(.ultraThinMaterial)
                .frame(height: g.safeAreaInsets.top)
                .ignoresSafeArea(edges: .top)
                .opacity(visible ? 1 : 0)
                .animation(.easeOut(duration: 0.2), value: visible)
        }
        .frame(height: 0)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

extension View {
    /// Whether this scroll view's content has moved up under the top edge.
    func trackScrolledPastTop(_ scrolled: Binding<Bool>) -> some View {
        onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 2 } action: { _, v in
            scrolled.wrappedValue = v
        }
    }
}
