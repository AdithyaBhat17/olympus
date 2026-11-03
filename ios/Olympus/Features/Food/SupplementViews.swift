import OlympusCore
import SafariServices
import SwiftUI

// MARK: Writes

/// Every supplement write is optimistic and goes through the outbox: the tile
/// or row changes on tap, the request runs behind it (queued when offline),
/// and a rejection puts the item back. Only food-linked doses (whey) touch
/// the food log, so only those refresh the rest of the app.
@MainActor
struct SupplementActions {
    let model: AppModel
    @Binding var day: TodaySlots
    let isToday: Bool

    /// Tap the slot's ring: everything still due, taken now. Toast with Undo.
    func takeSlot(_ slot: TodaySlots.Slot) {
        let pending = slot.items.filter { $0.status == .pending }
        guard !pending.isEmpty else { return }
        let at = isToday ? Date() : nil
        Task {
            await model.mutate(
                .takeSlot(slot: slot.slot.rawValue, date: day.date, at: at.map(Self.iso)),
                apply: {
                    withAnimation(.snappy) {
                        for p in pending { update(p.id) { $0.mark(.taken, late: false, multiplier: 1, at: at) } }
                    }
                },
                rollback: { for p in pending { update(p.id) { $0 = p } } },
                onOk: { data in
                    if let n = Self.nudge(data) { model.show(n) } else {
                        model.show("\(slot.label) taken", undo: { undo(pending) })
                    }
                    if pending.contains(where: \.isFoodLinked) { model.dataChanged() }
                }
            )
        }
    }

    /// One item: taken, half, skipped, ×2, late, or a new time for an existing entry.
    func set(_ item: SlotItem, _ status: DoseInput.Status, late: Bool = false, multiplier: Double? = nil, at: Date? = nil) {
        let when = at ?? (isToday ? Date() : nil)
        let input = DoseInput(supplementId: item.id, status: status, date: day.date, late: late ? true : nil, multiplier: multiplier, at: when.map(Self.iso))
        let effective = status == .skipped ? 0 : status == .half ? 0.5 : (multiplier ?? 1)
        Task {
            await model.mutate(
                .setDose(input),
                apply: { withAnimation(.snappy) { update(item.id) { $0.mark(SlotItem.Status(status), late: late, multiplier: effective, at: when) } } },
                rollback: { update(item.id) { $0 = item } },
                onOk: { data in
                    if let n = Self.nudge(data) { model.show(n) }
                    if item.isFoodLinked { model.dataChanged() }
                }
            )
        }
    }

    func clear(_ item: SlotItem) { undo([item]) }

    private func undo(_ items: [SlotItem]) {
        let current = items.compactMap { i in find(i.id) }
        withAnimation(.snappy) { for i in items { update(i.id) { $0.mark(.pending, late: false, multiplier: nil, at: nil) } } }
        for i in current {
            Task {
                await model.mutate(
                    .clearDose(supplementId: i.id, date: day.date),
                    rollback: { update(i.id) { $0 = i } },
                    onOk: { _ in if i.isFoodLinked { model.dataChanged() } }
                )
            }
        }
    }

    private func find(_ id: String) -> SlotItem? {
        day.slots.lazy.flatMap(\.items).first { $0.id == id }
    }

    private func update(_ id: String, _ change: (inout SlotItem) -> Void) {
        for s in day.slots.indices {
            for i in day.slots[s].items.indices where day.slots[s].items[i].id == id {
                change(&day.slots[s].items[i])
            }
        }
    }

    private static func nudge(_ data: Data) -> String? {
        (try? JSONDecoder().decode(NudgeResult.self, from: data))?.nudges?.first
    }

    nonisolated static func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        f.timeZone = .current
        f.formatOptions = [.withInternetDateTime]
        return f.string(from: d)
    }
}

extension SlotItem {
    var isFoodLinked: Bool { supplement.foodId != nil }

