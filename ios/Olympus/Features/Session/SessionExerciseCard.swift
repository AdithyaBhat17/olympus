import OlympusCore
import SwiftUI

/// The current exercise (exercise-card.tsx): a colour block with the name,
/// the hero load and its plates, target / effort tiles, swap and blocked
/// notes, PT cues; then the light sheet with the set table and actions.
struct SessionExerciseCard<Table: View>: View {
    let item: LiveItem
    let kind: KindColors
    let position: Int
    let total: Int
    let canRemoveSet: Bool
    let nextName: String?
    let onSwap: (() -> Void)?
    let onAddSet: () -> Void
    let onRemoveSet: () -> Void
    let onNote: () -> Void
    let onNext: () -> Void
    let onFormCues: (String) -> Void
    /// Load of the set about to be logged; falls back to the planned opener.
    let activeKg: Double?
    @ViewBuilder var table: () -> Table

    private var ex: ExerciseMeta { item.exercise }
    private var mode: LoadMode { ex.loadMode }

    var body: some View {
        VStack(spacing: 0) {
            block
            VStack(alignment: .leading, spacing: 16) {
                table()

                if item.done, let nextName {
                    Button(action: onNext) { Text("Next: \(nextName)").lineLimit(1) }
                        .buttonStyle(PrimaryButtonStyle(tint: kind.k, foreground: kind.on))
                }

                HStack(spacing: 8) {
                    Button("Add set", action: onAddSet)
                        .buttonStyle(SessionSoftButtonStyle())
                    Button("Swap") { onSwap?() }
                        .buttonStyle(SessionSoftButtonStyle())
                        .disabled(onSwap == nil)
                        .opacity(onSwap == nil ? 0.45 : 1)
                    Button("Note", action: onNote)
                        .buttonStyle(SessionSoftButtonStyle())
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 24)
            .sessionSheetOver()
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Current exercise")
    }

    // MARK: Colour block

    private var block: some View {
        let planned = item.openKg
        let open = planned ?? item.lastTopKg
        let delta: Double? = {
            guard let planned, let last = item.lastTopKg, isHarder(mode, planned, last) else { return nil }
            return abs(progressDelta(mode, prev: last, next: planned))
        }()
        let heroKg = activeKg ?? open
        let plates = heroKg.flatMap { plateBreakdown(ex, targetTrueKg: $0) }
        let cueLines = item.coachFlags + item.cues

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(position) of \(total)")
                        .font(.num(15))
                        .opacity(0.8)
                    nameLine
                        .id(ex.id)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                Spacer(minLength: 8)
                optionsMenu
            }

            HStack(alignment: .lastTextBaseline, spacing: 12) {
                HStack(alignment: .lastTextBaseline, spacing: 6) {
                    Text(heroText(heroKg))
                        .font(.num(88))
                        .tracking(-2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .contentTransition(.numericText())
                        .animation(.spring(duration: 0.35), value: heroKg)
                    Text(unitText)
                        .font(.system(size: 24, weight: .bold))
                        .opacity(0.85)
                        .lineLimit(1)
                }
                if let delta, delta > 0 {
                    Text("+\(formatKg(delta))")
                        .font(.system(size: 15, weight: .heavy))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(.white, in: Capsule())
                        .foregroundStyle(kind.text)
                        .padding(.bottom, 8)
                        .accessibilityLabel("Up \(formatKg(delta)) kg on last time")
                }
            }
            .accessibilityElement(children: .combine)

            if let plates {
                SessionPlates(breakdown: plates)
            }

            HStack(spacing: 8) {
                tile("Target", item.targetLabel ?? "\(item.sets.count) sets")
                tile("Effort", item.targetRpe.map { "RPE \(formatKg($0))" } ?? "Your call")
            }

            if item.swapped, let planned = item.plannedExercise {
                Label("Swapped in for \(planned.name)", systemImage: "info.circle")
                    .font(.system(size: 15))
                    .opacity(0.9)
            }

            if let reason = item.blockedReason {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Color.danger)
                        .padding(.top, 1)
                    Text("Blocked for you: \(reason). Sets log with an override flag for your PT.")
                        .font(.system(size: 15))
                        .foregroundStyle(Color.dangerInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }

            if !cueLines.isEmpty || ex.formCueId != nil {
                cues(cueLines)
            }
        }
        .foregroundStyle(kind.on)
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 56)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(kind.k)
        .animation(.spring(duration: 0.4), value: ex.id)
    }

