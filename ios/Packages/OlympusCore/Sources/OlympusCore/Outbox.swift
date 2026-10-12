import Foundation

// The gym-floor write queue, same rules as the web's src/lib/offline/outbox.ts.
// Every op carries absolute values (set index + full set, water total, whole
// notes text), so replaying one after a reconnect is idempotent.
//
//   send(op)  online and nothing queued: run it now. Network failure, or ops
//             already queued: persist (FIFO, coalesced by key), return .queued.
//   flush()   replay in order; stop at the first network failure.
//
// A domain rejection (validation, finished session…) returns .rejected so the
// caller can roll back its optimistic state.

public struct LogSetInput: Codable, Hashable, Sendable {
    public var exerciseId: String
    public var planItemId: String?
    public var setIndex: Int
    public var platesKg: Double?
    public var weight: Double?
    public var reps: Int
    public var rpe: Double?
    public var type: PlanSet.Kind?
    public var blockedOverride: Bool?

    public init(exerciseId: String, planItemId: String?, setIndex: Int, platesKg: Double? = nil, weight: Double? = nil, reps: Int, rpe: Double? = nil, type: PlanSet.Kind? = nil, blockedOverride: Bool? = nil) {
        self.exerciseId = exerciseId
        self.planItemId = planItemId
        self.setIndex = setIndex
        self.platesKg = platesKg
        self.weight = weight
        self.reps = reps
        self.rpe = rpe
        self.type = type
        self.blockedOverride = blockedOverride
    }
}

public struct RemoveSetInput: Codable, Hashable, Sendable {
    public var exerciseId: String
    public var planItemId: String?
    public var setIndex: Int
    public init(exerciseId: String, planItemId: String?, setIndex: Int) {
        self.exerciseId = exerciseId
        self.planItemId = planItemId
        self.setIndex = setIndex
    }
}

/** A check-in patch: a nil field isn't sent; `.some(nil)` clears it. */
public struct CheckInInput: Codable, Hashable, Sendable {
    public var date: String?
    public var sleepMin: Int??
    public var proteinG: Int??
    public var waterMl: Int??

    public init(date: String?, sleepMin: Int?? = nil, proteinG: Int?? = nil, waterMl: Int?? = nil) {
        self.date = date
        self.sleepMin = sleepMin
        self.proteinG = proteinG
        self.waterMl = waterMl
    }

    /** Later fields win; untouched ones are kept (a queued water +250 keeps a queued sleep edit). */
    public func merging(_ newer: CheckInInput) -> CheckInInput {
        CheckInInput(
            date: newer.date ?? date,
            sleepMin: newer.sleepMin ?? sleepMin,
            proteinG: newer.proteinG ?? proteinG,
            waterMl: newer.waterMl ?? waterMl
        )
    }

    enum CodingKeys: String, CodingKey { case date, sleepMin, proteinG, waterMl }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        date = try c.decodeIfPresent(String.self, forKey: .date)
        func field(_ k: CodingKeys) throws -> Int?? {
            guard c.contains(k) else { return nil }
            return .some(try c.decodeNil(forKey: k) ? nil : try c.decode(Int.self, forKey: k))
        }
        sleepMin = try field(.sleepMin)
        proteinG = try field(.proteinG)
        waterMl = try field(.waterMl)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(date, forKey: .date)
        func field(_ v: Int??, _ k: CodingKeys) throws {
            switch v {
            case .none: break
            case .some(.none): try c.encodeNil(forKey: k)
            case .some(.some(let x)): try c.encode(x, forKey: k)
            }
        }
        try field(sleepMin, .sleepMin)
        try field(proteinG, .proteinG)
        try field(waterMl, .waterMl)
    }
}

public enum OutboxOp: Codable, Hashable, Sendable {
    case logSet(sessionId: String, input: LogSetInput)
    case removeSet(sessionId: String, input: RemoveSetInput)
    case resolveFlag(id: String)
    case checkIn(CheckInInput)
    case saveNotes(sessionId: String, notes: String?)
    case finish(sessionId: String, notes: String?)
    case sendToPT(sessionId: String, notes: String?)

    /** Ops with the same key supersede each other while queued. */
    public var key: String {
        switch self {
        case let .logSet(s, i): return "set:\(s):\(i.exerciseId):\(i.planItemId ?? "-"):\(i.setIndex)"
        case let .removeSet(s, i): return "set:\(s):\(i.exerciseId):\(i.planItemId ?? "-"):\(i.setIndex)"
        case let .resolveFlag(id): return "flag:\(id)"
        case let .checkIn(i): return "checkin:\(i.date ?? "today")"
        case let .saveNotes(s, _): return "notes:\(s)"
        case let .finish(s, _): return "finish:\(s)"
        case let .sendToPT(s, _): return "sendToPT:\(s)"
        }
    }
}