    var takenDate: Date? {
        guard let takenAt else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: takenAt) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: takenAt)
    }

    mutating func mark(_ s: Status, late: Bool, multiplier: Double?, at: Date?) {
        status = s
        self.late = late
        self.multiplier = multiplier
        if s == .pending { takenAt = nil } else if let at { takenAt = SupplementActions.iso(at) }
    }
}

extension SlotItem.Status {
    init(_ s: DoseInput.Status) {
        switch s {
        case .taken: self = .taken
        case .half: self = .half
        case .skipped: self = .skipped
        }
    }

    var dose: DoseInput.Status? {
        switch self {
        case .taken: .taken
        case .half: .half
        case .skipped: .skipped
        case .pending: nil
        }
    }
}

// MARK: Slot ring

/// The slot's check: an empty ring, a ring filling as items are taken, then solid.
struct SlotCheck: View {
    let slot: TodaySlots.Slot
    var size: CGFloat = 44
    let tap: () -> Void

    var body: some View {
        let pct = slot.items.isEmpty ? 0 : CGFloat(slot.done) / CGFloat(slot.items.count)
        Button {
            Haptics.tick()
            tap()
        } label: {
            ZStack {
                Circle().fill(slot.allDone ? Color.coral : Color.bg)
                if !slot.allDone {
                    Circle().strokeBorder(Color.lineStrong, lineWidth: 2.5)
                    Circle()
                        .inset(by: 1.25)
                        .trim(from: 0, to: pct)
                        .stroke(Color.coral, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    if slot.done > 0 {
                        Text("\(slot.done)/\(slot.items.count)").font(.num(13)).foregroundStyle(Color.fg2)
                    }
                }
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.4, weight: .heavy))
                    .foregroundStyle(.white)
                    .scaleEffect(slot.allDone ? 1 : 0.4)
                    .opacity(slot.allDone ? 1 : 0)
            }
            .frame(width: size, height: size)
            .contentShape(Circle())
            .animation(.spring(duration: 0.3, bounce: 0.35), value: slot.allDone)
            .animation(.snappy, value: slot.done)
        }
        .buttonStyle(PressStyle(scale: 0.9))
        .sensoryFeedback(.success, trigger: slot.allDone) { _, new in new }
        .accessibilityLabel(slot.allDone ? "\(slot.label): all taken" : "Mark \(slot.label) taken")
    }
}

// MARK: Tiles

/// Today's supplements as a row of slot tiles, starting at the next slot due.
/// The ring takes the whole slot in one tap; the tile opens per-item controls.
struct SupplementTiles: View {
    @Environment(AppModel.self) private var model
    @Binding var day: TodaySlots
    let isToday: Bool
    let open: (TodaySlots.Slot) -> Void
    @State private var managing = false

