import AuthenticationServices
import CryptoKit
import Foundation
import Observation

/// Sign-in through the server's own OAuth (src/server/oauth.ts): the built-in
/// public client "olympus-ios", authorization code + PKCE, refresh rotation.
/// The athlete signs in with Google in the system sheet, as on the web.
@MainActor
@Observable
final class Auth {
    static let clientId = "olympus-ios"
    static let redirectURI = "olympus://oauth/callback"

    private(set) var serverURL: URL?
    private(set) var isSignedIn: Bool
    var lastError: String?

    private var accessToken: String?
    private var accessExpiry: Date?
    private var refreshing: Task<String?, Never>?

    private enum Keys {
        static let server = "serverURL"
        static let refresh = "refreshToken"
        static let access = "accessToken"
        static let expiry = "accessExpiry"
    }

    init() {
        let saved = UserDefaults.standard.string(forKey: Keys.server)
        let bundled = Bundle.main.object(forInfoDictionaryKey: "OlympusServerURL") as? String
        serverURL = Self.normalized(saved ?? bundled ?? "")
        isSignedIn = Keychain.read(Keys.refresh) != nil
        accessToken = Keychain.read(Keys.access)
        accessExpiry = (UserDefaults.standard.object(forKey: Keys.expiry) as? Date)
    }

    func setServer(_ raw: String) -> Bool {
        guard let url = Self.normalized(raw) else { return false }
        serverURL = url
        UserDefaults.standard.set(url.absoluteString, forKey: Keys.server)
        return true
    }

    // MARK: Sign in

    func signIn(presentationAnchor: ASPresentationAnchor) async {
        guard let server = serverURL else {
            lastError = "Add the server address first."
            return
        }
        lastError = nil
        let verifier = Self.randomURLSafe(32)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded()
        let state = Self.randomURLSafe(16)

        var authorize = URLComponents(url: server.appending(path: "oauth/authorize"), resolvingAgainstBaseURL: false)!
        authorize.queryItems = [
            .init(name: "response_type", value: "code"),
            .init(name: "client_id", value: Self.clientId),
            .init(name: "redirect_uri", value: Self.redirectURI),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "state", value: state),
        ]

