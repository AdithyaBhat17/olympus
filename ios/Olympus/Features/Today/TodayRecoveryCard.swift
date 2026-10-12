import OlympusCore
import SwiftUI

/// Sleep, protein and water bubbles plus the read-only vitals line
/// (src/components/today/recovery-card.tsx). Writes go through the outbox.
struct TodayRecoveryCard: View {
    @Environment(AppModel.self) private var model
    let data: RecoveryCardData

    struct Values: Equatable {
        var sleepMin: Int?
        var proteinG: Int?
        var waterMl: Int?
    }

    enum Field: String, Identifiable {
        case sleep, protein, water
        var id: String { rawValue }
    }

    @State private var vals: Values
    @State private var editing: Field?

    static let waterStep = 250
    static let waterCap = 20000

    init(data: RecoveryCardData) {
        self.data = data
        _vals = State(initialValue: Values(sleepMin: data.sleepMin, proteinG: data.proteinG, waterMl: data.waterMl))
    }

    private var targets: RecoveryCardData.CardTargets { data.targets }
    private var short: Bool { vals.sleepMin.map { $0 < targets.minSleepMin } ?? false }

    private static let sourceLabel = ["whoop": "Whoop", "apple_health": "Apple Health", "claude": "Claude", "manual": "Manual"]

    /// "Whoop, Apple Health": the non-manual sources, deduplicated, in field order.
    private var sourceLine: String {
        var seen: [String] = []
        for key in ["sleep", "protein", "water", "hrv", "rhr"] + data.sources.keys.sorted() {
            guard let s = data.sources[key], s != "manual", let label = Self.sourceLabel[s] ?? Optional(s) else { continue }
            if !seen.contains(label) { seen.append(label) }
        }
        return seen.joined(separator: ", ")
    }

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                SectionLabel("Recovery").accessibilityAddTraits(.isHeader)
                Spacer()
                Text(sourceLine.isEmpty ? "Tap to log" : sourceLine)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
            }

            HStack(alignment: .top, spacing: 8) {
                tile(
                    label: short ? "Short sleep" : "Sleep",
                    labelColor: short ? .dangerInk : .muted,
                    a11y: "Sleep \(formatSleep(vals.sleepMin)) of \(formatHours(targets.sleepMin)) h. Edit",
                    action: { editing = .sleep }
                ) {
                    TodayFillBubble(value: vals.sleepMin.map(Double.init), target: Double(targets.sleepMin), kind: "B", danger: short, delay: 0) {
                        Text(vals.sleepMin.map { "\($0 / 60)h\(String(format: "%02d", $0 % 60))" } ?? "—")
                            .font(.num(20))
                    }
                }
                tile(
                    label: "Protein",
                    labelColor: .muted,
                    a11y: "Protein \(vals.proteinG ?? 0)\(targets.proteinG.map { " of \($0)" } ?? "") grams. Edit",
                    action: { editing = .protein }
                ) {
                    TodayFillBubble(value: vals.proteinG.map(Double.init), target: targets.proteinG.map(Double.init), kind: "A", delay: 0.08) {
                        Text(vals.proteinG.map(String.init) ?? "—").font(.num(20))
                        Text(targets.proteinG.map { "of \($0) g" } ?? "g")
                            .font(.system(size: 11, weight: .bold))
                            .opacity(0.75)
                    }
                }
                tile(
                    label: "Water, tap +250",
                    labelColor: .muted,
                    a11y: "Water \(Self.litres(vals.waterMl ?? 0))\(targets.waterMl.map { " of \(Self.litres($0))" } ?? "") litres. Add 250 ml",
                    action: addWater
                ) {
                    TodayFillBubble(value: vals.waterMl.map(Double.init), target: targets.waterMl.map(Double.init), kind: "C", delay: 0.16) {
                        Text(Self.litres(vals.waterMl ?? 0))
                            .font(.num(20))
                            .contentTransition(.numericText(value: Double(vals.waterMl ?? 0)))
                        Text(targets.waterMl.map { "of \(Self.litres($0)) L" } ?? "L")
                            .font(.system(size: 11, weight: .bold))
                            .opacity(0.75)
                    }
                }
            }

            if data.hrvMs != nil || data.restingHr != nil {
                vitals
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .multilineTextAlignment(.center)
                    .padding(.top, -4)
            }

            if let hold = data.holdMessage {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 17))
                        .foregroundStyle(Color.danger)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Progression on hold today").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.fg)
                        Text(hold).font(.system(size: 13)).foregroundStyle(Color.muted).lineSpacing(2)
                    }
                    Spacer(minLength: 0)
                }
                .padding(14)
                .background(Color.bg, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }

            Button("Edit water total") { editing = .water }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.coral)
                .frame(minHeight: 44)
                .padding(.horizontal, 12)
                .padding(.vertical, -4)
        }
        .padding(.top, 18)
        .padding(.bottom, 16)
        .padding(.horizontal, 16)
        .card(32)
        .onChange(of: data) { _, d in
            // Server truth wins whenever a fresh load arrives.
            vals = Values(sleepMin: d.sleepMin, proteinG: d.proteinG, waterMl: d.waterMl)
        }
        .sheet(item: $editing) { field in
            TodayCheckInForm(field: field, values: vals, targets: targets) { input, patch in
                save(input, patch)
                editing = nil
            }
            .fittedSheet()
        }
    }

    private var vitals: Text {
        var t = Text("")
        if let hrv = data.hrvMs {
            t = t + Text("HRV ") + Text("\(hrv)").font(.num(13)).foregroundStyle(Color.fg2) + Text(" ms")
                + Text(data.sources["hrv"] == "whoop" ? " (Whoop)" : "")
        }
        if data.hrvMs != nil, data.restingHr != nil { t = t + Text(" · ") }
        if let rhr = data.restingHr {
            t = t + Text("Resting HR ") + Text("\(rhr)").font(.num(13)).foregroundStyle(Color.fg2)
                + Text(data.sources["rhr"] == "whoop" ? " (Whoop)" : "")
        }
        return t
    }

    private func tile<B: View>(label: String, labelColor: Color, a11y: String, action: @escaping () -> Void, @ViewBuilder bubble: () -> B) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                bubble()
                Text(label)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(labelColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(a11y)
        .accessibilityAddTraits(.isButton)
    }

    // MARK: Writes

    private func addWater() {
        Haptics.tick()
        let next = min(Self.waterCap, (vals.waterMl ?? 0) + Self.waterStep)
        save(CheckInInput(date: data.date, waterMl: .some(next))) { $0.waterMl = next }
    }

    private func save(_ input: CheckInInput, _ patch: @escaping (inout Values) -> Void) {
        let before = vals
        var input = input
        input.date = data.date
        Task {
            await model.mutate(
                .checkIn(input),
                apply: { withAnimation(.easeOut(duration: 0.7)) { patch(&vals) } },
                rollback: { withAnimation { vals = before } }
            )
        }
    }

    /// 1750 → "1.75", 2000 → "2".
    static func litres(_ ml: Int) -> String {
        let l = (Double(ml) / 10).rounded() / 100
        return String(format: "%g", l)
    }
}