    var body: some View {
        let actions = SupplementActions(model: model, day: $day, isToday: isToday)
        let total = day.slots.reduce(0) { $0 + $1.items.count }
        let taken = day.slots.reduce(0) { $0 + $1.done }
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("Supplements").font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.fg)
                Text("\(taken) of \(total)")
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Color.muted)
                    .contentTransition(.numericText())
                    .animation(.snappy, value: taken)
                Spacer()
                if manageURL != nil {
                    Button { managing = true } label: {
                        HStack(spacing: 2) {
                            Text("Manage")
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold))
                        }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.fg2)
                        .padding(.horizontal, 8)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.leading, 20)
            .padding(.trailing, 12)

            if !day.lowStock.isEmpty {
                Text("Running low: " + day.lowStock.map { "\($0.name), \(Int($0.daysLeft ?? 0)) days" }.joined(separator: " · "))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.dangerInk)
                    .padding(.horizontal, 20)
            }

            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(day.slots) { slot in
                            tile(slot, actions).id(slot.id)
                        }
                    }
                    .scrollTargetLayout()
                }
                // Margins, not padding: view-aligned snapping then rests a tile at 16, not 0.
                .contentMargins(.horizontal, 16, for: .scrollContent)
                .scrollIndicators(.hidden)
                .scrollTargetBehavior(.viewAligned)
                .onAppear {
                    // Only on appear: don't yank the row while someone is ticking things off.
                    if let due = day.slots.first(where: { !$0.allDone }), due.id != day.slots.first?.id {
                        proxy.scrollTo(due.id, anchor: .leading)
                    }
                }
            }
        }
        .sheet(isPresented: $managing, onDismiss: { model.dataChanged() }) {
            if let manageURL { SafariView(url: manageURL).ignoresSafeArea() }
        }
    }

    /// The web stack page (add, edit, inventory, labs) until there's a native one.
    private var manageURL: URL? {
        model.auth.serverURL?.appending(path: "supplements")
    }

    private func tile(_ slot: TodaySlots.Slot, _ actions: SupplementActions) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                // Done: the ring opens the slot instead, where each item can be undone or re-timed.
                SlotCheck(slot: slot) { slot.allDone ? open(slot) : actions.takeSlot(slot) }
                Spacer()
                if let t = slot.slot.time {
                    Text(t).font(.system(size: 13, weight: .semibold)).monospacedDigit().foregroundStyle(Color.faint)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(slot.label).font(.system(size: 15, weight: .heavy)).foregroundStyle(slot.allDone ? Color.fg2 : Color.fg)
                Text(names(slot))
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .frame(width: 156)
        .background(slot.allDone ? Color.coral.opacity(0.12) : Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .onTapGesture {
            Haptics.tick()
            open(slot)
        }
        .animation(.snappy, value: slot.allDone)
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Open \(slot.label)") { open(slot) }
    }

    private func names(_ slot: TodaySlots.Slot) -> AttributedString {
        var out = AttributedString()
        for (i, item) in slot.items.enumerated() {
            if i > 0 { out += AttributedString(", ") }
            var name = AttributedString(item.supplement.name)
            if item.status == .skipped { name.strikethroughStyle = .single }
            out += name
            if let note = item.note {
                var n = AttributedString(" (\(note))")
                n.foregroundColor = .faint
                out += n
            }
        }
        return out
    }
}

private struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let vc = SFSafariViewController(url: url)
        vc.preferredControlTintColor = UIColor(Color.coral)
        return vc
    }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

// MARK: Slot sheet

/// One slot's items. Reads the live day, so it and the tiles never disagree.
struct SupplementSlotSheet: View {
    @Environment(AppModel.self) private var model
    @Binding var day: TodaySlots
    let slotId: String
    let isToday: Bool

    var body: some View {
        let actions = SupplementActions(model: model, day: $day, isToday: isToday)
        if let slot = day.slots.first(where: { $0.id == slotId }) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(slot.label).font(.system(size: 24, weight: .heavy)).foregroundStyle(Color.fg)
                        Text(subtitle(slot))
                            .font(.system(size: 14, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(Color.muted)
                            .contentTransition(.numericText())
                    }
                    Spacer()
                    SlotCheck(slot: slot, size: 48) { if !slot.allDone { actions.takeSlot(slot) } }
                        .disabled(slot.allDone)
                }
                .padding(.horizontal, 4)
                .padding(.bottom, 4)

                ForEach(slot.items) { item in
                    SlotItemCard(item: item, date: day.date, isToday: isToday, actions: actions)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 28)
            .padding(.bottom, 16)
            .animation(.snappy, value: slot.done)
            .fittedSheet()
        }
    }

    private func subtitle(_ slot: TodaySlots.Slot) -> String {
        let count = slot.allDone ? "All taken" : "\(slot.done) of \(slot.items.count) taken"
        return slot.slot.time.map { "\($0) · \(count)" } ?? count
    }
}