        do {
            let callback = try await WebAuth.start(url: authorize.url!, callbackScheme: "olympus", anchor: presentationAnchor)
            let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
            func item(_ name: String) -> String? { items.first { $0.name == name }?.value }
            if let error = item("error") {
                lastError = error == "access_denied" ? "Sign-in was cancelled." : (item("error_description") ?? error)
                return
            }
            guard item("state") == state, let code = item("code") else {
                lastError = "Sign-in didn't come back right. Try again."
                return
            }
            try await exchange([
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": Self.redirectURI,
                "client_id": Self.clientId,
                "code_verifier": verifier,
            ])
        } catch is WebAuth.Cancelled {
            // The athlete closed the sheet: nothing to say.
        } catch {
            lastError = error.localizedDescription
        }
    }

    func signOut() async {
        if let server = serverURL {
            for token in [Keychain.read(Keys.refresh), accessToken].compactMap({ $0 }) {
                var req = URLRequest(url: server.appending(path: "api/oauth/revoke"))
                req.httpMethod = "POST"
                req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
                req.httpBody = Self.form(["token": token, "client_id": Self.clientId])
                _ = try? await URLSession.shared.data(for: req)
            }
        }
        clear()
    }

    /// Drop the tokens without telling the server (it already said no).
    func clear() {
        ResponseCache.clear()
        Keychain.save(nil, for: Keys.refresh)
        Keychain.save(nil, for: Keys.access)
        UserDefaults.standard.removeObject(forKey: Keys.expiry)
        accessToken = nil
        accessExpiry = nil
        isSignedIn = false
    }

    // MARK: Tokens

    /// A live access token, refreshed when it's within a minute of expiring.
    func validAccessToken() async -> String? {
        if let accessToken, let accessExpiry, accessExpiry.timeIntervalSinceNow > 60 { return accessToken }
        return await refresh()
    }

    /// One refresh at a time: refresh tokens rotate, and the server treats a
    /// reused one as stolen and revokes everything.
    func refresh() async -> String? {
        if let refreshing { return await refreshing.value }
        let task = Task<String?, Never> { [weak self] in
            guard let self, let refresh = Keychain.read(Keys.refresh) else { return nil }
            do {
                try await self.exchange(["grant_type": "refresh_token", "refresh_token": refresh, "client_id": Self.clientId])
                return self.accessToken
            } catch TokenError.rejected {
                self.clear()
                return nil
            } catch {
                return nil // offline: keep the refresh token for later
            }
        }
        refreshing = task
        let token = await task.value
        refreshing = nil
        return token
    }

    private enum TokenError: Error { case rejected(String) }

    private struct TokenResponse: Decodable {
        let access_token: String
        let refresh_token: String
        let expires_in: Double
    }

    private func exchange(_ params: [String: String]) async throws {
        guard let server = serverURL else { throw URLError(.badURL) }
        var req = URLRequest(url: server.appending(path: "api/oauth/token"))
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = Self.form(params)
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        // A server hiccup isn't a verdict on the token: keep it and retry later.
        if status >= 500 || status == 0 { throw URLError(.badServerResponse) }
        guard (200..<300).contains(status), let t = try? JSONDecoder().decode(TokenResponse.self, from: data) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error_description"] as? String
            throw TokenError.rejected(message ?? "Sign-in failed (\(status))")
        }
        accessToken = t.access_token
        accessExpiry = Date().addingTimeInterval(t.expires_in)
        Keychain.save(t.access_token, for: Keys.access)
        Keychain.save(t.refresh_token, for: Keys.refresh)
        UserDefaults.standard.set(accessExpiry, forKey: Keys.expiry)
        isSignedIn = true
    }

    // MARK: Helpers

    /// "olympus.example.com" → https://olympus.example.com/
    static func normalized(_ raw: String) -> URL? {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        if !s.contains("://") { s = "https://" + s }
        if !s.hasSuffix("/") { s += "/" }
        guard let url = URL(string: s), let scheme = url.scheme, ["http", "https"].contains(scheme), url.host != nil else { return nil }
        return url
    }

    private static func form(_ params: [String: String]) -> Data {
        var c = URLComponents()
        c.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        return Data((c.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").utf8)
    }

    private static func randomURLSafe(_ bytes: Int) -> String {
        var b = [UInt8](repeating: 0, count: bytes)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes, &b)
        return Data(b).base64URLEncoded()
    }
}

extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

/// ASWebAuthenticationSession as async/await. Not ephemeral on purpose: the
/// site's sign-in cookie then carries over to Whoop's connect flow.
enum WebAuth {
    struct Cancelled: Error {}

    /// The session on screen. ASWebAuthenticationSession has to be kept alive by its owner.
    @MainActor private static var current: (session: ASWebAuthenticationSession, provider: AnchorProvider)?

    @MainActor
    static func start(url: URL, callbackScheme: String, anchor: ASPresentationAnchor) async throws -> URL {
        let provider = AnchorProvider(anchor: anchor)
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callback: .customScheme(callbackScheme)) { callback, error in
                Task { @MainActor in current = nil }
                if let callback {
                    continuation.resume(returning: callback)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: Cancelled())
                } else {
                    continuation.resume(throwing: error ?? Cancelled())
                }
            }
            session.presentationContextProvider = provider
            session.prefersEphemeralWebBrowserSession = false
            current = (session, provider)
            if !session.start() {
                current = nil
                continuation.resume(throwing: Cancelled())
            }
        }
    }

    private final class AnchorProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
        let anchor: ASPresentationAnchor
        init(anchor: ASPresentationAnchor) { self.anchor = anchor }
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor }
    }
}
