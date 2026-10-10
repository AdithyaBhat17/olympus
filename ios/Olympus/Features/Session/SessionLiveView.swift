import OlympusCore
import SwiftUI

/// The live session (live-session.tsx): header with the elapsed clock and
/// progress segments, the current exercise with its set table, up next and
/// done lists, the rest pill. Set edits are optimistic overlays on the server
/// view, dropped once the server reflects them.
struct SessionLiveView: View {
    let screen: LiveSessionScreen
    let reload: () async -> Void
    let onFinish: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    /// Optimistic set edits: index → entry, or removed.
    private enum OverlayEntry: Equatable {
        case set(SetLogEntry)
        case removed

        var entry: SetLogEntry? {
            if case let .set(e) = self { return e }
            return nil
        }
    }

    @State private var scrolled = false
    @State private var overlay: [String: [Int: OverlayEntry]] = [:]
    /// Optimistic swaps per item key.
    @State private var swaps: [String: LiveItem] = [:]
    @State private var setCounts: [String: Int] = [:]
    @State private var selectedKey: String?
    @State private var swapKey: String?
    @State private var noteOpen = false
    @State private var notes: String
    @State private var rest: RestState?
    @State private var activeKg: Double?
    @State private var confirmDiscard = false
    @State private var formCue: Router.FormCueRoute?

    init(screen: LiveSessionScreen, reload: @escaping () async -> Void, onFinish: @escaping () -> Void) {
        self.screen = screen
        self.reload = reload
        self.onFinish = onFinish
        _notes = State(initialValue: screen.view.notes ?? "")
        _rest = State(initialValue: RestTimer.load(screen.view.id))
    }

    private var view: SessionView { screen.view }
    private var sessionId: String { view.id }
    private var kind: KindColors { KindColors(type: view.sessionType) }

    // MARK: Derived

    private var items: [LiveItem] {
        view.items.map { it in
            if let swapped = swaps[it.key] { return merge(swapped, nil, setCounts[it.key] ?? 0) }
            return merge(it, overlay[it.key], setCounts[it.key] ?? 0)
        }
    }

    private func merge(_ it: LiveItem, _ ov: [Int: OverlayEntry]?, _ minCount: Int) -> LiveItem {
        let ovIdx = (ov ?? [:]).filter { $0.value != .removed }.map(\.key)
        let count = max(it.sets.count, (ovIdx.max() ?? -1) + 1, minCount)
        var out = it
        out.sets = (0..<count).map { i in
            var s = i < it.sets.count ? it.sets[i] : LiveSet(index: i)
            s.index = i
            if let o = ov?[i] { s.logged = o.entry }
            return s
        }
        let planned = out.sets.filter { $0.planned != nil }.count
        let logged = out.sets.filter { $0.logged != nil }.count
        out.done = planned > 0 ? logged >= planned : logged > 0
        return out
    }

    /// Logged / planned for the progress segment.
    private func progress(_ it: LiveItem) -> Double {
        let plannedCount = it.sets.filter { $0.planned != nil }.count
        let planned = max(1, plannedCount == 0 ? it.sets.count : plannedCount)
        return min(1, Double(it.sets.filter { $0.logged != nil }.count) / Double(planned))
    }

    private struct Derived {
        var items: [LiveItem]
        var current: LiveItem?
        var currentIdx: Int
        var completed: [LiveItem]
        var upNext: [LiveItem]
        var nextItem: LiveItem?
    }

    private var derived: Derived {
        let items = self.items
        let current = selectedKey.flatMap { k in items.first { $0.key == k } } ?? items.first { !$0.done }
        let currentIdx = current.flatMap { c in items.firstIndex { $0.key == c.key } } ?? -1
        let completed = items.filter { $0.done && $0.key != current?.key }
        let upNext = items.filter { !$0.done && $0.key != current?.key }
        let nextItem: LiveItem? = current == nil ? nil
            : items.dropFirst(currentIdx + 1).first { !$0.done } ?? upNext.first
        return Derived(items: items, current: current, currentIdx: currentIdx, completed: completed, upNext: upNext, nextItem: nextItem)
    }

