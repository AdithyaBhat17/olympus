import OlympusCore
import SwiftUI

/// One set as the table logs it.
struct LogInputValue {
    var weight: Double
    var platesKg: Double?
    var reps: Int
    var rpe: Double?
}

enum LogKind { case new, edit, rpe }

let sessionRpeValues: [Double] = [6, 7, 7.5, 8, 8.5, 9, 10]

/**
 * The set table (set-table.tsx): Set / Last / load / reps / ✓ rows with
 * prefill (plan → last session → previous set), carry-forward of a changed
 * load, reps tap cycling, the optional RPE strip and the underload nudge.
 */
struct SessionSetTable: View {
    let item: LiveItem
    let kind: KindColors
    /// Optimistic: applies immediately; the task resolves with the server's answer (nil if queued or rejected).
    let onLog: (Int, LogInputValue, LogKind) -> Task<LogSetResult?, Never>
    let onUndoLast: () -> Void
    /// The load the next set will log, so the hero above can show it (and its plates).
    let onActiveKg: (Double?) -> Void

    private struct Draft: Equatable {
        var kg: Double?
        var platesKg: Double?
        var reps: Int?
    }

    private struct Value {
        var kg: Double?
        var platesKg: Double?
        var reps: Int?
        var defaultKg: Double?
    }

    private struct NudgeState {
        let index: Int
        let nudge: UnderloadNudge
        let weight: Double
        let platesKg: Double?
    }

    private static let maxReps = 15

    @State private var drafts: [Int: Draft] = [:]
    @State private var sheet: LoadSheetRequest?
    @State private var nudge: NudgeState?
    @State private var just: Int?
    @State private var rpeFor: Int

    init(
        item: LiveItem,
        kind: KindColors,
        onLog: @escaping (Int, LogInputValue, LogKind) -> Task<LogSetResult?, Never>,
        onUndoLast: @escaping () -> Void,
        onActiveKg: @escaping (Double?) -> Void
    ) {
        self.item = item
        self.kind = kind
        self.onLog = onLog
        self.onUndoLast = onUndoLast
        self.onActiveKg = onActiveKg
        _rpeFor = State(initialValue: Self.lastLogged(item.sets))
    }

    private var sets: [LiveSet] { item.sets }
    private var timed: Bool { item.exercise.loadMode == .time }
    private var labels: [String] { sessionSetLabels(sets) }
    private var activeIndex: Int? { sets.firstIndex { $0.logged == nil } }
    private static func lastLogged(_ sets: [LiveSet]) -> Int {
        sets.indices.last { sets[$0].logged != nil } ?? -1
    }
    private var lastLogged: Int { Self.lastLogged(sets) }

    private var unit: String {
        switch item.exercise.loadMode {
        case .time: "—"
        case .counterweight: "Counter"
        case .perSide: "kg a side"
        case .total: "kg"
        }
    }

    /// What each set will log if ✓ is tapped now.
    private var values: [Value] {
        var out: [Value] = []
        for (i, s) in sets.enumerated() {
            let prev = out.last
            if let l = s.logged {
                out.append(Value(kg: l.weight, platesKg: l.platesKg, reps: l.reps, defaultKg: l.weight))
                continue
            }
            let defaultKg: Double? = timed ? 0 : (s.planned?.openKg ?? s.last?.weight ?? prev?.kg)
            let d = drafts[i] ?? Draft()
            out.append(Value(
                kg: d.kg ?? defaultKg,
                platesKg: d.kg != nil ? d.platesKg : nil,
                reps: d.reps ?? s.planned?.repsMax ?? s.last?.reps ?? prev?.reps,
                defaultKg: defaultKg
            ))
        }
        return out
    }

