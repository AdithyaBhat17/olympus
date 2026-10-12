import OlympusCore
import SwiftUI
import WebKit

/// A 3D form cue, as a sheet: native header, the web's viewer in a web view
/// (/embed/form/:cue). Its "Got it, back to set" posts "close" to us.
struct FormCueView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let route: Router.FormCueRoute

    var body: some View {
        Loadable(load: {
            try await model.api.get(
                "form/\(route.cue)",
                query: route.exerciseId.map { ["ex": $0] } ?? [:],
                as: FormCueScreen.self
            )
        }) { screen, _ in
            VStack(spacing: 0) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(screen.eyebrow)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.muted)
                        Text(screen.title)
                            .font(.system(size: 30, weight: .heavy))
                            .tracking(-0.3)
                            .foregroundStyle(Color.fg)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                    // The close button is the overlay below, in this spot.
                    Color.clear.frame(width: 44, height: 44)
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 8)

                if let url = URL(string: screen.embedUrl) {
                    FormCueWebView(url: url) { dismiss() }
                } else {
                    ErrorState(message: "This form cue can't be shown.") { dismiss() }
                }
            }
        }
        .overlay(alignment: .topTrailing) {
            // While loading (or on an error) there's no header yet: keep a way out.
            FormCueCloseOverlay { dismiss() }
        }
        .background(Color.bg.ignoresSafeArea())
        .presentationBackground(Color.bg)
        .presentationDragIndicator(.visible)
    }
}

/// Close, always on top: before the header loads, on an error, and in the header's spot after.
private struct FormCueCloseOverlay: View {
    let close: () -> Void
    var body: some View {
        Button(action: close) {
            Image(systemName: "xmark")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Color.fg)
                .frame(width: 44, height: 44)
                .background(Color.surface2, in: Circle())
        }
        .accessibilityLabel("Close")
        .padding(.trailing, 20)
        .padding(.top, 20)
    }
}

/// WKWebView with the "olympus" message handler the embedded viewer posts to.
struct FormCueWebView: UIViewRepresentable {
    let url: URL
    let onClose: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onClose: onClose) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "olympus")
        config.allowsInlineMediaPlayback = true
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(Color.bg)
        web.scrollView.backgroundColor = UIColor(Color.bg)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.navigationDelegate = context.coordinator
        web.load(URLRequest(url: url))
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        context.coordinator.onClose = onClose
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "olympus")
        web.stopLoading()
    }

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var onClose: () -> Void

        init(onClose: @escaping () -> Void) { self.onClose = onClose }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.body as? String == "close" { onClose() }
        }

        /// Keep the viewer in place; anything else it links to opens in Safari.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            if action.navigationType == .linkActivated, let url = action.request.url {
                await UIApplication.shared.open(url)
                return .cancel
            }
            return .allow
        }
    }
}
