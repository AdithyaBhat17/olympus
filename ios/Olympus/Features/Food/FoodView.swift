import OlympusCore
import SwiftUI

/// The Food tab (src/app/(app)/food/page.tsx): week strip, the protein block,
/// supplement slots, the day's meals, and the describe / search / scan dock.
struct FoodView: View {
    @Environment(AppModel.self) private var model
    @Environment(Router.self) private var router
    /// nil = today. Set from the week strip.
    @State private var date: String?
    @State private var screen: FoodScreen?
    @State private var error: String?
    @State private var log: LogRequest?
    @State private var editing: DayLogItem?
    @State private var openSlot: SlotRef?
    /// The sheet opens on the mode used last (search until the athlete chooses).
    @AppStorage("food.lastMode") private var lastMode = FoodLogSheet.Mode.search.rawValue

    struct SlotRef: Identifiable { let id: String }

    struct LogRequest: Identifiable {
        let id = UUID()
        var mode: FoodLogSheet.Mode
        var meal: Meal
        var text: String?
    }

    var body: some View {
        Group {
            if let screen {
                content(screen)
            } else if let error {
                ErrorState(message: error) { Task { await load() } }
            } else {
                SkeletonScreen()
            }
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Food")
        .toolbar(.hidden, for: .navigationBar)
        .task(id: "\(date ?? "today")·\(model.dataVersion)") { await load() }
        .onChange(of: router.foodLog != nil && screen != nil, initial: true) { _, ready in
            guard ready, let mode = router.foodLog else { return }
            let text = router.foodLogText
            router.foodLog = nil
            router.foodLogText = nil
            if let screen { log = LogRequest(mode: text == nil ? mode : .describe, meal: screen.defaultMeal, text: text) }
        }
        .onChange(of: router.foodSlot != nil && screen != nil, initial: true) { _, ready in
            guard ready, let id = router.foodSlot else { return }
            router.foodSlot = nil
            if screen?.slots.slots.contains(where: { $0.id == id }) == true { openSlot = .init(id: id) }
        }
        .sheet(item: $log) { req in
            if let screen {
                FoodLogSheet(date: screen.date, isToday: screen.isToday, meal: req.meal, mode: req.mode, initialText: req.text) {
                    model.dataChanged()
                }
            }
        }
        .sheet(item: $editing) { item in
            FoodItemSheet(item: item) { model.dataChanged() }
        }
        .sheet(item: $openSlot) { ref in
            if let screen {
                SupplementSlotSheet(day: slotsBinding(screen), slotId: ref.id, isToday: screen.isToday)
            }
        }
    }

    /// The day's slots, written in place by the optimistic supplement actions.
    private func slotsBinding(_ fallback: FoodScreen) -> Binding<TodaySlots> {
        Binding(get: { screen?.slots ?? fallback.slots }, set: { screen?.slots = $0 })
    }

    private func load() async {
        do {
            var query: [String: String] = [:]
            if let date { query["date"] = date }
            let s = try await model.api.get("food", query: query, as: FoodScreen.self)
            withAnimation(.snappy(duration: 0.25)) { screen = s }
            error = nil
        } catch is CancellationError {
        } catch {
            if screen == nil { self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }
            else { model.show(error) }
        }
    }

    private func content(_ s: FoodScreen) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                PageHeader(eyebrow: s.isToday ? "Today, \(Self.dayShort(s.date))" : Self.dayShort(s.date), title: "Food")
                FoodWeekStrip(days: s.week, selected: s.date, today: s.today, target: s.view.targets.protein) { day in
                    Haptics.tick()
                    date = day == s.today ? nil : day
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)

                ProteinBlock(view: s.view)
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                if !s.slots.slots.isEmpty {
                    SupplementsLine(day: s.slots) { openSlot = .init(id: $0.id) }
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                }

                Text("Meals")
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundStyle(Color.fg)
                    .padding(.horizontal, 20)
                    .padding(.top, 28)
                    .padding(.bottom, 12)

                VStack(spacing: 10) {
                    ForEach(Meal.allCases) { meal in
                        MealCard(meal: meal, view: s.view, add: { log = .init(mode: FoodLogSheet.Mode(rawValue: lastMode) ?? .search, meal: meal) }, edit: { editing = $0 })
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load() }
        .safeAreaPadding(.bottom, 160)
        .overlay(alignment: .bottom) {
            AddFoodButton { log = .init(mode: FoodLogSheet.Mode(rawValue: lastMode) ?? .search, meal: s.defaultMeal) }
                .padding(.bottom, 84)
        }
    }

    /// "Tue 3 Nov", matching the web's formatDayShort.
    static func dayShort(_ iso: String) -> String {
        guard let d = isoDay.date(from: iso) else { return iso }
        return d.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).locale(Locale(identifier: "en_GB")))
            .replacingOccurrences(of: ",", with: "")
    }

    static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