private struct SlotItemCard: View {
    let item: SlotItem
    let date: String
    let isToday: Bool
    let actions: SupplementActions
    @State private var retime: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(item.supplement.name)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(item.status == .skipped ? Color.muted : Color.fg)
                    .strikethrough(item.status == .skipped)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(item.supplement.servingDesc)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .lineLimit(1)
            }
            if item.status == .pending { pendingRow } else { loggedRow }
        }
        .padding(16)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    // Taken / Half / Skip share the width equally and never wrap; the rarer
    // ones (×2, late) live behind ⋯.
    private var pendingRow: some View {
        HStack(spacing: 8) {
            chip("Taken", style: .primary) { actions.set(item, .taken) }
            chip("Half") { actions.set(item, .half) }
            chip("Skip", style: .muted) { actions.set(item, .skipped) }
            Menu {
                if item.isFoodLinked {
                    Button("Two servings (×2)", systemImage: "multiply") { actions.set(item, .taken, multiplier: 2) }
                }
                Button("Taken, but late", systemImage: "clock.badge.exclamationmark") { actions.set(item, .taken, late: true) }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color.fg)
                    .frame(width: 44, height: 44)
                    .background(Color.bg, in: Circle())
            }
            .accessibilityLabel("More options")
        }
    }

    // What was logged, when (tap to change), and Undo.
    private var loggedRow: some View {
        HStack(spacing: 8) {
            Label(statusLabel, systemImage: item.status == .skipped ? "minus" : "checkmark")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.fg)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .frame(height: 44)
                .background(Color.coral.opacity(0.12), in: Capsule())
            if item.status != .skipped {
                DatePicker("Time taken", selection: timeBinding, in: range, displayedComponents: .hourAndMinute)
                    .labelsHidden()
                    .tint(Color.coral)
                    // 24-hour, like the slot times beside it.
                    .environment(\.locale, Locale(identifier: "en_GB"))
            }
            Spacer(minLength: 0)
            Button {
                Haptics.tick()
                actions.clear(item)
            } label: {
                Text("Undo")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.fg2)
                    .padding(.horizontal, 14)
                    .frame(height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
        }
    }

    private var statusLabel: String {
        switch item.status {
        case .taken:
            if (item.multiplier ?? 1) >= 2 { return "×2" }
            return item.late ? "Late" : "Taken"
        case .half: return "Half"
        case .skipped: return "Skipped"
        case .pending: return ""
        }
    }

    /// A new time re-sends the same dose. Debounced, since the wheel reports every tick.
    private var timeBinding: Binding<Date> {
        Binding(
            get: { item.takenDate ?? Date() },
            set: { new in
                guard let status = item.status.dose else { return }
                retime?.cancel()
                retime = Task {
                    try? await Task.sleep(for: .milliseconds(600))
                    guard !Task.isCancelled else { return }
                    actions.set(item, status, late: item.late, multiplier: status == .taken ? item.multiplier : nil, at: new)
                }
            }
        )
    }

    /// That day, up to now.
    private var range: ClosedRange<Date> {
        let cal = Calendar.current
        let start = FoodView.isoDay.date(from: date).map {
            // isoDay parses in UTC; rebuild midnight in the phone's zone.
            let c = Calendar(identifier: .gregorian).dateComponents(in: TimeZone(identifier: "UTC")!, from: $0)
            return cal.date(from: DateComponents(year: c.year, month: c.month, day: c.day)) ?? $0
        } ?? cal.startOfDay(for: Date())
        let end = min(Date(), cal.date(byAdding: DateComponents(day: 1, second: -1), to: start) ?? Date())
        return start...max(start, end)
    }

    private enum ChipStyle { case primary, plain, muted }

    private func chip(_ title: String, style: ChipStyle = .plain, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tick()
            action()
        } label: {
            Text(title)
                .font(.system(size: 15, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .foregroundStyle(style == .primary ? .white : style == .muted ? Color.muted : Color.fg)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(style == .primary ? Color.coral : Color.bg, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(PressStyle())
    }
}