public enum ExecuteResult: Sendable {
    /** The response body (decode it for logSet's result). */
    case ok(Data)
    /** The server said no; show `message`, don't retry. */
    case rejected(String)
    /** No answer (offline, timeout, signed out for now): keep it and retry. */
    case networkFailure
}

public enum SendResult: Sendable {
    case ok(Data)
    case queued
    case rejected(String)
}

public protocol OutboxExecutor: Sendable {
    func execute(_ op: OutboxOp) async -> ExecuteResult
}

public struct FlushReport: Sendable {
    public var synced: Int
    public var rejected: [String]
}

public actor Outbox {
    struct Entry: Codable {
        var id: String
        var key: String
        var op: OutboxOp
        var createdAt: Date
        var attempts: Int
    }

    private let fileURL: URL
    private let executor: OutboxExecutor
    private var entries: [Entry]
    private var flushing: Task<FlushReport, Never>?
    private var listeners: [UUID: @Sendable (Int) -> Void] = [:]

    public init(fileURL: URL, executor: OutboxExecutor) {
        self.fileURL = fileURL
        self.executor = executor
        if let data = try? Data(contentsOf: fileURL), let saved = try? JSONDecoder().decode([Entry].self, from: data) {
            entries = saved
        } else {
            entries = []
        }
    }

    public var pendingCount: Int { entries.count }

    /** Called with the pending count now and on every change. Returns a token for `unsubscribe`. */
    public func subscribe(_ fn: @escaping @Sendable (Int) -> Void) -> UUID {
        let id = UUID()
        listeners[id] = fn
        fn(entries.count)
        return id
    }

    public func unsubscribe(_ id: UUID) { listeners[id] = nil }

    public func send(_ op: OutboxOp) async -> SendResult {
        // Never jump the queue: a later op must not land before an earlier one.
        if !entries.isEmpty || flushing != nil {
            enqueue(op)
            Task { await self.flush() }
            return .queued
        }
        switch await executor.execute(op) {
        case let .ok(data): return .ok(data)
        case let .rejected(message): return .rejected(message)
        case .networkFailure:
            enqueue(op)
            return .queued
        }
    }

    /**
     * Replay queued ops in order. One run at a time: a call made mid-run waits
     * for it, then runs again, so "flush now" after a reconnect really retries.
     */
    @discardableResult
    public func flush() async -> FlushReport {
        while let running = flushing { _ = await running.value }
        if entries.isEmpty { return FlushReport(synced: 0, rejected: []) }
        let task = Task {
            let report = await self.runFlush()
            // Cleared by the run itself, before anyone awaiting it resumes.
            self.endFlush()
            return report
        }
        flushing = task
        return await task.value
    }

    private func endFlush() {
        flushing = nil
        notify()
    }

    private func runFlush() async -> FlushReport {
        var report = FlushReport(synced: 0, rejected: [])
        for entry in entries.sorted(by: { $0.createdAt < $1.createdAt }) {
            switch await executor.execute(entry.op) {
            case .ok:
                remove(entry.id)
                report.synced += 1
            case let .rejected(message):
                remove(entry.id)
                report.rejected.append(message)
            case .networkFailure:
                if let i = entries.firstIndex(where: { $0.id == entry.id }) { entries[i].attempts += 1 }
                persist()
                return report
            }
        }
        return report
    }

    private func enqueue(_ op: OutboxOp) {
        let key = op.key
        var merged = op
        for e in entries where e.key == key {
            if case let .checkIn(older) = e.op, case let .checkIn(newer) = op {
                merged = .checkIn(older.merging(newer))
            }
        }
        entries.removeAll { $0.key == key }
        // Strictly increasing timestamps keep FIFO order even within one clock tick.
        let now = max(Date(), (entries.map(\.createdAt).max() ?? .distantPast).addingTimeInterval(0.001))
        entries.append(Entry(id: UUID().uuidString, key: key, op: merged, createdAt: now, attempts: 0))
        persist()
        notify()
    }

    private func remove(_ id: String) {
        entries.removeAll { $0.id == id }
        persist()
    }

    private func persist() {
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(entries).write(to: fileURL, options: .atomic)
        } catch {
            // Disk full or similar: the queue still lives in memory until relaunch.
        }
    }

    private func notify() {
        let n = entries.count
        for fn in listeners.values { fn(n) }
    }
}