// MARK: Week strip

/// Seven days, each a ring filled by protein against the target.
struct FoodWeekStrip: View {
    let days: [WeekDay]
    let selected: String
    let today: String
    let target: Double?
    let pick: (String) -> Void

    var body: some View {
        HStack(spacing: 4) {
            ForEach(days) { d in
                let on = d.date == selected
                let future = d.date > today
                Button { pick(d.date) } label: {
                    VStack(spacing: 4) {
                        Text(Self.initial(d.date))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(on ? Color.bg.opacity(0.7) : Color.muted)
                        ZStack {
                            Circle().stroke(on ? Color.bg.opacity(0.2) : Color.surface3, lineWidth: 3.5)
                            Circle()
                                .trim(from: 0, to: progress(d))
                                .stroke(on ? Color.bg : Color.coral, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                            Text(Self.dayNumber(d.date))
                                .font(.num(15))
                                .foregroundStyle(on ? Color.bg : future ? Color.faint : Color.fg)
                        }
                        .frame(width: 36, height: 36)
                        Circle()
                            .fill(d.date == today ? (on ? Color.bg : Color.coral) : .clear)
                            .frame(width: 4, height: 4)
                    }
                    .padding(.top, 8)
                    .padding(.bottom, 6)
                    .frame(maxWidth: .infinity)
                    .background(on ? Color.fg : .clear, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(future)
                .opacity(future ? 0.6 : 1)
                .accessibilityLabel(a11y(d))
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .animation(.spring(duration: 0.35, bounce: 0.2), value: selected)
    }

    private func progress(_ d: WeekDay) -> CGFloat {
        guard let target, target > 0 else { return d.logged ? 1 : 0 }
        return min(1, d.protein / target)
    }

    private func a11y(_ d: WeekDay) -> String {
        let day = FoodView.isoDay.date(from: d.date)?.formatted(.dateTime.weekday(.wide).day().month(.wide)) ?? d.date
        guard d.logged else { return "\(day), nothing logged" }
        let hit = target.map { d.protein >= $0 } ?? false
        return "\(day), \(Int(d.protein)) grams protein\(hit ? ", target reached" : "")"
    }

    static func initial(_ iso: String) -> String {
        guard let d = FoodView.isoDay.date(from: iso) else { return "" }
        return d.formatted(.dateTime.weekday(.narrow).locale(Locale(identifier: "en_GB")))
    }

    static func dayNumber(_ iso: String) -> String {
        String(Int(iso.suffix(2)) ?? 0)
    }
}

// MARK: Protein block

/// Protein first, as a colour block like Today's session card. The bar is cut
/// into the day's feedings, so how protein is spread across meals shows.
struct ProteinBlock: View {
    let view: DayView

    private var eaten: Int { Int(view.totals.proteinCounted.rounded()) }
    private var target: Double? { view.targets.protein }
    private var feedings: [Double] { view.logs.map(\.totals.protein).filter { $0 > 0 } }

    private var status: String? {
        guard target != nil, let left = view.remaining.protein else { return nil }
        return left <= 0 ? "Target reached" : "\(Int(left.rounded())) g to go"
    }

    private var caption: String {
        if feedings.isEmpty {
            if let target { return "Nothing yet. Four feedings of about \(Int((target / 4 / 5).rounded() * 5)) g gets you there." }
            return "Nothing logged yet."
        }
        let n = feedings.count
        return "\(n) \(n == 1 ? "feeding" : "feedings"), largest \(Int((feedings.max() ?? 0).rounded())) g"
    }

    var body: some View {
        let k = KindColors(.coral)
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Protein").font(.system(size: 17, weight: .semibold)).opacity(0.9)
                    Spacer()
                    if let status {
                        Text(status)
                            .font(.system(size: 13, weight: .bold))
                            .padding(.horizontal, 12)
                            .frame(height: 30)
                            .background(.white.opacity(0.2), in: Capsule())
                    }
                }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(eaten)").font(.num(64)).tracking(-1.5).contentTransition(.numericText())
                    Text(target.map { "/ \(Int($0)) g" } ?? "g").font(.num(22)).opacity(0.75)
                }
                .padding(.top, 8)

                FeedingBar(feedings: feedings, scale: max(target ?? 0, Double(eaten), 1))
                    .frame(height: 12)
                    .padding(.top, 14)
                    .accessibilityLabel(caption)

                Text(caption)
                    .font(.system(size: 14, weight: .medium))
                    .opacity(0.85)
                    .padding(.top, 10)
                if view.totals.proteinExcluded > 0 {
                    Text("Plus \(Int(view.totals.proteinExcluded.rounded())) g collagen, not counted")
                        .font(.system(size: 13))
                        .opacity(0.7)
                        .padding(.top, 2)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 20)

            MacroRow(view: view)
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.black.opacity(0.1))
        }
        .foregroundStyle(k.on)
        .background {
            ZStack(alignment: .topTrailing) {
                k.k
                Circle().fill(Color(rgb: 210, 78, 51)).frame(width: 256, height: 256).offset(x: 64, y: -80)
                Circle().fill(Color(rgb: 220, 100, 72)).frame(width: 160, height: 160).offset(x: 24, y: -32)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 36, style: .continuous))
        .animation(.snappy, value: eaten)
    }
}

private struct FeedingBar: View {
    let feedings: [Double]
    let scale: Double