    private var nameLine: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(ex.name)
                .font(.system(size: 30, weight: .heavy))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if item.straps { SessionStrapsChip() }
        }
    }

    private func heroText(_ kg: Double?) -> String {
        if mode == .time { return item.plannedMinutes.map { String($0.total) } ?? "—" }
        return kg.map(formatKg) ?? "—"
    }

    private var unitText: String {
        switch mode {
        case .time: "min"
        case .counterweight: "kg cw"
        case .perSide: "kg a side"
        case .total: "kg"
        }
    }

    private func tile(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).font(.system(size: 13, weight: .semibold)).opacity(0.85)
            Text(value).font(.num(20)).lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .background(.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func cues(_ lines: [String]) -> some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                if lines.isEmpty {
                    Text("Form cues from your PT")
                } else {
                    ForEach(Array(lines.enumerated()), id: \.offset) { i, c in
                        Group {
                            if i == 0 {
                                Text("\(Text("PT:").fontWeight(.heavy)) \(c)")
                            } else {
                                Text(c)
                            }
                        }
                        .accessibilityLabel(i < item.coachFlags.count ? "Coach flag: \(c)" : c)
                    }
                }
            }
            .font(.system(size: 15))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)

            if let cue = ex.formCueId {
                Button { onFormCues(cue) } label: {
                    Label("Form", systemImage: "play.fill")
                        .font(.system(size: 13, weight: .heavy))
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .background(.white, in: Capsule())
                        .foregroundStyle(kind.text)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .frame(maxHeight: .infinity, alignment: .top)
                .accessibilityLabel("Form cues")
            }
        }
        .padding(.vertical, 10)
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .frame(minHeight: 44)
        .background(.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var optionsMenu: some View {
        Menu {
            if let onSwap { Button("Swap exercise", systemImage: "arrow.left.arrow.right", action: onSwap) }
            if let cue = ex.formCueId { Button("Form cues", systemImage: "figure.strengthtraining.traditional") { onFormCues(cue) } }
            Button("Add set", systemImage: "plus", action: onAddSet)
            Button("Remove last set", systemImage: "minus.circle", role: .destructive, action: onRemoveSet)
                .disabled(!canRemoveSet)
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 17, weight: .bold))
                .frame(width: 44, height: 44)
                .background(kind.on.opacity(0.18), in: Circle())
                .foregroundStyle(kind.on)
        }
        .accessibilityLabel("Exercise options")
    }
}

struct SessionStrapsChip: View {
    var body: some View {
        Text("straps")
            .font(.system(size: 13, weight: .semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .overlay(Capsule().strokeBorder(.foreground, lineWidth: 1.5))
            .opacity(0.9)
    }
}

/// One side of the bar in the text colour (plates.tsx); plates slide on as the load changes.
struct SessionPlates: View {
    let breakdown: PlateBreakdown

    private static let sizes: [Double: (w: CGFloat, h: CGFloat, o: Double)] = [
        25: (26, 112, 1), 20: (24, 112, 0.85), 15: (22, 96, 0.75), 10: (20, 84, 0.65),
        5: (14, 64, 0.6), 2.5: (12, 50, 0.55), 1.25: (10, 40, 0.5),
    ]

    private var label: String {
        let b = breakdown
        if b.leftover < 0 { return "\(formatKg(-b.leftover)) kg lighter than the bar" }
        let base = b.plates.isEmpty ? "Just the bar" : b.plates.map(formatKg).joined(separator: " + ") + " each side"
        return base + (b.leftover > 0 ? ", \(formatKg(b.leftover)) kg short" : "")
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            GeometryReader { geo in
                let sleeveX = geo.size.width * 0.38
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(.foreground)
                        .opacity(0.5)
                        .frame(width: sleeveX, height: 12)
                        .offset(y: 52)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(.foreground)
                        .frame(width: 14, height: 40)
                        .offset(x: sleeveX, y: 38)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(.foreground)
                        .opacity(0.5)
                        .frame(width: max(0, geo.size.width - sleeveX - 14), height: 8)
                        .offset(x: sleeveX + 14, y: 54)
                    HStack(spacing: 4) {
                        ForEach(Array(breakdown.plates.enumerated()), id: \.offset) { i, p in
                            let s = Self.sizes[p] ?? (10, 40, 0.5)
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(.foreground)
                                .opacity(s.o)
                                .frame(width: s.w, height: s.h)
                                .transition(.move(edge: .trailing).combined(with: .opacity))
                        }
                    }
                    .frame(height: 116)
                    .offset(x: sleeveX + 18)
                }
            }
            .frame(height: 116)
            .animation(.spring(duration: 0.4, bounce: 0.3), value: breakdown.plates)
            Text(label)
                .font(.system(size: 15, weight: .semibold))
                .opacity(0.9)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}