    private var heroKg: Double? {
        let v = values
        if let a = activeIndex { return v[a].kg }
        return lastLogged >= 0 ? v[lastLogged].kg : nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if item.exercise.loadMode == .counterweight {
                Text("Counterweight: lower is harder.")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(SessionPalette.info)
                    .padding(.horizontal, 4)
                    .padding(.bottom, 4)
            }
            headerRow
            let v = values
            ForEach(Array(sets.enumerated()), id: \.offset) { i, s in
                row(i, s, v[i])
                if let n = nudge, n.index == i {
                    nudgeView(n)
                }
            }

            if rpeFor >= 0, rpeFor < sets.count, let logged = sets[rpeFor].logged {
                RpeStrip(setLabel: labels[rpeFor], value: logged.rpe, kind: kind) { pickRpe(rpeFor, $0) }
                    .id(rpeFor)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.35), value: rpeFor)
        .onChange(of: heroKg, initial: true) { _, kg in onActiveKg(kg) }
        .onChange(of: sets) { _, _ in
            let last = lastLogged
            if rpeFor > last || (rpeFor >= 0 && (rpeFor >= sets.count || sets[rpeFor].logged == nil)) { rpeFor = last }
        }
        .sheet(item: $sheet) { req in
            SessionLoadSheet(request: req) { v in submitSheet(req.index, v) }
        }
    }

    // MARK: Rows

    private var headerRow: some View {
        grid(
            Text("Set"),
            Text("Last"),
            Text(unit),
            Text(timed ? "Min" : "Reps"),
            Text("").accessibilityLabel("Done")
        )
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(Color.muted)
        .padding(.horizontal, 4)
        .accessibilityElement(children: .ignore)
    }

    private func grid(_ a: some View, _ b: some View, _ c: some View, _ d: some View, _ e: some View) -> some View {
        HStack(spacing: 6) {
            a.frame(width: 38)
            b.frame(maxWidth: .infinity)
            c.frame(maxWidth: .infinity)
            d.frame(maxWidth: .infinity)
            e.frame(width: 52)
        }
        .lineLimit(1)
    }

    private func row(_ i: Int, _ s: LiveSet, _ v: Value) -> some View {
        let done = s.logged != nil
        let active = i == activeIndex
        let label = labels[i]
        let last = s.last.map { timed ? "\($0.reps)m" : "\(formatKg($0.weight))×\($0.reps)" } ?? "—"
        let cellText: Color = done ? .muted : .fg

        return grid(
            Text(label)
                .font(.num(17))
                .foregroundStyle(active ? kind.text : Color.muted),
            Text(last)
                .font(.num(15, weight: .bold))
                .foregroundStyle(Color.muted)
                .minimumScaleFactor(0.7),
            Group {
                if timed {
                    cell(Text("—").foregroundStyle(Color.faint), active: false)
                        .accessibilityHidden(true)
                } else {
                    Button { openSheet(i) } label: {
                        cell(
                            v.kg.map { Text(formatKg($0)).foregroundStyle(cellText) } ?? Text("—").foregroundStyle(Color.faint),
                            active: active
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Set \(label) load \(v.kg.map(formatKg) ?? "not set"). Change load")
                }
            },
            Button { bumpReps(i) } label: {
                cell(
                    v.reps.map { Text("\($0)").foregroundStyle(cellText) } ?? Text("—").foregroundStyle(Color.faint),
                    active: active
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(timed
                ? "Block \(label): \(v.reps.map(String.init) ?? "no") minutes. Change"
                : "Set \(label): \(v.reps.map(String.init) ?? "no") reps. Tap to add one"),
            checkButton(i, label: label, done: done, active: active, v: v)
        )
        .padding(4)
        .background(active ? Color.surface : Color.clear, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .opacity(!active && !done ? 0.6 : 1)
        .animation(.easeOut(duration: 0.2), value: active)
    }

    private func cell(_ text: Text, active: Bool) -> some View {
        text
            .font(.num(24))
            .minimumScaleFactor(0.6)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(active ? Color.bg : Color.clear, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(Rectangle())
            .contentTransition(.numericText())
    }

    private func checkButton(_ i: Int, label: String, done: Bool, active: Bool, v: Value) -> some View {
        Button { tapCheck(i) } label: {
            ZStack {
                Circle()
                    .fill(done ? kind.k : active ? Color.bg : Color.clear)
                if !done && !active {
                    Circle().strokeBorder(Color.surface3, lineWidth: 2)
                }
                Image(systemName: "checkmark")
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundStyle(done ? kind.on : active ? kind.text : Color.faint)
                    .symbolEffect(.bounce, value: done)
            }
            .frame(width: 48, height: 48)
            .modifier(Breathe(on: active && !done))
            .overlay {
                if just == i { BurstRing(color: kind.k) }
            }
        }
        .buttonStyle(.plain)
        .disabled(!done && !active)
        .accessibilityLabel(done
            ? (i == lastLogged ? "Set \(label) logged. Undo" : "Set \(label) logged. Rate effort")
            : "Log set \(label): \(v.kg.map(formatKg) ?? "—") × \(v.reps.map(String.init) ?? "—")")
    }

    private func nudgeView(_ n: NudgeState) -> some View {
        let nextLabel = n.index + 1 < sets.count && sets[n.index + 1].logged == nil ? labels[n.index + 1] : nil
        return UnderloadNudgeView(
            nudge: n.nudge,
            nextSetLabel: nextLabel,
            currentKg: n.weight,
            onAccept: {
                patchDraft(n.index + 1) { $0.kg = n.nudge.suggestKg; $0.platesKg = nil }
                nudge = nil
            },
            onKeep: {
                if n.index + 1 < sets.count, sets[n.index + 1].logged == nil {
                    patchDraft(n.index + 1) { $0.kg = n.weight; $0.platesKg = n.platesKg }
                }
                nudge = nil
            }
        )
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    // MARK: Actions

    private func patchDraft(_ i: Int, _ f: (inout Draft) -> Void) {
        var d = drafts[i] ?? Draft()
        f(&d)
        drafts[i] = d
    }

    private func handleResult(_ i: Int, _ res: LogSetResult?) {
        guard let res else { return }
        withAnimation(.spring(duration: 0.35)) {
            if let n = res.nudge {
                nudge = NudgeState(index: i, nudge: n, weight: res.set.weight, platesKg: res.set.platesKg)
            } else if nudge?.index == i {
                nudge = nil
            }
        }
    }

    private func send(_ i: Int, _ input: LogInputValue, _ kind: LogKind) {
        let task = onLog(i, input, kind)
        Task { handleResult(i, await task.value) }
    }

    private func flashJust(_ i: Int) {
        just = i
        Task {
            try? await Task.sleep(for: .milliseconds(600))
            if just == i { just = nil }
        }
    }

    /// A changed load carries forward to later sets that would have matched it.
    private func carryForward(from i: Int, kg: Double, platesKg: Double?, defaultKg: Double?, values: [Value]) {
        var next = drafts
        next[i] = nil
        for j in (i + 1)..<max(i + 1, sets.count) where sets[j].logged == nil && next[j]?.kg == nil && values[j].defaultKg == defaultKg {
            var d = next[j] ?? Draft()
            d.kg = kg
            d.platesKg = platesKg
            next[j] = d
        }
        drafts = next
    }

    private func log(_ i: Int) {
        let vals = values
        let v = vals[i]
        guard let kg = v.kg, let reps = v.reps else {
            // Nothing to prefill from (first time on this exercise): ask for the load.
            openSheet(i)
            return
        }
        Haptics.tick()
        flashJust(i)
        rpeFor = i
        if kg != v.defaultKg {
            carryForward(from: i, kg: kg, platesKg: v.platesKg, defaultKg: v.defaultKg, values: vals)
        } else {
            drafts[i] = nil
        }
        send(i, LogInputValue(weight: kg, platesKg: v.platesKg, reps: reps, rpe: nil), .new)
    }

    private func bumpReps(_ i: Int) {
        if timed {
            openSheet(i)
            return
        }
        let cur = values[i].reps ?? 0
        let reps = cur >= Self.maxReps ? 1 : cur + 1
        if let l = sets[i].logged {
            send(i, LogInputValue(weight: l.weight, platesKg: l.platesKg, reps: reps, rpe: l.rpe), .edit)
        } else {
            patchDraft(i) { $0.reps = reps }
        }
    }

    private func pickRpe(_ i: Int, _ rpe: Double?) {
        guard let l = sets[i].logged else { return }
        Haptics.tick()
        send(i, LogInputValue(weight: l.weight, platesKg: l.platesKg, reps: l.reps, rpe: rpe), .rpe)
    }

    private func tapCheck(_ i: Int) {
        if sets[i].logged == nil { return log(i) }
        if i == lastLogged { return onUndoLast() }
        rpeFor = i
    }

    // MARK: Load sheet

    private func openSheet(_ i: Int) {
        let s = sets[i]
        let v = values[i]
        var recent: [Double] = []
        for x in sets {
            if let l = x.last { recent.append(l.weight) }
            if let l = x.logged { recent.append(l.weight) }
        }
        if let t = item.lastTopKg { recent.append(t) }
        let planned = sets.compactMap { $0.planned?.openKg }
        let ptMax = planned.isEmpty ? nil : (item.exercise.loadMode == .counterweight ? planned.min() : planned.max())
        let cta: LoadSheetRequest.CTA = s.logged != nil ? .save : (i == activeIndex && (timed || v.reps != nil)) ? .log : .use
        sheet = LoadSheetRequest(
            index: i,
            exercise: item.exercise,
            setLabel: labels[i],
            initialKg: timed ? v.reps.map(Double.init) : v.kg,
            initialPlatesKg: timed ? nil : v.platesKg,
            last: s.last,
            reps: v.reps,
            recent: recent,
            ptMax: ptMax,
            cta: cta
        )
    }

    private func submitSheet(_ i: Int, _ value: LoadSheetValue) {
        sheet = nil
        guard i < sets.count else { return }
        let s = sets[i]
        let vals = values
        let v = vals[i]
        if timed {
            let mins = Int(value.trueKg.rounded())
            if let l = s.logged {
                send(i, LogInputValue(weight: 0, platesKg: nil, reps: mins, rpe: l.rpe), .edit)
            } else if i == activeIndex {
                Haptics.tick()
                flashJust(i)
                rpeFor = i
                drafts[i] = nil
                send(i, LogInputValue(weight: 0, platesKg: nil, reps: mins, rpe: nil), .new)
            } else {
                patchDraft(i) { $0.reps = mins }
            }
            return
        }
        if let l = s.logged {
            send(i, LogInputValue(weight: value.trueKg, platesKg: value.platesKg, reps: l.reps, rpe: l.rpe), .edit)
            return
        }
        if i == activeIndex, let reps = v.reps {
            Haptics.tick()
            flashJust(i)
            rpeFor = i
            carryForward(from: i, kg: value.trueKg, platesKg: value.platesKg, defaultKg: v.defaultKg, values: vals)
            send(i, LogInputValue(weight: value.trueKg, platesKg: value.platesKg, reps: reps, rpe: nil), .new)
        } else {
            patchDraft(i) { $0.kg = value.trueKg; $0.platesKg = value.platesKg }
        }
    }
}

/// The active ✓ gently pulses ("breathe").
private struct Breathe: ViewModifier {
    let on: Bool
    @State private var phase = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .scaleEffect(on && phase && !reduceMotion ? 1.06 : 1)
            .animation(on && !reduceMotion ? .easeInOut(duration: 1.1).repeatForever(autoreverses: true) : .default, value: phase)
            .onAppear { phase = on }
            .onChange(of: on) { _, v in phase = v }
    }
}

/// A ring that bursts outward from a just-logged ✓.
private struct BurstRing: View {
    let color: Color
    @State private var go = false
    var body: some View {
        Circle()
            .stroke(color, lineWidth: 3)
            .scaleEffect(go ? 1.6 : 1)
            .opacity(go ? 0 : 1)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear { withAnimation(.easeOut(duration: 0.6)) { go = true } }
    }
}

/// Inline RPE chips for the last logged set: optional, one tap; the same value again clears it.
struct RpeStrip: View {
    let setLabel: String
    let value: Double?
    let kind: KindColors
    let onPick: (Double?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("How hard was set \(setLabel)? \(Text("(optional)").foregroundStyle(Color.faint))")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.fg2)
                .padding(.horizontal, 4)
            HStack(spacing: 4) {
                ForEach(sessionRpeValues, id: \.self) { v in
                    let checked = value == v
                    Button { onPick(checked ? nil : v) } label: {
                        Text(formatKg(v))
                            .font(.num(17, weight: .bold))
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(checked ? kind.k : Color.bg, in: Capsule())
                            .foregroundStyle(checked ? kind.on : Color.fg2)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("RPE \(formatKg(v))")
                    .accessibilityAddTraits(checked ? .isSelected : [])
                }
            }
            .animation(.easeOut(duration: 0.15), value: value)
        }
        .padding(12)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .padding(.top, 4)
    }
}

/// "Light for you…" after an underloaded set: bump the next set or keep the load.
struct UnderloadNudgeView: View {
    let nudge: UnderloadNudge
    let nextSetLabel: String?
    let currentKg: Double
    let onAccept: () -> Void
    let onKeep: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "arrow.up")
                .font(.system(size: 15, weight: .heavy))
                .foregroundStyle(Color.coral)
                .padding(.top, 2)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 8) {
                Text("\(Text(nudge.headline).fontWeight(.semibold)) \(nudge.detail)")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.fg)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    if let nextSetLabel {
                        Button(action: onAccept) {
                            Text("Set \(nextSetLabel) at \(formatKg(nudge.suggestKg)) kg")
                                .font(.system(size: 14, weight: .semibold))
                                .padding(.horizontal, 14)
                                .frame(minHeight: 44)
                                .background(Color.coral, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                    }
                    Button(action: onKeep) {
                        Text("Keep \(formatKg(currentKg))")
                            .font(.system(size: 14))
                            .padding(.horizontal, 14)
                            .frame(minHeight: 44)
                            .background(Color.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .foregroundStyle(Color.fg2)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(SessionPalette.accentBg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(SessionPalette.accentLine, lineWidth: 1))
        .padding(.vertical, 2)
        .accessibilityElement(children: .contain)
    }
}