    var body: some View {
        GeometryReader { g in
            let gaps = CGFloat(max(0, feedings.count - 1)) * 3
            let usable = max(0, g.size.width - gaps)
            HStack(spacing: 3) {
                ForEach(Array(feedings.enumerated()), id: \.offset) { _, p in
                    Rectangle().fill(.white).frame(width: usable * CGFloat(p / scale))
                }
                Spacer(minLength: 0)
            }
            .background(.white.opacity(0.2))
            .clipShape(Capsule())
        }
    }
}

private struct MacroRow: View {
    let view: DayView

    var body: some View {
        let t = view.totals
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Calories").font(.system(size: 12, weight: .bold)).opacity(0.7)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(t.kcal.grouped).font(.num(19))
                    if let k = view.targets.kcal { Text("/ \(k.grouped)").font(.num(13)).opacity(0.7) }
                }
                if let left = view.remaining.kcal {
                    Text(left < 0 ? "\((-left).grouped) over" : "\(left.grouped) left")
                        .font(.system(size: 12, weight: left < 0 ? .bold : .regular))
                        .opacity(left < 0 ? 1 : 0.7)
                }
            }
            .fixedSize()
            .padding(.trailing, 20)
            macro("Carbs", t.carbs)
            macro("Fat", t.fat)
            macro("Fibre", t.fibre)
        }
    }

    private func macro(_ label: String, _ v: Double) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.system(size: 12, weight: .bold)).opacity(0.7)
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text("\(Int(v.rounded()))").font(.num(19))
                Text("g").font(.system(size: 13, weight: .semibold)).opacity(0.7)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension Double {
    /// "1,700", rounded.
    var grouped: String { Int(rounded()).formatted(.number.locale(Locale(identifier: "en_GB"))) }
}

// MARK: Meals

/// All four meals, always: where you'd log next is never hidden.
struct MealCard: View {
    let meal: Meal
    let view: DayView
    let add: () -> Void
    let edit: (DayLogItem) -> Void