private struct TodayPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Fill bubble

/// An 84 pt bubble that fills from the bottom with a moving wave, like a glass of water.
struct TodayFillBubble<Content: View>: View {
    /// nil: nothing logged.
    let value: Double?
    /// nil: not tracked, the value shows and the bubble stays empty.
    let target: Double?
    let kind: String
    var danger = false
    var delay: Double = 0
    @ViewBuilder var content: () -> Content

    @State private var shown = false
    @State private var waveDone = false

    private var frac: Double {
        guard let value, let target, target > 0 else { return 0 }
        return min(1, max(0, value / target))
    }

    var body: some View {
        let colors = KindColors(type: kind)
        let fill = danger ? Color.danger : colors.k
        let onFill = danger ? Color.white : colors.on
        ZStack {
            Circle().fill(Color.surface3)
            if frac > 0 {
                TimelineView(.animation(paused: waveDone || frac >= 1)) { ctx in
                    let phase = ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 4) / 4 * 2 * .pi
                    TodayWaterShape(level: shown ? frac : 0, phase: phase, amplitude: frac < 1 ? 3.5 : 0)
                        .fill(fill)
                }
            }
            VStack(spacing: 0) { content() }
                .foregroundStyle(frac > 0.55 ? onFill : Color.fg)
                .animation(.easeInOut(duration: 0.3), value: frac > 0.55)
        }
        .frame(width: 84, height: 84)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.bg, lineWidth: 5))
        .scaleEffect(shown ? 1 : 0.85)
        .opacity(shown ? 1 : 0)
        .animation(.easeOut(duration: 0.7), value: frac)
        .onAppear {
            withAnimation(.spring(duration: 0.5, bounce: 0.3).delay(delay)) { shown = true }
        }
        .task {
            // Like the web's three passes of the wave, then still.
            try? await Task.sleep(for: .seconds(12))
            waveDone = true
        }
    }
}

/// Filled area below a sine-wave surface at `level` (0 empty … 1 full).
struct TodayWaterShape: Shape {
    var level: Double
    var phase: Double
    var amplitude: Double

