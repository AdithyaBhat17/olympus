import OlympusCore
import SwiftUI

private struct SlotBody: Encodable {
    let slot: SupplementSlot
    let date: String
}

private struct DoseBody: Encodable {
    let supplementId: String
    let status: SlotItem.Status
    let date: String
    var late: Bool?
    var multiplier: Double?
}

private struct ClearBody: Encodable {
    let supplementId: String
    let date: String
}

/// Shared by the tiles and the slot sheet: write, toast any timing note, refresh.
@MainActor
private func send(_ model: AppModel, _ path: String, _ body: some Encodable, changed: () -> Void) async -> Bool {
    do {
        let r = try await model.api.post(path, body, as: NudgeResult.self)
        if let n = r.nudges?.first { model.show(n) }
        changed()
        return true
    } catch {
        model.show(error)
        return false
    }
}

/// The slot's check: an empty ring, a ring filling as items are taken, then solid.
struct SlotCheck: View {
    let slot: TodaySlots.Slot
    var size: CGFloat = 44
    let take: () -> Void

    var body: some View {
        let pct = slot.items.isEmpty ? 0 : CGFloat(slot.done) / CGFloat(slot.items.count)
        Button {
            Haptics.tick()
            take()
        } label: {
            ZStack {
                if slot.allDone {
                    Circle().fill(Color.coral)
                    Image(systemName: "checkmark").font(.system(size: size * 0.4, weight: .heavy)).foregroundStyle(.white)
                } else {
                    Circle().fill(Color.bg)
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
            }
            .frame(width: size, height: size)
            .contentShape(Circle())
        }
        .buttonStyle(PressStyle(scale: 0.9))
        .disabled(slot.allDone)
        .sensoryFeedback(.success, trigger: slot.allDone) { _, new in new }
        .accessibilityLabel(slot.allDone ? "\(slot.label): done" : "Mark \(slot.label) taken")
    }
}

/// Today's supplements as a row of slot tiles, starting at the next slot due.
struct SupplementTiles: View {
    @Environment(AppModel.self) private var model
    let slots: TodaySlots
    let open: (TodaySlots.Slot) -> Void
    let changed: () -> Void

    var body: some View {
        let total = slots.slots.reduce(0) { $0 + $1.items.count }
        let taken = slots.slots.reduce(0) { $0 + $1.done }
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("Supplements").font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.fg)
                Text("\(taken) of \(total)").font(.system(size: 13, weight: .semibold)).monospacedDigit().foregroundStyle(Color.muted)
            }
            .padding(.horizontal, 20)

            if !slots.lowStock.isEmpty {
                Text("Running low: " + slots.lowStock.map { "\($0.name), \(Int($0.daysLeft ?? 0)) days" }.joined(separator: " · "))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.dangerInk)
                    .padding(.horizontal, 20)
            }

            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(slots.slots) { slot in
                            tile(slot).id(slot.id)
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
                    if let due = slots.slots.first(where: { !$0.allDone }), due.id != slots.slots.first?.id {
                        proxy.scrollTo(due.id, anchor: .leading)
                    }
                }
            }
        }
    }

    private func tile(_ slot: TodaySlots.Slot) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SlotCheck(slot: slot) {
                    Task { await send(model, "supplements/slots", SlotBody(slot: slot.slot, date: slots.date), changed: changed) }
                }
                Spacer()
                if let t = slot.slot.time {
                    Text(t).font(.system(size: 13, weight: .semibold)).monospacedDigit().foregroundStyle(Color.faint)
                }
            }
            Button { open(slot) } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(slot.label).font(.system(size: 15, weight: .heavy)).foregroundStyle(slot.allDone ? Color.fg2 : Color.fg)
                    Text(names(slot))
                        .font(.system(size: 13))
                        .foregroundStyle(Color.muted)
                        .lineLimit(2, reservesSpace: true)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle(scale: 0.98))
        }
        .padding(12)
        .frame(width: 148)
        .background(slot.allDone ? Color.coral.opacity(0.12) : Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .animation(.snappy, value: slot.allDone)
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

/// One slot's items: taken, ×2 (for food-linked doses), half, late, skip, undo.
struct SupplementSlotSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State var slot: TodaySlots.Slot
    let date: String
    let changed: () -> Void
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(slot.label).font(.system(size: 24, weight: .heavy)).foregroundStyle(Color.fg)
                Spacer()
                SlotCheck(slot: slot) {
                    run("supplements/slots", SlotBody(slot: slot.slot, date: date)) {
                        for i in slot.items.indices where slot.items[i].status == .pending { slot.items[i].status = .taken }
                    }
                }
            }
            .padding(.horizontal, 4)

            ForEach(slot.items) { item in
                itemCard(item)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 24)
        .padding(.bottom, 12)
        .disabled(busy)
        .fittedSheet()
    }

    private func itemCard(_ item: SlotItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(item.supplement.name).font(.system(size: 17, weight: .bold)).foregroundStyle(Color.fg)
                Spacer()
                Text(item.supplement.servingDesc).font(.system(size: 13)).foregroundStyle(Color.muted)
            }
            HStack(spacing: 8) {
                if item.status == .pending {
                    chip("Taken", primary: true) { dose(item, .taken) }
                    if item.supplement.foodId != nil { chip("×2") { dose(item, .taken, multiplier: 2) } }
                    chip("Half") { dose(item, .half) }
                    chip("Late") { dose(item, .taken, late: true) }
                    chip("Skip", muted: true) { dose(item, .skipped) }
                } else {
                    Label(statusLabel(item), systemImage: item.status == .skipped ? "minus" : "checkmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Color.fg)
                        .padding(.horizontal, 16)
                        .frame(height: 40)
                        .background(Color.coral.opacity(0.12), in: Capsule())
                    chip("Undo") { undo(item) }
                }
            }
        }
        .padding(16)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func statusLabel(_ item: SlotItem) -> String {
        switch item.status {
        case .taken: item.late ? "Taken late" : "Taken"
        case .half: "Half dose"
        case .skipped: "Skipped"
        case .pending: ""
        }
    }

    private func chip(_ title: String, primary: Bool = false, muted: Bool = false, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tick()
            action()
        } label: {
            Text(title)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(primary ? .white : muted ? Color.muted : Color.fg)
                .padding(.horizontal, 16)
                .frame(height: 40)
                .background(primary ? Color.coral : Color.bg, in: Capsule())
        }
        .buttonStyle(PressStyle())
    }

    private func dose(_ item: SlotItem, _ status: SlotItem.Status, late: Bool? = nil, multiplier: Double? = nil) {
        run("supplements/doses", DoseBody(supplementId: item.id, status: status, date: date, late: late, multiplier: multiplier)) {
            if let i = slot.items.firstIndex(where: { $0.id == item.id }) {
                slot.items[i].status = status
                slot.items[i].late = late ?? false
            }
        }
    }

    private func undo(_ item: SlotItem) {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await model.api.delete("supplements/doses", ClearBody(supplementId: item.id, date: date))
                if let i = slot.items.firstIndex(where: { $0.id == item.id }) { slot.items[i].status = .pending }
                changed()
            } catch { model.show(error) }
        }
    }

    private func run(_ path: String, _ body: some Encodable, apply: @escaping () -> Void) {
        busy = true
        Task {
            defer { busy = false }
            if await send(model, path, body, changed: changed) {
                withAnimation(.snappy) { apply() }
            }
        }
    }
}