    private func restNext(_ d: Derived) -> String? {
        guard let current = d.current else { return nil }
        if let idx = current.sets.firstIndex(where: { $0.logged == nil }) {
            return "set \(sessionSetLabels(current.sets)[idx])"
        }
        return d.nextItem?.exercise.name
    }

    private var headerTitle: String {
        guard let t = view.sessionType else { return view.title }
        return view.title.hasPrefix("Session ") ? view.title : "Session \(t), \(view.title)"
    }

    private static func lastLoggedIndex(_ item: LiveItem) -> Int {
        item.sets.last { $0.logged != nil }?.index ?? -1
    }

    // MARK: Body

    var body: some View {
        let d = derived
        let next = restNext(d)
        ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    header(d)
                    if let current = d.current {
                        card(current, d)
                    } else {
                        emptyState(d.items.count)
                    }
                }
                // The colour block scrolls with the header and card (and
                // reaches up past the top so a pull-down never shows a gap).
                .background(alignment: .top) { kind.k.padding(.top, -1000) }
                SessionUpNextList(
                    items: d.upNext,
                    positions: Dictionary(uniqueKeysWithValues: d.items.enumerated().map { ($1.key, $0 + 1) }),
                    onSelect: select
                )
                SessionCompletedList(items: d.completed, onSelect: select)

