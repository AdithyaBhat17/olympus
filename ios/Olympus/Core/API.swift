import Foundation
import OlympusCore

/// A problem the athlete should see. `message` is the server's own wording
/// (DomainError text from src/server) whenever it sent one.
struct APIError: LocalizedError, Equatable {
    let status: Int
    let message: String
    var errorDescription: String? { message }

    static let offline = APIError(status: 0, message: "You're offline. Try again when you're back on.")
    static let signedOut = APIError(status: 401, message: "Sign in again.")
}

/// /api/v1, with the app's OAuth token. Refreshes once on a 401.
@MainActor
final class API {
    let auth: Auth
    private let session: URLSession

    init(auth: Auth) {
        self.auth = auth
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.waitsForConnectivity = false
        session = URLSession(configuration: config)
    }

    static let decoder = JSONDecoder()
    static let encoder = JSONEncoder()

    // MARK: Requests

    /// Reads are cached on disk: offline, a screen shows what it last showed
    /// instead of an error (the web gets the same from its service worker).
    func get<T: Decodable>(_ path: String, query: [String: String] = [:], as: T.Type = T.self) async throws -> T {
        let key = ResponseCache.key(path, query)
        do {
            let data = try await send("GET", path, query: query, body: nil)
            ResponseCache.save(data, for: key)
            return try decode(data)
        } catch let error as APIError where error == .offline {
            guard let cached = ResponseCache.load(key) else { throw error }
            return try decode(cached)
        }
    }

    func post<T: Decodable>(_ path: String, _ body: (some Encodable)? = Optional<Empty>.none, as: T.Type = T.self) async throws -> T {
        try decode(try await send("POST", path, body: try encode(body)))
    }

    func put<T: Decodable>(_ path: String, _ body: some Encodable, as: T.Type = T.self) async throws -> T {
        try decode(try await send("PUT", path, body: try encode(body)))
    }

    func patch<T: Decodable>(_ path: String, _ body: some Encodable, as: T.Type = T.self) async throws -> T {
        try decode(try await send("PATCH", path, body: try encode(body)))
    }

    func delete(_ path: String, _ body: (some Encodable)? = Optional<Empty>.none) async throws {
        _ = try await send("DELETE", path, body: try encode(body))
    }

    /// Fire-and-forget style calls that only care whether it worked.
    func post(_ path: String, _ body: (some Encodable)? = Optional<Empty>.none) async throws {
        _ = try await send("POST", path, body: try encode(body))
    }

    func put(_ path: String, _ body: some Encodable) async throws {
        _ = try await send("PUT", path, body: try encode(body))
    }

    /// The raw call: status-checked body bytes.
    func send(_ method: String, _ path: String, query: [String: String] = [:], body: Data?) async throws -> Data {
        guard let server = auth.serverURL else { throw APIError(status: 0, message: "Add the server address in Settings.") }
        var url = server.appending(path: "api/v1/" + path)
        if !query.isEmpty { url.append(queryItems: query.map { URLQueryItem(name: $0.key, value: $0.value) }) }

        for attempt in 0..<2 {
            guard let token = attempt == 0 ? await auth.validAccessToken() : await auth.refresh() else {
                throw auth.isSignedIn ? APIError.offline : APIError.signedOut
            }
            var req = URLRequest(url: url)
            req.httpMethod = method
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let body {
                req.httpBody = body
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
            let data: Data
            let response: URLResponse
            do {
                (data, response) = try await session.data(for: req)
            } catch let error as URLError where error.code == .cancelled {
                // The screen went away mid-request: not the network's fault, nothing to show.
                throw CancellationError()
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                throw APIError.offline
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401, attempt == 0 { continue }
            if status == 401 {
                auth.clear()
                throw APIError.signedOut
            }
            guard (200..<300).contains(status) else {
                let message = (try? Self.decoder.decode(ErrorBody.self, from: data))?.error
                throw APIError(status: status, message: message ?? "Something went wrong (\(status)).")
            }
            return data
        }
        throw APIError.signedOut
    }

    struct Empty: Codable {}
    private struct ErrorBody: Decodable { let error: String }

    private func encode(_ body: (some Encodable)?) throws -> Data? {
        guard let body else { return nil }
        return try Self.encoder.encode(body)
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        if T.self == Empty.self { return Empty() as! T }
        do {
            return try Self.decoder.decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("Decode \(T.self) failed:", error)
            #endif
            throw APIError(status: 0, message: "The server sent something this version of the app doesn't understand. Update the app?")
        }
    }
}

/// Runs queued gym-floor writes against /api/v1 (see OlympusCore.Outbox).
struct OutboxRunner: OutboxExecutor {
    let api: API

    func execute(_ op: OutboxOp) async -> ExecuteResult {
        let (method, path, body) = Self.request(for: op)
        do {
            let data = try await api.send(method, path, body: body)
            return .ok(data)
        } catch let error as APIError {
            // No answer, or signed out for now: keep it queued and retry later.
            if error.status == 0 || error.status == 401 || error.status >= 500 { return .networkFailure }
            return .rejected(error.message)
        } catch {
            return .networkFailure
        }
    }

    private struct Notes: Encodable { let notes: String? }

    static func request(for op: OutboxOp) -> (String, String, Data?) {
        let e = JSONEncoder()
        switch op {
        case let .logSet(s, input): return ("POST", "sessions/\(s)/sets", try? e.encode(input))
        case let .removeSet(s, input): return ("DELETE", "sessions/\(s)/sets", try? e.encode(input))
        case let .resolveFlag(id): return ("POST", "flags/\(id)/resolve", nil)
        case let .checkIn(input): return ("POST", "check-ins", try? e.encode(input))
        case let .saveNotes(s, notes): return ("PUT", "sessions/\(s)/notes", try? e.encode(Notes(notes: notes)))
        case let .finish(s, notes): return ("POST", "sessions/\(s)/finish", try? e.encode(Notes(notes: notes)))
        case let .sendToPT(s, notes): return ("POST", "sessions/\(s)/send", try? e.encode(Notes(notes: notes)))
        }
    }
}

/// Last good GET responses, in Caches (the system may purge them; that's fine).
enum ResponseCache {
    private static let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("api", isDirectory: true)

    static func key(_ path: String, _ query: [String: String]) -> String {
        let q = query.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "&")
        let raw = q.isEmpty ? path : "\(path)?\(q)"
        return Data(raw.utf8).base64URLEncoded()
    }

    static func save(_ data: Data, for key: String) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? data.write(to: dir.appendingPathComponent(key), options: .atomic)
    }

    static func load(_ key: String) -> Data? {
        try? Data(contentsOf: dir.appendingPathComponent(key))
    }

    /// On sign-out: the next person on this phone shouldn't see the last one's data.
    static func clear() {
        try? FileManager.default.removeItem(at: dir)
    }
}