    var body: some View {
        let logs = view.logs.filter { $0.meal == meal }
        let items = logs.flatMap(\.items)
        if items.isEmpty {
            Button {
                Haptics.tick()
                add()
            } label: {
                HStack(spacing: 12) {
                    Text(meal.label).font(.system(size: 17, weight: .bold)).foregroundStyle(Color.fg2)
                    Spacer()
                    Text("Nothing yet").font(.system(size: 13)).foregroundStyle(Color.faint)
                    PlusDisc()
                }
                .padding(.leading, 20)
                .padding(.trailing, 8)
                .frame(height: 56)
                .background(Color.surface.opacity(0.6), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel("Add to \(meal.label)")
        } else {
            let t = view.totals(for: meal)
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Text(meal.label).font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.fg)
                    if let first = logs.first, first.inputMode != "mfp_import" {
                        Text(first.time).font(.system(size: 13, weight: .semibold)).monospacedDigit().foregroundStyle(Color.muted)
                    }
                    Spacer(minLength: 8)
                    (Text("\(Int(t.protein.rounded()))").font(.num(17)) + Text(" g").font(.system(size: 13, weight: .bold)))
                        .foregroundStyle(Color.coral)
                    Text("· \(t.kcal.grouped) kcal").font(.system(size: 13)).monospacedDigit().foregroundStyle(Color.muted)
                    Button {
                        Haptics.tick()
                        add()
                    } label: {
                        PlusDisc()
                    }
                    .buttonStyle(PressStyle())
                    .padding(.leading, 4)
                    .accessibilityLabel("Add to \(meal.label)")
                }
                // Same 56 pt row and 8 pt inset as an empty meal, so every + sits in one column.
                .padding(.leading, 20)
                .padding(.trailing, 8)
                .padding(.vertical, 8)

                ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                    if i > 0 { Rectangle().fill(Color.surface3).frame(height: 1) }
                    Button { edit(item) } label: { ItemRow(item: item) }
                        .buttonStyle(PressStyle(scale: 0.98))
                        .disabled(item.isImported || item.grams == nil)
                }
            }
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        }
    }
}

private struct ItemRow: View {
    let item: DayLogItem

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.displayName).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.fg).lineLimit(1)
                Text(item.detail).font(.system(size: 13)).monospacedDigit().foregroundStyle(Color.muted)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 0) {
                (Text("\(Int(item.protein.rounded()))").font(.num(17)) + Text(" g").font(.system(size: 13, weight: .semibold)).foregroundColor(.muted))
                    .foregroundStyle(item.countsToProtein ? Color.fg : Color.muted)
                if !item.countsToProtein {
                    Text("not counted").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.muted)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

struct PlusDisc: View {
    var body: some View {
        Image(systemName: "plus")
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(Color.fg)
            .frame(width: 40, height: 40)
            .background(Color.surface2, in: Circle())
    }
}

/// The web's press feedback (a[href]:active scale), for custom rows.
struct PressStyle: ButtonStyle {
    var scale: CGFloat = 0.97
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: Add button

/// The way in, always in reach above the tab bar: one button. It opens the log
/// sheet on the mode used last; each meal's + opens it for that meal.
struct AddFoodButton: View {
    let open: () -> Void

    var body: some View {
        HStack {
            Spacer()
            Button {
                Haptics.tick()
                open()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "plus").font(.system(size: 17, weight: .heavy))
                    Text("Add food").font(.system(size: 17, weight: .heavy))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 22)
                .frame(height: 56)
                .background(Color.coral, in: Capsule())
                .shadow(color: Color.fg.opacity(0.18), radius: 14, y: 8)
            }
            .buttonStyle(PressStyle())
        }
        .padding(.horizontal, 16)
        .background(alignment: .bottom) {
            // Content fades out under the button and the tab bar.
            LinearGradient(stops: [.init(color: .bg.opacity(0), location: 0), .init(color: .bg, location: 0.45)], startPoint: .top, endPoint: .bottom)
                .frame(height: 180)
                .offset(y: 96)
                .allowsHitTesting(false)
        }
    }
}

/// Supplements on the food tab: one line that opens the next slot due.
struct SupplementsLine: View {
    let day: TodaySlots
    let open: (TodaySlots.Slot) -> Void

    var body: some View {
        let items = day.slots.flatMap(\.items)
        let done = items.filter(\.isDone).count
        let next = day.slots.first { $0.items.contains { !$0.isDone } }
        Button {
            Haptics.tick()
            if let slot = next ?? day.slots.first { open(slot) }
        } label: {
            HStack(spacing: 12) {
                Circle().fill(done == items.count ? Color.coral : Color.surface3).frame(width: 10, height: 10)
                Text("Supplements").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.fg)
                Spacer(minLength: 8)
                Text(done == items.count ? "All taken" : "\(done) of \(items.count) taken\(next.map { " · next \($0.label)" } ?? "")")
                    .font(.system(size: 13)).monospacedDigit().foregroundStyle(Color.muted).lineLimit(1)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.faint)
            }
            .padding(.horizontal, 16)
            .frame(height: 56)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(PressStyle(scale: 0.98))
        .accessibilityLabel("Supplements, \(done) of \(items.count) taken")
    }
}