                Button("Discard session") { confirmDiscard = true }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.muted)
                    .frame(minHeight: 44)
                    .padding(.horizontal, 16)
                    .padding(.top, 32)
                    .padding(.bottom, 130)
            }
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(Color.bg.ignoresSafeArea())
        .trackScrolledPastTop($scrolled)
        .overlay(alignment: .top) { StatusBarBlur(visible: scrolled) }
        .overlay(alignment: .bottom) {
            RestPill(rest: rest, nextLabel: next, onAdd: addRest, onSkip: { setRest(nil) })
        }
        .keepsScreenAwake()
        .onChange(of: view.items) { _, items in reconcile(items) }
        .onChange(of: view.notes) { _, n in notes = n ?? "" }
        .onChange(of: next) { _, label in
            // Keep the notification's "Next up" in step with what's actually next.
            if let rest, rest.endAt > Date() { RestTimer.scheduleNotification(endAt: rest.endAt, nextLabel: label) }
        }
        .sheet(isPresented: Binding(get: { swapKey != nil }, set: { if !$0 { swapKey = nil } })) {
            if let item = d.items.first(where: { $0.key == swapKey }) {
                SessionSwapSheet(
                    replacing: .init(name: item.exercise.name, exerciseId: item.exercise.id, category: item.exercise.category),
                    candidates: screen.swap.candidates,
                    constraintRegions: screen.swap.constraintRegions,
                    inSessionIds: Set(d.items.map(\.exercise.id)),
                    onSwap: { id, reason in doSwap(item, id, reason) }
                )
            }
        }
        .sheet(isPresented: $noteOpen) {
            SessionNoteSheet(exercise: d.current?.exercise.name) { text in saveNote(text, exercise: d.current?.exercise.name) }
        }
        .sheet(item: $formCue) { route in
            FormCueView(route: route)
        }
        .confirmationDialog("Discard this session?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard session", role: .destructive) { Task { await discard() } }
            Button("Keep going", role: .cancel) {}
        } message: {
            Text("Logged sets are deleted and the plan goes back to ready.")
        }
    }

    private func select(_ key: String) {
        withAnimation(.spring(duration: 0.4)) { selectedKey = key }
    }

    // MARK: Header

    private func header(_ d: Derived) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                SessionRoundButton(systemImage: "chevron.down", label: "Back to Today", foreground: kind.on) { dismiss() }
                VStack(spacing: 2) {
                    Text(headerTitle)
                        .font(.system(size: 13, weight: .semibold))
                        .opacity(0.85)
                        .lineLimit(1)
                    HStack(spacing: 7) {
                        LiveDot(color: kind.on)
                        SessionElapsed(startedAt: view.startedAt)
                            .font(.num(20))
                            .accessibilityHint("Session time")
                    }
                }
                .frame(maxWidth: .infinity)
                Button(action: onFinish) {
                    Text("Finish")
                        .font(.system(size: 15, weight: .bold))
                        .padding(.horizontal, 16)
                        .frame(minHeight: 44)
                        .background(kind.on.opacity(0.18), in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            if model.pendingCount > 0 {
                let n = model.pendingCount
                HStack(spacing: 6) {
                    Circle().fill(.foreground).frame(width: 6, height: 6)
                    Text("\(n) change\(n == 1 ? "" : "s") saved on this phone, will sync")
                }
                .font(.system(size: 13, weight: .semibold))
                .opacity(0.85)
                .padding(.top, 8)
                .accessibilityElement(children: .combine)
            }

            HStack(spacing: 4) {
                ForEach(d.items) { it in
                    let p = it.done ? 1 : it.key == d.current?.key ? progress(it) : 0
                    Capsule()
                        .fill(kind.on.opacity(0.25))
                        .overlay(alignment: .leading) {
                            GeometryReader { g in
                                Capsule().fill(kind.on).frame(width: g.size.width * p)
                            }
                        }
                        .clipShape(Capsule())
                        .frame(height: 6)
                        .animation(.spring(duration: 0.5, bounce: 0.3), value: p)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Exercise \(max(1, d.currentIdx + 1)) of \(d.items.count)")
            .accessibilityValue("\(d.items.filter(\.done).count) done")

            if view.progressionOnHold {
                Label("Progression on hold today: match last session's loads, no bumps.", systemImage: "exclamationmark.triangle")
                    .font(.system(size: 15, weight: .semibold))
                    .opacity(0.9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
            }
        }
        .foregroundStyle(kind.on)
        .background(kind.k)
    }

    // MARK: Current exercise

    private func card(_ current: LiveItem, _ d: Derived) -> some View {
        let lastIdx = Self.lastLoggedIndex(current)
        let canRemove = lastIdx >= 0 || (current.sets.last?.planned == nil && current.sets.count > 1)
        return SessionExerciseCard(
            item: current,
            kind: kind,
            position: d.currentIdx + 1,
            total: d.items.count,
            canRemoveSet: canRemove,
            nextName: d.nextItem?.exercise.name,
            onSwap: current.planItemId != nil ? { swapKey = current.key } : nil,
            onAddSet: { addSet(current) },
            onRemoveSet: { removeLastSet(current) },
            onNote: { noteOpen = true },
            onNext: { if let n = d.nextItem { select(n.key) } },
            onFormCues: { cue in formCue = .init(cue: cue, exerciseId: current.exercise.id) },
            activeKg: activeKg
        ) {
            SessionSetTable(
                item: current,
                kind: kind,
                onLog: { i, input, k in onLog(current, i, input, k) },
                onUndoLast: { removeLastSet(current) },
                onActiveKg: { activeKg = $0 }
            )
            .id("\(current.key):\(current.exercise.id)")
        }
    }

    private func emptyState(_ count: Int) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(count > 0 ? "All exercises done" : "No exercises in this session")
                .font(.system(size: 40, weight: .heavy))
                .fixedSize(horizontal: false, vertical: true)
            Text(count > 0 ? "Tap a completed exercise to edit it, or wrap up." : "This plan has no items. Discard it and start from Today.")
                .font(.system(size: 17))
                .opacity(0.9)
            if count > 0 {
                Button("Finish workout", action: onFinish)
                    .buttonStyle(PrimaryButtonStyle(tint: kind.on, foreground: kind.text))
                    .padding(.top, 8)
            }
        }
        .foregroundStyle(kind.on)
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(kind.k)
    }

    // MARK: Overlay bookkeeping

    private func putOverlay(_ key: String, _ index: Int, _ v: OverlayEntry?) {
        var entries = overlay[key] ?? [:]
        entries[index] = v
        overlay[key] = entries
    }

    /// Drop optimistic entries the server view now reflects.
    private func reconcile(_ serverItems: [LiveItem]) {
        var next: [String: [Int: OverlayEntry]] = [:]
        for (key, entries) in overlay {
            let serverItem = serverItems.first { $0.key == key }
            for (k, v) in entries {
                let server = serverItem.flatMap { k < $0.sets.count ? $0.sets[k].logged : nil }
                let reflected: Bool
                switch v {
                case .removed: reflected = server == nil
                case let .set(e): reflected = server != nil && server!.reps == e.reps && server!.weight == e.weight && server!.rpe == e.rpe
                }
                if !reflected { next[key, default: [:]][k] = v }
            }
        }
        overlay = next
        swaps = [:]
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    // MARK: Writes

    private func onLog(_ item: LiveItem, _ index: Int, _ input: LogInputValue, _ kind: LogKind) -> Task<LogSetResult?, Never> {
        let s = index < item.sets.count ? item.sets[index] : nil
        let type = s?.logged?.type ?? s?.planned?.type ?? .working
        let weight = input.platesKg.map {
            trueKg(loadMode: item.exercise.loadMode, carriageKgPerSide: item.exercise.carriageKgPerSide, platesKg: $0)
        } ?? input.weight
        let key = item.key
        let before = overlay[key]?[index]

        var entry = SetLogEntry(reps: input.reps, weight: weight, platesKg: input.platesKg, rpe: input.rpe, type: type, flags: s?.logged?.flags)
        entry.doneAt = s?.logged?.doneAt ?? Self.iso.string(from: Date())
        putOverlay(key, index, .set(entry))
        if kind == .new {
            selectedKey = key
            setRest(RestState(
                endAt: Date().addingTimeInterval(Double(item.restSec)),
                totalSec: Double(item.restSec),
                label: item.exercise.isCompound ? "Rest after a big lift" : "Rest"
            ))
        }

        let op = OutboxOp.logSet(sessionId: sessionId, input: LogSetInput(
            exerciseId: item.exercise.id,
            planItemId: item.planItemId,
            setIndex: index,
            platesKg: input.platesKg,
            weight: input.platesKg == nil ? input.weight : nil,
            reps: input.reps,
            rpe: input.rpe,
            type: type,
            blockedOverride: item.blockedReason != nil ? true : nil
        ))
        return Task {
            var result: LogSetResult?
            await model.mutate(op, rollback: {
                putOverlay(key, index, before)
                if kind == .new { setRest(nil) }
            }, onOk: { data in
                if let r = try? API.decoder.decode(LogSetResult.self, from: data) {
                    putOverlay(key, index, .set(r.set))
                    result = r
                }
            })
            return result
        }
    }

    private func addSet(_ item: LiveItem) {
        setCounts[item.key] = item.sets.count + 1
        selectedKey = item.key
    }

    private func removeLastSet(_ item: LiveItem) {
        if let last = item.sets.last, last.logged == nil, last.planned == nil, item.sets.count > 1 {
            setCounts[item.key] = item.sets.count - 1
            return
        }
        let idx = Self.lastLoggedIndex(item)
        guard idx >= 0 else { return }
        let key = item.key
        let before = overlay[key]?[idx]
        let label = sessionSetLabels(item.sets)[idx]
        let op = OutboxOp.removeSet(sessionId: sessionId, input: RemoveSetInput(exerciseId: item.exercise.id, planItemId: item.planItemId, setIndex: idx))
        putOverlay(key, idx, .removed)
        setCounts[key] = min(setCounts[key] ?? 0, item.sets.count - 1)
        setRest(nil)
        model.show("Set \(label) removed")
        Task {
            await model.mutate(op, rollback: { putOverlay(key, idx, before) })
        }
    }

    private struct SwapBody: Encodable {
        let planItemId: String
        let exerciseId: String
        let overrideReason: String?
    }

    /// Optimistic swap: show the new exercise now, reconcile on the next server view.
    private func doSwap(_ item: LiveItem, _ exerciseId: String, _ overrideReason: String?) {
        guard let planItemId = item.planItemId else { return }
        let c = screen.swap.candidates.first { $0.id == exerciseId }
        swapKey = nil
        selectedKey = item.key
        if let c {
            var n = item
            n.swapped = true
            n.plannedExercise = item.plannedExercise ?? item.exercise
            n.exercise.id = c.exerciseUuid
            n.exercise.slug = c.slug
            n.exercise.name = c.name
            n.exercise.category = c.category
            n.exercise.loadMode = c.loadMode
            n.exercise.carriageKgPerSide = c.carriageKgPerSide
            n.exercise.formCueId = nil
            n.exercise.equipment = nil
            n.blockedReason = c.blockedReason
            n.lastTopKg = c.lastKg
            n.sets = item.sets.map { s in
                var s = s
                s.logged = nil
                s.last = nil
                s.planned?.openKg = c.lastKg
                return s
            }
            swaps[item.key] = n
        }
        let key = item.key
        let body = SwapBody(planItemId: planItemId, exerciseId: c?.exerciseUuid ?? exerciseId, overrideReason: overrideReason)
        Task {
            do {
                try await model.api.post("sessions/\(sessionId)/swap", body)
                model.show(overrideReason != nil ? "Swapped and flagged for your PT" : "Exercise swapped")
                await reload()
            } catch {
                swaps[key] = nil
                if let e = error as? APIError, e.status != 0 {
                    model.show(e.message, kind: .error)
                } else {
                    model.show("Swapping needs a connection. Try again in a moment.", kind: .error)
                }
            }
        }
    }

    private func saveNote(_ text: String, exercise: String?) {
        let line = exercise.map { "\($0): \(text)" } ?? text
        let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let next = trimmed.isEmpty ? line : "\(trimmed)\n\(line)"
        let before = notes
        noteOpen = false
        notes = next
        model.show("Note added for your PT")
        Task {
            await model.mutate(.saveNotes(sessionId: sessionId, notes: String(next.prefix(2000))), rollback: { notes = before })
        }
    }

    private func discard() async {
        do {
            try await model.api.post("sessions/\(sessionId)/discard")
            setRest(nil)
            RestTimer.clear(sessionId)
            dismiss()
            model.dataChanged()
        } catch {
            if let e = error as? APIError, e.status != 0 {
                model.show(e.message, kind: .error)
            } else {
                model.show("Discarding needs a connection.", kind: .error)
            }
        }
    }

    // MARK: Rest

    private func setRest(_ next: RestState?) {
        rest = next
        RestTimer.save(sessionId, next)
        if let next {
            RestTimer.scheduleNotification(endAt: next.endAt, nextLabel: restNext(derived))
        } else {
            RestTimer.cancelNotification()
        }
    }

    private func addRest(_ sec: Double) {
        let now = Date()
        if let rest, rest.endAt > now {
            setRest(RestState(endAt: rest.endAt.addingTimeInterval(sec), totalSec: rest.totalSec + sec, label: rest.label))
        } else {
            setRest(RestState(endAt: now.addingTimeInterval(sec), totalSec: sec, label: rest?.label ?? "Rest"))
        }
    }
}

/// The pulsing "live" dot next to the session clock.
private struct LiveDot: View {
    let color: Color
    @State private var on = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 7, height: 7)
            .opacity(on ? 0.35 : 1)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: on)
            .onAppear { on = true }
            .accessibilityHidden(true)
    }
}