    var animatableData: Double {
        get { level }
        set { level = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let y0 = rect.minY + (1 - level) * rect.height
        let waves = 2.0
        let steps = 48
        for i in 0...steps {
            let x = rect.minX + rect.width * Double(i) / Double(steps)
            let y = y0 + amplitude * sin(phase + Double(i) / Double(steps) * waves * 2 * .pi)
            if i == 0 { p.move(to: CGPoint(x: x, y: y)) } else { p.addLine(to: CGPoint(x: x, y: y)) }
        }
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

// MARK: - Check-in form

/// The sheet behind a bubble: hours + minutes, grams, or litres (or ml).
struct TodayCheckInForm: View {
    let field: TodayRecoveryCard.Field
    let values: TodayRecoveryCard.Values
    let targets: RecoveryCardData.CardTargets
    let onSave: (CheckInInput, @escaping (inout TodayRecoveryCard.Values) -> Void) -> Void

    @State private var h: String
    @State private var m: String
    @State private var protein: String
    @State private var water: String
    @State private var error: String?
    @FocusState private var focused: Int?

    init(field: TodayRecoveryCard.Field, values: TodayRecoveryCard.Values, targets: RecoveryCardData.CardTargets,
         onSave: @escaping (CheckInInput, @escaping (inout TodayRecoveryCard.Values) -> Void) -> Void) {
        self.field = field
        self.values = values
        self.targets = targets
        self.onSave = onSave
        _h = State(initialValue: values.sleepMin.map { String($0 / 60) } ?? "")
        _m = State(initialValue: values.sleepMin.map { String($0 % 60) } ?? "")
        _protein = State(initialValue: values.proteinG.map(String.init) ?? "")
        _water = State(initialValue: values.waterMl.map(TodayRecoveryCard.litres) ?? "")
    }

    private var current: Int? {
        switch field {
        case .sleep: values.sleepMin
        case .protein: values.proteinG
        case .water: values.waterMl
        }
    }

    private var title: String {
        switch field {
        case .sleep: "Sleep last night"
        case .protein: "Protein today"
        case .water: "Water today"
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Recovery check-in").font(.system(size: 13)).foregroundStyle(Color.muted)
                    Text(title).font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.fg)
                }
                .padding(.horizontal, 6)

                switch field {
                case .sleep:
                    HStack(spacing: 8) {
                        input("Hours", text: $h, placeholder: "7", max: 2, decimal: false)
                        input("Minutes", text: $m, placeholder: "30", max: 2, decimal: false, focus: false)
                    }
                case .protein:
                    input("Grams so far." + (targets.proteinG.map { " The floor is \($0) g" } ?? ""),
                          text: $protein, placeholder: "0", max: 4, decimal: false)
                case .water:
                    input("Litres so far (or type ml, e.g. 750)." + (targets.waterMl.map { " Target \(TodayRecoveryCard.litres($0)) L" } ?? ""),
                          text: $water, placeholder: "0.0", max: 6, decimal: true)
                }

                if let error {
                    Text(error)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.dangerInk)
                        .padding(.horizontal, 6)
                }

                Button("Save") { submit(clear: false) }
                    .buttonStyle(PrimaryButtonStyle())
                if current != nil {
                    Button("Clear") { submit(clear: true) }
                        .buttonStyle(SecondaryButtonStyle())
                }
            }
            .padding(20)
            .padding(.top, 8)
        }
        .scrollBounceBehavior(.basedOnSize)
        .onAppear { focused = 0 }
    }

    private func input(_ label: String, text: Binding<String>, placeholder: String, max: Int, decimal: Bool, focus: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 12)).foregroundStyle(Color.muted).padding(.horizontal, 4)
            TextField(placeholder, text: Binding(
                get: { text.wrappedValue },
                set: { v in
                    let allowed = v.filter { decimal ? ($0.isNumber || $0 == "." || $0 == ",") : $0.isNumber }
                    text.wrappedValue = String(allowed.prefix(max))
                }
            ))
            .keyboardType(decimal ? .decimalPad : .numberPad)
            .multilineTextAlignment(.center)
            .font(.num(28))
            .foregroundStyle(Color.fg)
            .frame(height: 56)
            .background(Color.surface, in: Capsule())
            .focused($focused, equals: focus ? 0 : 1)
            .accessibilityLabel(label)
        }
        .frame(maxWidth: .infinity)
    }

    private func submit(clear: Bool) {
        error = nil
        switch field {
        case .sleep:
            let hours = Int(h) ?? 0
            let mins = Int(m) ?? 0
            let total = hours * 60 + mins
            if !clear, (h.isEmpty && m.isEmpty) || mins > 59 || total > 1440 {
                error = "Enter hours and minutes (minutes 0–59)."
                return
            }
            let v: Int? = clear ? nil : total
            onSave(CheckInInput(date: nil, sleepMin: .some(v))) { $0.sleepMin = v }
        case .protein:
            let g = Int(protein)
            if !clear, g == nil || g! > 1000 {
                error = "Enter grams of protein."
                return
            }
            let v: Int? = clear ? nil : g
            onSave(CheckInInput(date: nil, proteinG: .some(v))) { $0.proteinG = v }
        case .water:
            let parsed = Double(water.replacingOccurrences(of: ",", with: "."))
            if !clear, parsed == nil || parsed! < 0 {
                error = "Enter litres (or ml)."
                return
            }
            // Anything above 20 is clearly millilitres.
            let ml = parsed.map { $0 > 20 ? Int($0.rounded()) : Int(($0 * 1000).rounded()) } ?? 0
            if !clear, ml > TodayRecoveryCard.waterCap {
                error = "That's more than 20 L."
                return
            }
            let v: Int? = clear ? nil : ml
            onSave(CheckInInput(date: nil, waterMl: .some(v))) { $0.waterMl = v }
        }
    }
}
