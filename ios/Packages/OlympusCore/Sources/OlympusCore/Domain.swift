import Foundation

// Ports of the domain helpers the web runs in the browser (src/domain/load.ts,
// src/domain/recovery.ts, src/domain/rotation.ts, src/domain/export.ts and
// src/components/session/format.ts). Rules that only the server applies
// (validation, flags, progression) stay on the server.

// MARK: - Load maths

/** Nearest 0.05 kg, so 17.5 + 3.6 stays 21.1. */
public func roundKg(_ kg: Double) -> Double { (kg * 20).rounded() / 20 }

/** True load: PER_SIDE adds the carriage to the plates on one side. */
public func trueKg(loadMode: LoadMode, carriageKgPerSide: Double?, platesKg: Double) -> Double {
    loadMode == .perSide ? roundKg(platesKg + (carriageKgPerSide ?? 0)) : roundKg(platesKg)
}

/** Inverse of trueKg: what to load to hit a true target. */
public func platesFor(loadMode: LoadMode, carriageKgPerSide: Double?, targetTrueKg: Double) -> Double {
    loadMode == .perSide ? roundKg(max(0, targetTrueKg - (carriageKgPerSide ?? 0))) : roundKg(targetTrueKg)
}

public let plateSizes: [Double] = [25, 20, 15, 10, 5, 2.5, 1.25]
public let barKg: Double = 20

