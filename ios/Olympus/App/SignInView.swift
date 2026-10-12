import SwiftUI
import UIKit

/// The web's /login: "Train. Log. Lift." and one Google button, plus the
/// server address (prefilled in debug builds, needed once for release).
struct SignInView: View {
    @Environment(AppModel.self) private var model
    @State private var server = ""
    @State private var editingServer = false
    @State private var busy = false
    @State private var appeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(["Train.", "Log.", "Lift."].enumerated()), id: \.offset) { i, word in
                    Text(word)
                        .font(.system(size: 64, weight: .heavy))
                        .tracking(-1.5)
                        .foregroundStyle(i == 2 ? Color.coral : Color.fg)
                        .offset(y: appeared ? 0 : 24)
                        .opacity(appeared ? 1 : 0)
                        .animation(.spring(duration: 0.6).delay(Double(i) * 0.08), value: appeared)
                }
            }
            Text("Your PT programs it through Claude. You lift.")
                .font(.system(size: 17))
                .foregroundStyle(Color.muted)
                .padding(.top, 12)
            Spacer()

            if let error = model.auth.lastError {
                Text(error)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.danger)
                    .padding(.bottom, 12)
            }

            if editingServer || model.auth.serverURL == nil {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Server").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.muted)
                    TextField("https://olympus.example.com", text: $server)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(.horizontal, 18)
                        .frame(height: 54)
                        .background(Color.surface, in: Capsule())
                }
                .padding(.bottom, 12)
            }

            Button {
                Task { await signIn() }
            } label: {
                HStack(spacing: 10) {
                    if busy { ProgressView().tint(.white) } else { Image(systemName: "person.crop.circle.fill") }
                    Text("Continue with Google")
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy)

            Button(editingServer ? "Done" : "Server: \(model.auth.serverURL?.host() ?? "not set")") {
                editingServer.toggle()
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Color.muted)
            .frame(maxWidth: .infinity)
            .padding(.top, 14)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
        .background(Color.bg.ignoresSafeArea())
        .onAppear {
            server = model.auth.serverURL?.absoluteString ?? ""
            appeared = true
        }
    }

    private func signIn() async {
        if editingServer || model.auth.serverURL == nil {
            guard model.auth.setServer(server) else {
                model.auth.lastError = "That server address doesn't look right."
                return
            }
            editingServer = false
        }
        guard let anchor = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else { return }
        busy = true
        await model.auth.signIn(presentationAnchor: anchor)
        busy = false
    }
}
