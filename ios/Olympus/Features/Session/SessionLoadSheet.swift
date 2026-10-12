import OlympusCore
import SwiftUI

/// What the load sheet hands back.
struct LoadSheetValue {
    /// True kg (per side for PER_SIDE), or minutes for TIME.
    var trueKg: Double
    /// Set when the athlete entered plates; logged as platesKg so the server does the maths.
    var platesKg: Double?
}

/// Everything the sheet needs to open on one set.
struct LoadSheetRequest: Identifiable {
    enum CTA { case log, save, use }
    let index: Int
    let exercise: ExerciseMeta
    let setLabel: String
    let initialKg: Double?
    let initialPlatesKg: Double?
    let last: LiveSet.Last?
    let reps: Int?
    let recent: [Double]
    let ptMax: Double?
    let cta: CTA
    var id: String { "\(exercise.id)-\(setLabel)" }
}

/**
 * Load entry (load-sheet.tsx): big rounded value with a blinking caret,
 * ±steppers, recent loads (PT max in berry), and a custom 3×4 keypad, no
 * system keyboard. PER_SIDE machines toggle between plates loaded and true
 * kg per side (plates + carriage). TIME exercises edit minutes.
 */
struct SessionLoadSheet: View {
    let request: LoadSheetRequest
    let onSubmit: (LoadSheetValue) -> Void
    @Environment(\.dismiss) private var dismiss

    private enum Mode { case plates, side }
    private static let keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"]

    @State private var mode: Mode
    @State private var value: String
    /// First keypress replaces the prefilled value.
    @State private var fresh = true
    @State private var tick = 0
    @State private var caretOn = true
    @State private var contentHeight: CGFloat = 600

    init(request: LoadSheetRequest, onSubmit: @escaping (LoadSheetValue) -> Void) {
        self.request = request
        self.onSubmit = onSubmit
        let perSide = request.exercise.loadMode == .perSide
        if perSide, let p = request.initialPlatesKg {
            _mode = State(initialValue: .plates)
            _value = State(initialValue: formatKg(p))
        } else {
            _mode = State(initialValue: .side)
            _value = State(initialValue: request.initialKg.map(formatKg) ?? "")
        }
    }

    private var ex: ExerciseMeta { request.exercise }
    private var timed: Bool { ex.loadMode == .time }
    private var perSide: Bool { ex.loadMode == .perSide }
    private var step: Double { timed ? 1 : 2.5 }

    private var entered: Double? {
        if value.isEmpty || value == "." { return nil }
        return Double(value)
    }

    private var truth: Double? {
        guard let entered else { return nil }
        return perSide && mode == .plates
            ? trueKg(loadMode: ex.loadMode, carriageKgPerSide: ex.carriageKgPerSide, platesKg: entered)
            : roundKg(entered)
    }

    private var valid: Bool {
        guard let truth else { return false }
        return truth >= 0 && (!timed || truth > 0)
    }

    private var unitLabel: String {
        if timed { return "minutes" }
        if perSide {
            let carriage = ex.carriageKgPerSide
            if mode == .plates {
                return "plates per side, plus \(carriage.map(formatKg) ?? "?") kg carriage, \(truth.map(formatKg) ?? "—") in total"
            }
            return "kg per side\(carriage.map { ", incl. \(formatKg($0)) kg carriage" } ?? "")"
        }
        if ex.loadMode == .counterweight { return "kg counterweight, lower = harder" }
        return "kg on the stack"
    }

    private var ctaLabel: String {
        let v = truth.map(formatKg) ?? "—"
        let min = timed ? " min" : ""
        switch request.cta {
        case .use: return "Use \(v)\(min)"
        case .log, .save:
            let verb = request.cta == .log ? "Log" : "Save"
            let reps = !timed ? request.reps.map { " × \($0)" } ?? "" : ""
            return "\(verb) \(v)\(min)\(reps)"
        }
    }

    private var chips: [Double] {
        var seen: [Double] = []
        for k in request.recent.map(roundKg) where !seen.contains(k) { seen.append(k) }
        return Array(seen.filter { $0 != request.ptMax }.suffix(3))
    }