/** Barbell by kit, by name only when the kit isn't recorded. */
public func isBarbell(name: String, equipment: String?) -> Bool {
    if let equipment, !equipment.isEmpty { return equipment == "barbell" }
    return name.range(of: #"\bbarbell\b|deadlift"#, options: [.regularExpression, .caseInsensitive]) != nil
}

public struct PlateBreakdown: Equatable, Sendable {
    /** One side, largest first. */
    public var plates: [Double]
    /** True kg standard plates can't make; negative when lighter than the bar. */
    public var leftover: Double
}

public func plateBreakdown(_ ex: ExerciseMeta, targetTrueKg: Double) -> PlateBreakdown? {
    var side: Double
    let sides: Double
    if ex.loadMode == .perSide, ex.carriageKgPerSide != nil {
        side = platesFor(loadMode: ex.loadMode, carriageKgPerSide: ex.carriageKgPerSide, targetTrueKg: targetTrueKg)
        sides = 1
    } else if ex.loadMode == .total, isBarbell(name: ex.name, equipment: ex.equipment) {
        if targetTrueKg < barKg { return PlateBreakdown(plates: [], leftover: roundKg(targetTrueKg - barKg)) }
        side = (targetTrueKg - barKg) / 2
        sides = 2
    } else {
        return nil
    }
    var plates: [Double] = []
    for p in plateSizes {
        while side + 1e-9 >= p {
            side -= p
            plates.append(p)
        }
    }
    return PlateBreakdown(plates: plates, leftover: roundKg(max(0, side * sides)))
}

/** Lower counterweight is harder; everything else, higher is harder. */
public func isHarder(_ mode: LoadMode, _ a: Double, _ b: Double) -> Bool {
    mode == .counterweight ? a < b : a > b
}

/** Positive when `next` progresses on `prev`. */
public func progressDelta(_ mode: LoadMode, prev: Double, next: Double) -> Double {
    roundKg(mode == .counterweight ? prev - next : next - prev)
}

public func topSet(_ mode: LoadMode, _ sets: [SetLogEntry]) -> SetLogEntry? {
    let working = sets.filter { $0.type != .warmup }
    let pool = working.isEmpty ? sets : working
    var best: SetLogEntry?
    for s in pool {
        guard let b = best else { best = s; continue }
        if isHarder(mode, s.weight, b.weight) || (s.weight == b.weight && s.reps > b.reps) { best = s }
    }
    return best
}

// MARK: - Formatting

/** 85 → "85", 21.1 → "21.1", like the web's String(roundKg(kg)). */
public func formatKg(_ kg: Double) -> String {
    if kg == kg.rounded(), abs(kg) < 1e15 { return String(Int(kg)) }
    let r = roundKg(kg)
    if r == r.rounded() { return String(Int(r)) }
    return String(r)
}

/** "47 cw", "21.1/side", "85"; cardio has no load. */
public func formatLoad(_ mode: LoadMode, _ kg: Double) -> String {
    switch mode {
    case .time: return "—"
    case .counterweight: return "\(formatKg(kg)) cw"
    case .perSide: return "\(formatKg(kg))/side"
    case .total: return formatKg(kg)
    }
}

/** "47 kg", "47 cw", "21.1/side". */
public func loadWithUnit(_ mode: LoadMode, _ kg: Double) -> String {
    switch mode {
    case .time: return "—"
    case .total: return "\(formatKg(kg)) kg"
    default: return formatLoad(mode, kg)
    }
}

/** 425 → "7h 05". */
public func formatSleep(_ min: Int?) -> String {
    guard let min else { return "—" }
    return "\(min / 60)h \(String(format: "%02d", min % 60))"
}

/** 390 → "6.5". */
public func formatHours(_ min: Int) -> String {
    formatKg((Double(min) / 60 * 10).rounded() / 10)
}

/** "8–10" or "10". */
public func repRange(_ lo: Int, _ hi: Int) -> String { lo == hi ? "\(lo)" : "\(lo)–\(hi)" }

/** "mm:ss", or "h:mm:ss" past an hour. */
public func clock(_ totalSec: Double) -> String {
    let s = max(0, Int(totalSec.rounded(.down)))
    let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%02d:%02d", m, sec)
}

/** Rest timer style "1:42". */
public func shortClock(_ totalSec: Double) -> String {
    let s = max(0, Int(totalSec.rounded(.up)))
    return String(format: "%d:%02d", s / 60, s % 60)
}

// MARK: - Live item helpers (format.ts)

public extension LiveItem {
    var workingPlanned: [PlanSet] { sets.compactMap(\.planned).filter { $0.type == .working } }

    var loggedSets: [SetLogEntry] { sets.compactMap(\.logged) }

    /** Planned cardio minutes: "5 + 35 min". */
    var plannedMinutes: (label: String, total: Int)? {
        let mins = sets.compactMap { $0.planned?.repsMax }
        guard !mins.isEmpty else { return nil }
        return (mins.map(String.init).joined(separator: " + ") + " min", mins.reduce(0, +))
    }

    /** "3 × 8–10", or "35 min" for cardio's main block. */
    var targetLabel: String? {
        if exercise.loadMode == .time {
            let main = workingPlanned.map(\.repsMax)
            return main.isEmpty ? plannedMinutes?.label : main.map(String.init).joined(separator: " + ") + " min"
        }
        let w = workingPlanned
        guard !w.isEmpty else { return nil }
        return "\(w.count) × \(repRange(w.map(\.repsMin).min()!, w.map(\.repsMax).max()!))"
    }

    var targetRpe: Double? { workingPlanned.first { $0.rpe != nil }?.rpe }

    var openKg: Double? { workingPlanned.first { $0.openKg != nil }?.openKg }

    /** Up-next row: "3 × 8–10, 57". */
    var upNextSummary: String {
        if exercise.loadMode == .time { return plannedMinutes?.label ?? targetLabel ?? "\(sets.count) blocks" }
        let parts = [targetLabel, openKg.map { formatLoad(exercise.loadMode, $0) }].compactMap { $0 }
        return parts.isEmpty ? "\(sets.count) sets" : parts.joined(separator: ", ")
    }

    /** Completed row: "3 × 47 cw, RPE 8" when loads match, else the top set "85 × 5". */
    var completedSummary: (text: String, pr: Bool) {
        let mode = exercise.loadMode
        let all = loggedSets
        let working = all.filter { $0.type != .warmup }
        let pool = working.isEmpty ? all : working
        let pr = all.contains { $0.has(.topSetPR) }
        guard !pool.isEmpty else { return ("—", pr) }
        if mode == .time {
            let total = all.reduce(0) { $0 + $1.reps }
            let hr = all.compactMap(\.avgHr)
            let hrText = hr.isEmpty ? "" : ", avg HR \(Int((hr.reduce(0, +) / Double(hr.count)).rounded()))"
            return ("\(total) min\(hrText)", false)
        }
        let rpes = pool.compactMap(\.rpe)
        let rpe = rpes.isEmpty ? "" : ", RPE \(formatKg(rpes.max()!))"
        if pool.allSatisfy({ $0.weight == pool[0].weight }), !pr {
            return ("\(pool.count) × \(formatLoad(mode, pool[0].weight))\(rpe)", pr)
        }
        if let top = topSet(mode, pool) { return ("\(formatLoad(mode, top.weight)) × \(top.reps)", pr) }
        return ("—", pr)
    }
}

// MARK: - Rotation & session colours

public let maxRotation = 6

/** Settings › rotation: "A B C" or "a, b" → ["A", "B", "C"], or an error to show. */
public func parseRotation(_ input: String) -> Result<[String], RotationError> {
    let parts = input.split(whereSeparator: { $0 == " " || $0 == "," || $0.isNewline })
        .map { $0.trimmingCharacters(in: .whitespaces).uppercased() }
        .filter { !$0.isEmpty }
    if parts.isEmpty { return .failure(RotationError("Add at least one session letter")) }
    if parts.count > maxRotation { return .failure(RotationError("At most \(maxRotation) sessions in a rotation")) }
    if let bad = parts.first(where: { !isRotationLetter($0) }) {
        return .failure(RotationError("\"\(bad)\" isn't a single letter. Use A, B, C…"))
    }
    if Set(parts).count != parts.count { return .failure(RotationError("Each session letter can appear once")) }
    return .success(parts)
}

public struct RotationError: Error, Equatable, Sendable {
    public let message: String
    init(_ message: String) { self.message = message }
}

public func isRotationLetter(_ s: String) -> Bool {
    s.count == 1 && s.unicodeScalars.allSatisfy { ("A"..."Z").contains($0) }
}

/** The colour block a session type gets: A coral, B berry, C apricot, repeating; anything else is ink. */
public enum SessionKind: Equatable, Sendable {
    case coral, berry, apricot, ink

    public init(_ sessionType: String?) {
        guard let t = sessionType, isRotationLetter(t), let v = t.unicodeScalars.first?.value else {
            self = .ink
            return
        }
        self = [.coral, .berry, .apricot][Int(v - 65) % 3]
    }
}

// MARK: - Lift Log markdown (export.ts)

private func ddmmyyyy(_ iso: String) -> String {
    let p = iso.split(separator: "-")
    return p.count == 3 ? "\(p[2])/\(p[1])/\(p[0])" : iso
}

/** One session in the Lift Log / Obsidian format, byte-for-byte like the web's. */
public func renderSessionMarkdown(_ s: ExportSession) -> String {
    let heading = "\(ddmmyyyy(s.date)) — \(s.sessionType.map { "Session \($0): " } ?? "")\(s.title)"
    let rows = s.exercises.map { ex -> String in
        let working = ex.sets.filter { $0.type != .warmup }
        let pool = working.isEmpty ? ex.sets : working
        let reps = ex.loadMode == .time
            ? pool.map { "\($0.reps) min" }.joined(separator: ", ")
            : pool.map { "\($0.reps)" }.joined(separator: ", ")
        return "| \(ex.name) | \(reps) | \(weightCell(ex)) | \(rpeCell(pool)) | \(notesCell(ex)) |"
    }
    var lines = ["## \(heading)", "", "| Exercise | Sets x Reps | Weight | RPE | Notes |", "|---|---|---|---|---|"] + rows
    if let c = s.checkIn {
        let t = s.targets
        let litres = { (ml: Int) in String(format: "%.1f", Double(ml) / 1000) }
        let sleep = c.sleepMin.map { formatSleep($0).replacingOccurrences(of: "h ", with: ":") } ?? "—"
        let protein = "\(c.proteinG.map(String.init) ?? "—")\(t?.proteinG.map { "/\($0)" } ?? "") g"
        let water = "\(c.waterMl.map(litres) ?? "—")\(t?.waterMl.map { "/\(litres($0))" } ?? "") L"
        lines += ["", "Sleep \(sleep) · Protein \(protein) · Water \(water)"]
    }
    if let notes = s.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
        lines += ["", "Session notes: \(notes)"]
    }
    return lines.joined(separator: "\n") + "\n"
}