/// "Note for your PT": up to 300 characters, appended to the session notes.
struct SessionNoteSheet: View {
    let exercise: String?
    let onSave: (String) -> Void

    @State private var text = ""
    @State private var contentHeight: CGFloat = 320
    @FocusState private var focused: Bool

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Note for your PT")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(Color.fg)
                if let exercise {
                    Text("\(exercise), added to the session notes")
                        .font(.system(size: 13))
                        .foregroundStyle(Color.muted)
                }
            }
            .padding(.horizontal, 6)

            TextField("Grip slipped on set 3…", text: $text, axis: .vertical)
                .lineLimit(3...6)
                .font(.system(size: 16))
                .foregroundStyle(Color.fg)
                .focused($focused)
                .padding(14)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .onChange(of: text) { _, t in if t.count > 300 { text = String(t.prefix(300)) } }

            Button("Add note") { if !trimmed.isEmpty { onSave(trimmed) } }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(trimmed.isEmpty)
                .opacity(trimmed.isEmpty ? 0.5 : 1)
        }
        .padding(.horizontal, 12)
        .padding(.top, 24)
        .padding(.bottom, 12)
        .sessionMeasureHeight($contentHeight)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.bg)
        .sessionBottomSheet(height: contentHeight)
        .onAppear { focused = true }
    }
}