    private var subtitle: String {
        var s = ex.name
        if let last = request.last {
            s += timed ? ", last \(last.reps) min" : ", last \(formatKg(last.weight)) × \(last.reps)"
        }
        return s
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                header
                if perSide { modePicker }
                valueRow
                if !timed, !chips.isEmpty || request.ptMax != nil { chipRow }
                keypad
                Button {
                    guard valid, let truth else { return }
                    onSubmit(LoadSheetValue(trueKg: truth, platesKg: perSide && mode == .plates ? entered : nil))
                } label: {
                    Label(ctaLabel, systemImage: "checkmark")
                        .labelStyle(.titleAndIcon)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!valid)
                .opacity(valid ? 1 : 0.5)
            }
            .padding(.horizontal, 12)
            .padding(.top, 20)
            .padding(.bottom, 16)
            .sessionMeasureHeight($contentHeight)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(Color.bg)
        .sessionBottomSheet(height: contentHeight)
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(0.55))
                caretOn.toggle()
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(timed ? "Block \(request.setLabel), minutes" : "Set \(request.setLabel), load")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(Color.fg)
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .frame(width: 36, height: 36)
                    .background(SessionPalette.key, in: Circle())
                    .foregroundStyle(Color.fg2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
        .padding(.horizontal, 6)
    }

    private var modePicker: some View {
        HStack(spacing: 4) {
            ForEach([Mode.plates, Mode.side], id: \.self) { m in
                Button { switchMode(m) } label: {
                    Text(m == .plates ? "Plates loaded" : "Per side")
                        .font(.system(size: 15, weight: .bold))
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(mode == m ? Color.white : Color.clear, in: Capsule())
                        .foregroundStyle(mode == m ? Color.fg : Color.muted)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(mode == m ? .isSelected : [])
            }
        }
        .padding(4)
        .background(Color.surface2, in: Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Entry mode")
    }

    private var valueRow: some View {
        HStack(spacing: 8) {
            stepper(-step)
            VStack(spacing: 2) {
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(value.isEmpty ? "0" : value)
                        .font(.num(76))
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .contentTransition(.numericText())
                        .animation(.spring(duration: 0.25), value: tick)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.coral)
                        .frame(width: 3, height: 56)
                        .opacity(caretOn ? 1 : 0)
                        .accessibilityHidden(true)
                }
                .foregroundStyle(Color.fg)
                Text(unitLabel)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(value.isEmpty ? "0" : value), \(unitLabel)")
            stepper(step)
        }
        .padding(.vertical, 8)
    }

    private func stepper(_ d: Double) -> some View {
        Button { adjust(d) } label: {
            Text("\(d < 0 ? "−" : "+")\(formatKg(abs(d)))")
                .font(.num(20))
                .frame(width: 64, height: 64)
                .background(Color.surface3, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .foregroundStyle(Color.fg)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(d < 0 ? "Minus" : "Plus") \(formatKg(abs(d)))\(timed ? " minute" : " kg")")
    }

    private var chipRow: some View {
        HStack(spacing: 6) {
            Text("Recent").font(.system(size: 12)).foregroundStyle(Color.muted)
            ForEach(chips, id: \.self) { k in
                Button { pick(k) } label: {
                    Text(formatKg(k))
                        .font(.num(16, weight: .bold))
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .background(Color.surface, in: Capsule())
                        .foregroundStyle(Color.fg2)
                }
                .buttonStyle(.plain)
            }
            if let pt = request.ptMax {
                Button { pick(pt) } label: {
                    Text("\(formatKg(pt)), PT max")
                        .font(.num(16, weight: .bold))
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .background(SessionPalette.infoBg, in: Capsule())
                        .foregroundStyle(SessionPalette.info)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var keypad: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
            ForEach(Self.keys, id: \.self) { k in
                Button { press(k) } label: {
                    Group {
                        if k == "del" {
                            Image(systemName: "delete.left").font(.system(size: 22, weight: .semibold))
                        } else {
                            Text(k).font(.system(size: 26, weight: .bold, design: .rounded))
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(SessionPalette.key, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundStyle(Color.fg)
                }
                .buttonStyle(KeyStyle())
                .disabled(k == "." && timed)
                .opacity(k == "." && timed ? 0.3 : 1)
                .accessibilityLabel(k == "del" ? "Delete" : k == "." ? "Decimal point" : k)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Keypad")
    }

    private struct KeyStyle: ButtonStyle {
        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .overlay {
                    if configuration.isPressed {
                        RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.lineStrong.opacity(0.6))
                    }
                }
        }
    }

    // MARK: Editing

    private func set(_ v: String, fresh isFresh: Bool) {
        value = v
        fresh = isFresh
        tick += 1
        caretOn = true
    }

    private func switchMode(_ next: Mode) {
        guard next != mode else { return }
        if entered != nil {
            let t = truth ?? 0
            let shown = next == .plates
                ? platesFor(loadMode: ex.loadMode, carriageKgPerSide: ex.carriageKgPerSide, targetTrueKg: t)
                : t
            set(formatKg(shown), fresh: true)
        }
        mode = next
    }

    private func press(_ k: String) {
        if k == "del" {
            set(fresh ? "" : String(value.dropLast()), fresh: false)
            return
        }
        let base = fresh ? "" : value
        if k == ".", base.contains(".") || timed { return }
        var next = base == "0" && k != "." ? k : base + k
        if next == "." { next = "0." }
        if next.replacingOccurrences(of: ".", with: "").count > 5 { return }
        if let dot = next.firstIndex(of: "."), next[next.index(after: dot)...].count >= 3 { return }
        set(next, fresh: false)
    }

    private func adjust(_ d: Double) {
        set(formatKg(max(0, roundKg((entered ?? 0) + d))), fresh: true)
    }

    private func pick(_ kg: Double) {
        mode = .side
        set(formatKg(kg), fresh: true)
    }
}