private func weightCell(_ ex: ExportExercise) -> String {
    if ex.loadMode == .time {
        let hr = ex.sets.compactMap(\.avgHr)
        return hr.isEmpty ? "—" : "avg HR \(Int((hr.reduce(0, +) / Double(hr.count)).rounded()))"
    }
    let working = ex.sets.filter { $0.type != .warmup }
    let pool = working.isEmpty ? ex.sets : working
    var distinct: [Double] = []
    for s in pool where !distinct.contains(s.weight) { distinct.append(s.weight) }
    if distinct.count == 1 { return formatLoad(ex.loadMode, distinct[0]) }
    return pool.map { formatKg($0.weight) }.joined(separator: "/")
}

private func rpeCell(_ sets: [SetLogEntry]) -> String {
    let rpes = sets.compactMap(\.rpe)
    return rpes.isEmpty ? "" : formatKg(rpes.max()!)
}

private func notesCell(_ ex: ExportExercise) -> String {
    var bits: [String] = []
    if ex.straps == true { bits.append("Straps") }
    if ex.sets.contains(where: { $0.has(.topSetPR) }) { bits.append("Top set ↑") }
    for (i, s) in ex.sets.enumerated() where s.has(.underloaded) { bits.append("S\(i + 1) underloaded") }
    if ex.sets.contains(where: { $0.has(.blockedOverride) }) { bits.append("Blocked override") }
    if let n = ex.notes, !n.isEmpty { bits.append(n) }
    return bits.joined(separator: ". ").replacingOccurrences(of: "|", with: "/")
}
