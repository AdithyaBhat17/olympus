import OlympusCore
import SwiftUI

/// −10 / grams / +10, the web's Stepper. Snaps to 5 g.
struct GramStepper: View {
    @Binding var grams: Double
    let label: String
    @FocusState private var typing: Bool

    var body: some View {
        HStack(spacing: 0) {
            step(-10, "minus", "10 grams less")
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                TextField("0", value: $grams, format: .number.precision(.fractionLength(0)))
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.center)
                    .font(.num(17))
                    .frame(width: 48)
                    .focused($typing)
                    .accessibilityLabel("Grams of \(label)")
                Text("g").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.muted)
            }
            step(10, "plus", "10 grams more")
        }
        .frame(height: 44)
        .background(Color.bg, in: Capsule())
        .toolbar {
            if typing {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { typing = false }.fontWeight(.bold)
                }
            }
        }
    }

    private func step(_ d: Double, _ icon: String, _ a11y: String) -> some View {
        Button {
            Haptics.tick()
            grams = max(5, ((grams + d) / 5).rounded() * 5)
        } label: {
            Image(systemName: icon).font(.system(size: 14, weight: .heavy)).foregroundStyle(Color.fg2).frame(width: 44, height: 44)
        }
        .buttonRepeatBehavior(.enabled)
        .accessibilityLabel(a11y)
    }
}

/// Edit a logged item's grams, or delete it.
struct FoodItemSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let item: DayLogItem
    let changed: () -> Void
    @State private var grams: Double = 0
    @State private var busy = false

    private struct Grams: Encodable { let grams: Double }

    var body: some View {
        let base = item.grams ?? 1
        let f = grams / base
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name).font(.system(size: 22, weight: .heavy)).foregroundStyle(Color.fg)
                (Text("\(Int((item.protein * f).rounded())) g protein").foregroundColor(.coral).bold() + Text(" · \(Int((item.kcal * f).rounded())) kcal"))
                    .font(.system(size: 15))
                    .monospacedDigit()
                    .foregroundStyle(Color.muted)
                    .contentTransition(.numericText())
            }
            HStack {
                GramStepper(grams: $grams, label: item.name)
                Spacer()
                Button(role: .destructive) {
                    busy = true
                    Task {
                        defer { busy = false }
                        do {
                            try await model.api.delete("food/items/\(item.id)")
                            changed()
                            dismiss()
                        } catch { model.show(error) }
                    }
                } label: {
                    Image(systemName: "trash").font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.danger).frame(width: 48, height: 48).background(Color.surface, in: Circle())
                }
                .accessibilityLabel("Delete \(item.name)")
            }
            Button("Save") {
                busy = true
                Task {
                    defer { busy = false }
                    do {
                        try await model.api.send("PATCH", "food/items/\(item.id)", body: API.encoder.encode(Grams(grams: grams)))
                        changed()
                        dismiss()
                    } catch { model.show(error) }
                }
            }
            .buttonStyle(PrimaryButtonStyle(tint: .fg))
            .disabled(busy || grams <= 0 || grams == item.grams)
            .opacity(grams == item.grams ? 0.4 : 1)
        }
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 12)
        .animation(.snappy, value: grams)
        .onAppear { grams = item.grams ?? 0 }
        .fittedSheet()
    }
}

/// One food in the basket, waiting to be added.
struct BasketItem: Identifiable {
    let id = UUID()
    var food: FoodSummary
    var grams: Double
    var portions: [Portion] = []
    var said: String?
    var estGrams: Double?
    var confidence: Double?
    var basis: String?
    var alternatives: [FoodSummary] = []
    /// "HH:mm" from a describe; logged as its own meal at that time.
    var time: String?

    var protein: Double { food.protein(grams) }
    var countedProtein: Double { food.isCollagen ? 0 : protein }
    var kcal: Double { food.kcal(grams) }
}

/// A supplement named in a describe ("at 9:30 thyroid tablet"): logged as a dose.
struct DescribedDose: Identifiable {
    let id = UUID()
    var supplement: DraftSupplement
    var time: String?
}

/// Find foods, then review the amounts and log. The web's LogSheet: two steps,
/// so results never share a screen with the basket.
struct FoodLogSheet: View {
    enum Mode: String, CaseIterable, Identifiable {
        case search, describe, barcode
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
        var icon: String {
            switch self {
            case .search: "magnifyingglass"
            case .describe: "sparkle"
            case .barcode: "barcode.viewfinder"
            }
        }
    }

    enum Step { case find, review }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// The sheet opens on the mode used last.
    @AppStorage("food.lastMode") private var lastMode = Mode.search.rawValue
    let date: String
    let isToday: Bool
    @State var meal: Meal
    @State var mode: Mode
    var initialText: String?
    let logged: () -> Void

    @State private var step = Step.find
    @State private var basket: [BasketItem] = []
    @State private var doses: [DescribedDose] = []
    @State private var draft: (text: String, model: String, cost: Double?, ids: [String])?
    @State private var fromSaved = false
    @State private var time = Date()
    @State private var saving = false

    init(date: String, isToday: Bool, meal: Meal, mode: Mode, initialText: String? = nil, logged: @escaping () -> Void) {
        self.date = date
        self.isToday = isToday
        self.initialText = initialText
        _meal = State(initialValue: meal)
        _mode = State(initialValue: mode)
        self.logged = logged
    }

    private var protein: Double { basket.reduce(0) { $0 + $1.countedProtein } }
    private var isEmpty: Bool { basket.isEmpty && doses.isEmpty }
    private var kcal: Double { basket.reduce(0) { $0 + $1.kcal } }
    private var reviewing: Bool { step == .review && !isEmpty }

    var body: some View {
        ZStack {
            // Stays mounted while reviewing, so "back" returns to the same search.
            findStep.accessibilityHidden(reviewing)
            if reviewing {
                reviewStep.transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .background(Color.bg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) { if !isEmpty { actionBar } }
        .animation(.snappy(duration: 0.28), value: reviewing)
        .onChange(of: mode) { _, m in lastMode = m.rawValue }
        .onChange(of: isEmpty) { _, empty in if empty { step = .find } }
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(40)
        .interactiveDismissDisabled(!isEmpty)
    }

    // MARK: Find

    private var findStep: some View {
        VStack(spacing: 0) {
            HStack {
                circleButton("xmark", "Close") { dismiss() }
                Spacer()
                Text("Add to \(meal.pickerLabel)").font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.fg)
                Spacer()
                Color.clear.frame(width: 44, height: 44)
            }
            .padding(.horizontal, 16)
            .padding(.top, 20)
            .padding(.bottom, 12)
            modePicker
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch mode {
                    case .search: SearchPane(onPick: { add($0, grams: $1) }, onPickMeal: add(meal:))
                    case .describe: DescribePane(onDraft: add(draft:text:), initialText: initialText)
                    case .barcode: BarcodePane(onFound: { add($0) })
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var modePicker: some View {
        HStack(spacing: 8) {
            ForEach(Mode.allCases) { m in
                Button {
                    Haptics.tick()
                    withAnimation(.snappy(duration: 0.2)) { mode = m }
                } label: {
                    Label(m.label, systemImage: m.icon)
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(mode == m ? Color.bg : Color.fg)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(mode == m ? Color.fg : Color.surface, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(mode == m ? .isSelected : [])
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
    }

    // MARK: Review

    private var reviewStep: some View {
        VStack(spacing: 0) {
            HStack {
                circleButton("chevron.left", "Back to adding food") { step = .find }
                Spacer()
                Text("Review").font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.fg)
                Spacer()
                Color.clear.frame(width: 44, height: 44)
            }
            .padding(.horizontal, 16)
            .padding(.top, 20)
            .padding(.bottom, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    mealChips
                    basketSection
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.bg.ignoresSafeArea())
    }

    private var mealChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Meal.allCases) { m in
                    Button {
                        Haptics.tick()
                        meal = m
                    } label: {
                        Text(m.pickerLabel)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(meal == m ? Color.bg : Color.fg2)
                            .padding(.horizontal, 16)
                            .frame(height: 40)
                            .background(meal == m ? Color.fg : Color.surface, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(meal == m ? .isSelected : [])
                }
            }
        }
    }

    private var basketSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Check the amounts").font(.system(size: 22, weight: .heavy)).foregroundStyle(Color.fg)
                Spacer()
                (Text("\(Int(protein.rounded())) g").font(.num(15)).foregroundColor(.coral) + Text(" · \(Int(kcal.rounded())) kcal").font(.system(size: 13)).foregroundColor(.muted))
                    .monospacedDigit()
            }
            ForEach(doses) { d in
                DoseRow(dose: d) { withAnimation(.snappy) { doses.removeAll { $0.id == d.id } } }
            }
            ForEach($basket) { $item in
                BasketCard(item: $item) { basket.removeAll { $0.id == item.id } }
            }
            if basket.contains(where: { $0.food.isCollagen }) {
                Text("Collagen protein isn't counted toward your protein target.").font(.system(size: 13)).foregroundStyle(Color.muted)
            }
            if !isToday && basket.contains(where: { $0.time == nil }) {
                HStack {
                    Text("Time eaten").font(.system(size: 16, weight: .semibold))
                    Spacer()
                    DatePicker("Time eaten", selection: $time, displayedComponents: .hourAndMinute).labelsHidden()
                }
                .padding(.horizontal, 20)
                .frame(height: 56)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            if basket.count > 1 { SaveMealButton(items: basket) }
        }
    }

    // MARK: Bar

    private var actionBar: some View {
        Button {
            if reviewing { save() } else {
                Haptics.tick()
                step = .review
            }
        } label: {
            Text(actionLabel)
                .font(.system(size: 17, weight: .heavy))
                .monospacedDigit()
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(Color.coral, in: Capsule())
                .contentTransition(.numericText())
        }
        .disabled(saving)
        .opacity(saving ? 0.6 : 1)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(Color.bg)
        .animation(.snappy, value: kcal)
    }

    private var actionLabel: String {
        if reviewing {
            if saving { return "Adding…" }
            return basket.isEmpty ? "Log" : "Log \(Int(kcal.rounded())) kcal · \(Int(protein.rounded())) g protein"
        }
        return "Review \(basket.count + doses.count) · \(Int(kcal.rounded())) kcal"
    }

    private func circleButton(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.fg).frame(width: 44, height: 44).background(Color.surface2, in: Circle())
        }
        .accessibilityLabel(label)
    }

    // MARK: Basket

    private func add(_ food: FoodSummary, grams: Double? = nil) {
        Haptics.tick()
        let item = BasketItem(food: food, grams: grams ?? food.servingG ?? 100)
        withAnimation(.snappy) { basket.append(item) }
        Task {
            guard let r = try? await model.api.get("food/foods/\(food.id)", as: FoodPortions.self) else { return }
            if let i = basket.firstIndex(where: { $0.id == item.id }) { basket[i].portions = r.portions.filter(\.isUsable) }
        }
    }

    private func add(meal: SavedMeal) {
        Haptics.tick()
        withAnimation(.snappy) { basket += meal.items.map { BasketItem(food: $0.food, grams: $0.grams) } }
        fromSaved = true
    }

    private func add(draft d: TextDraft, text: String) {
        let items = d.items.compactMap { i -> BasketItem? in
            guard let m = i.match, i.supplement == nil else { return nil }
            return BasketItem(food: m.food, grams: i.grams, portions: m.portions.filter(\.isUsable), said: i.said, estGrams: i.estGrams, confidence: i.confidence, basis: i.basis, alternatives: i.alternatives, time: i.time)
        }
        let named = d.items.compactMap { i in i.supplement.map { DescribedDose(supplement: $0, time: i.time) } }
        withAnimation(.snappy) {
            doses += named.filter { n in !doses.contains { $0.supplement.id == n.supplement.id } }
            basket += items
        }
        // Several describes in one sheet: keep every draft id so each is scored.
        draft = (
            draft.map { "\($0.text); \(text)" } ?? text,
            d.model,
            (draft?.cost ?? 0) + (d.costUsd ?? 0),
            (draft?.ids ?? []) + (d.draftId.map { [$0] } ?? [])
        )
        if !items.isEmpty || !named.isEmpty { withAnimation(.snappy) { step = .review } }
        let missed = d.items.filter { $0.match == nil && $0.supplement == nil }.map(\.said)
        if !missed.isEmpty {
            model.show("No match for \(missed.joined(separator: ", ")). Search for \(missed.count > 1 ? "them" : "it") instead.", kind: .error)
        }
    }

    private func save() {
        saving = true
        let hhmm = time.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
        let inputMode = draft != nil ? "text" : fromSaved ? "saved" : basket.count == 1 && mode == .barcode ? "barcode" : "search"
        let body = NewFoodLog(
            meal: meal,
            date: isToday ? nil : date,
            time: isToday ? nil : hhmm,
            inputMode: inputMode,
            rawText: draft?.text,
            model: draft?.model,
            costUsd: draft?.cost,
            draftIds: draft?.ids,
            items: basket.map { .init(foodId: $0.food.id, grams: $0.grams, estGrams: $0.estGrams, confidence: $0.confidence, time: $0.time) },
            doses: doses.isEmpty ? nil : doses.map { .init(supplementId: $0.supplement.id, time: $0.time) }
        )
        let food = basket.isEmpty ? nil : "\(Int(kcal.rounded())) kcal, \(Int(protein.rounded())) g protein"
        let supps = doses.isEmpty ? nil : doses.map(\.supplement.name).joined(separator: ", ")
        let summary = "Logged " + [food, supps].compactMap { $0 }.joined(separator: " and ")
        Task {
            defer { saving = false }
            do {
                let r = try await model.api.post("food/logs", body, as: LoggedFood.self)
                Haptics.restEnd()
                model.show(r.nudges.first ?? summary)
                logged()
                dismiss()
            } catch { model.show(error) }
        }
    }
}

/// A supplement from the describe text: name, when, and remove.
private struct DoseRow: View {
    let dose: DescribedDose
    let remove: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "pills.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.coral)
                .frame(width: 40, height: 40)
                .background(Color.coral.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(dose.supplement.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.fg)
                // The time first, like the food cards: it's what decides the timing notes.
                HStack(spacing: 6) {
                    Text(dose.time.map { "At \($0)" } ?? "Now")
                        .font(.system(size: 12, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Color.bg)
                        .padding(.horizontal, 8)
                        .frame(height: 22)
                        .background(Color.fg, in: Capsule())
                    Text(dose.supplement.servingDesc)
                        .font(.system(size: 13))
                        .foregroundStyle(Color.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Button {
                Haptics.tick()
                remove()
            } label: {
                Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.fg2).frame(width: 44, height: 44)
            }
            .accessibilityLabel("Don't log \(dose.supplement.name)")
        }
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .padding(.vertical, 8)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct BasketCard: View {
    @Environment(AppModel.self) private var model
    @Binding var item: BasketItem
    let remove: () -> Void
    @State private var swapping = false

    private static let basis = ["stated": "Amount you said", "usual": "Your usual amount", "portion": "Standard portion", "estimate": "Estimated amount"]

    private struct Fav: Encodable { let foodId: String; let on: Bool }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    if let said = item.said, said.lowercased() != item.food.name.lowercased() {
                        Text("You said “\(said)”").font(.system(size: 13)).foregroundStyle(Color.muted).lineLimit(1)
                    }
                    (Text(item.food.name).font(.system(size: 16, weight: .semibold)).foregroundColor(.fg)
                        + Text(item.food.brand.map { " · \($0)" } ?? "").font(.system(size: 16)).foregroundColor(.muted))
                    HStack(spacing: 6) {
                        if let t = item.time { tag("At \(t)", fg: .bg, bg: .fg) }
                        tag(item.food.sourceShort)
                        // A web food shows the page its numbers came from.
                        if item.food.source == "web", let url = item.food.sourceUrl.flatMap(URL.init(string:)), let h = item.food.sourceHost {
                            Link(h, destination: url).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.coral).lineLimit(1)
                        }
                        if !item.food.verified { tag("Unverified", fg: .dangerInk, bg: Color.danger.opacity(0.1)) }
                        if let c = item.confidence, c < 0.6 {
                            tag("Check the amount", fg: .apricotInk, bg: .apricot)
                        } else if let b = item.basis.flatMap({ Self.basis[$0] }) {
                            Text(b).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.muted)
                        }
                    }
                    .padding(.top, 2)
                }
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 2) {
                    (Text("\(Int(item.protein.rounded()))").font(.num(22)) + Text(" g").font(.system(size: 13, weight: .bold)))
                        .foregroundStyle(Color.coral)
                        .contentTransition(.numericText())
                    Text("\(Int(item.kcal.rounded())) kcal").font(.system(size: 13)).monospacedDigit().foregroundStyle(Color.muted)
                }
            }

            HStack(spacing: 8) {
                GramStepper(grams: $item.grams, label: item.food.name)
                ScrollView(.horizontal) {
                    HStack(spacing: 6) {
                        ForEach(item.portions.prefix(5), id: \.label) { p in
                            let on = Int(p.grams.rounded()) == Int(item.grams.rounded())
                            Button {
                                Haptics.tick()
                                item.grams = p.grams
                            } label: {
                                (Text(p.label).font(.system(size: 13, weight: .semibold))
                                    + Text(" \(Int(p.grams.rounded())) g").font(.system(size: 13, weight: .medium)).foregroundColor(on ? .bg.opacity(0.6) : .faint))
                                    .foregroundStyle(on ? Color.bg : Color.fg2)
                                    .padding(.horizontal, 12)
                                    .frame(height: 36)
                                    .background(on ? Color.fg : Color.bg, in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }

            HStack(spacing: 4) {
                if !item.alternatives.isEmpty {
                    textButton(swapping ? "Keep this" : "Not this?") { withAnimation(.snappy) { swapping.toggle() } }
                }
                Button {
                    Haptics.tick()
                    let on = !item.food.favourite
                    item.food.favourite = on
                    Task {
                        do { try await model.api.post("food/favourites", Fav(foodId: item.food.id, on: on)) } catch {
                            item.food.favourite = !on
                            model.show(error)
                        }
                    }
                } label: {
                    Label("Favourite", systemImage: item.food.favourite ? "star.fill" : "star")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(item.food.favourite ? Color.coral : Color.fg2)
                        .padding(.horizontal, 10)
                        .frame(height: 36)
                }
                Spacer()
                textButton("Remove", color: .danger, action: remove)
            }
            .padding(.horizontal, -4)

            if swapping {
                VStack(spacing: 6) {
                    ForEach(item.alternatives) { a in
                        Button {
                            Haptics.tick()
                            let previous = item.food
                            item.food = a
                            item.alternatives = [previous] + item.alternatives.filter { $0.id != a.id }
                            item.basis = nil
                            item.portions = []
                            withAnimation(.snappy) { swapping = false }
                            Task {
                                if let r = try? await model.api.get("food/foods/\(a.id)", as: FoodPortions.self) { item.portions = r.portions.filter(\.isUsable) }
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.fg)
                                Text("\(a.sourceShort) · \(Int((a.protein100g ?? 0).rounded())) g protein, \(Int(a.kcal100g.rounded())) kcal per 100 g")
                                    .font(.system(size: 13)).foregroundStyle(Color.muted)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(Color.bg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .buttonStyle(PressStyle(scale: 0.98))
                    }
                }
                .transition(.opacity)
            }
        }
        .padding(16)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .animation(.snappy, value: item.grams)
    }

    private func tag(_ text: String, fg: Color = .fg2, bg: Color = .surface3) -> some View {
        Text(text).font(.system(size: 12, weight: .bold)).foregroundStyle(fg).padding(.horizontal, 8).frame(height: 22).background(bg, in: Capsule())
    }

    private func textButton(_ title: String, color: Color = .fg2, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(color).padding(.horizontal, 10).frame(height: 36)
        }
    }
}

private struct SaveMealButton: View {
    @Environment(AppModel.self) private var model
    let items: [BasketItem]
    @State private var naming = false
    @State private var name = ""

    private struct Payload: Encodable {
        struct Item: Encodable { let foodId: String; let grams: Double }
        let name: String
        let items: [Item]
    }

    var body: some View {
        Button("Save these as a meal") { naming = true }
            .buttonStyle(SecondaryButtonStyle())
            .alert("Name this meal", isPresented: $naming) {
                TextField("Usual breakfast", text: $name)
                Button("Save") {
                    let n = name.trimmingCharacters(in: .whitespaces)
                    guard !n.isEmpty else { return }
                    Task {
                        do {
                            try await model.api.post("food/meals", Payload(name: n, items: items.map { .init(foodId: $0.food.id, grams: $0.grams) }))
                            model.show("Saved “\(n)”")
                        } catch { model.show(error) }
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
    }
}

// MARK: Panes

private struct DescribePane: View {
    @Environment(AppModel.self) private var model
    let onDraft: (TextDraft, String) -> Void
    /// From olympus://food/log?text=…: filled in and read straight away (nothing is logged until Add).
    var initialText: String?
    @State private var text = ""
    @State private var reading = false
    @FocusState private var focused: Bool

    private struct Payload: Encodable { let text: String }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 8) {
                TextField("2 rotis and dal, at 4 coffee with milk", text: $text, axis: .vertical)
                    .font(.system(size: 17))
                    .lineLimit(3...6)
                    .focused($focused)
                    .submitLabel(.go)
                    .onSubmit(find)
                    .padding(.horizontal, 14)
                    .padding(.top, 14)
                HStack {
                    Text("Say amounts and times if you know them").font(.system(size: 13)).foregroundStyle(Color.muted)
                    Spacer()
                    Button(action: find) {
                        Group {
                            if reading { ProgressView().tint(Color.bg) } else { Label("Find foods", systemImage: "sparkle") }
                        }
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Color.bg)
                        .padding(.horizontal, 18)
                        .frame(minWidth: 120, minHeight: 44)
                        .background(Color.fg, in: Capsule())
                    }
                    .disabled(reading || text.trimmingCharacters(in: .whitespaces).count < 2)
                    .opacity(text.trimmingCharacters(in: .whitespaces).count < 2 ? 0.3 : 1)
                }
                .padding(.leading, 14)
                .padding([.trailing, .bottom], 6)
            }
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(focused ? Color.coral : .clear, lineWidth: 2.5))
            .task {
                if let t = initialText, text.isEmpty {
                    text = t
                    find()
                }
            }

            Text("Nutrients come from the food database. The AI only reads what you ate and estimates grams, so check the amounts before adding.")
                .font(.system(size: 13))
                .foregroundStyle(Color.muted)
                .padding(.horizontal, 4)
        }
        .onAppear { focused = true }
    }

    private func find() {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard t.count >= 2, !reading else { return }
        reading = true
        Task {
            defer { reading = false }
            do {
                let d = try await model.api.post("food/draft", Payload(text: t), as: TextDraft.self)
                onDraft(d, t)
                text = ""
                focused = false
            } catch { model.show(error) }
        }
    }
}

// MARK: Search

/// One way to measure a food: g, ml (when the food has a volume portion), or a portion ("1 roti" → roti).
private struct UnitOption: Hashable {
    let label: String
    /// Grams in one of this unit.
    let per: Double
}

/// Grams per ml from the first volume portion the food has (a cup, a tablespoon...), as the server does.
private func density(_ portions: [Portion]) -> Double? {
    let volumes: [(String, Double)] = [("cup", 236.588), ("fl oz", 29.5735), ("fluid oz", 29.5735), ("tablespoon", 14.7868), ("teaspoon", 4.92892)]
    for (word, ml) in volumes {
        if let p = portions.first(where: { $0.label.lowercased().trimmingCharacters(in: .whitespaces).hasPrefix("1 \(word)") }) {
            let d = p.grams / ml
            if d >= 0.2 && d <= 1.6 { return d }
        }
    }
    return nil
}

private func unitOptions(_ portions: [Portion]) -> [UnitOption] {
    var out = [UnitOption(label: "g", per: 1)]
    if let d = density(portions) { out.append(UnitOption(label: "ml", per: d)) }
    for p in portions where p.isUsable {
        var n = 1.0
        var label = p.label.trimmingCharacters(in: .whitespaces)
        let parts = label.split(separator: " ", maxSplits: 1).map(String.init)
        if parts.count == 2, let q = Double(parts[0]) {
            n = q
            label = parts[1]
        }
        if n > 0, !label.isEmpty, !out.contains(where: { $0.label == label }) {
            out.append(UnitOption(label: label, per: p.grams / n))
        }
    }
    return out
}

/// Set the amount before adding, as in MyFitnessPal: a number, a unit, and what it comes to.
private struct AmountEditor: View {
    @Environment(AppModel.self) private var model
    let food: FoodSummary
    let add: (Double) -> Void
    @State private var options = [UnitOption(label: "g", per: 1)]
    @State private var unit = "g"
    @State private var qty: Double
    @FocusState private var typing: Bool

    init(food: FoodSummary, add: @escaping (Double) -> Void) {
        self.food = food
        self.add = add
        _qty = State(initialValue: food.servingG ?? 100)
    }

    private var per: Double { options.first { $0.label == unit }?.per ?? 1 }
    private var grams: Double { (qty * per * 10).rounded() / 10 }

    /// Changing the unit keeps the weight the same.
    private var unitBinding: Binding<String> {
        Binding(
            get: { unit },
            set: { u in
                guard let next = options.first(where: { $0.label == u }) else { return }
                qty = ((grams / next.per) * 10).rounded() / 10
                unit = u
            }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                TextField("0", value: $qty, format: .number.precision(.fractionLength(0...1)))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .font(.num(17))
                    .frame(width: 84, height: 44)
                    .background(Color.bg, in: Capsule())
                    .focused($typing)
                    .accessibilityLabel("Amount of \(food.name)")
                Menu {
                    Picker("Unit", selection: unitBinding) {
                        ForEach(options, id: \.label) { Text($0.label).tag($0.label) }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(unit).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .bold))
                    }
                    .foregroundStyle(Color.fg)
                    .padding(.horizontal, 14)
                    .frame(maxWidth: 170, minHeight: 44, maxHeight: 44)
                    .background(Color.bg, in: Capsule())
                }
                .accessibilityLabel("Unit, \(unit)")
                if unit != "g" {
                    Text("= \(Int(grams.rounded())) g").font(.system(size: 13)).monospacedDigit().foregroundStyle(Color.muted)
                }
                Spacer(minLength: 0)
            }
            HStack {
                (Text("\(Int(food.protein(grams).rounded())) g").font(.num(17)).foregroundColor(.coral) + Text(" protein · \(Int(food.kcal(grams).rounded())) kcal").font(.system(size: 13)).foregroundColor(.muted))
                    .monospacedDigit()
                Spacer()
                Button {
                    typing = false
                    add(grams)
                } label: {
                    Text("Add")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Color.bg)
                        .padding(.horizontal, 22)
                        .frame(height: 44)
                        .background(Color.fg, in: Capsule())
                }
                .disabled(grams <= 0)
                .opacity(grams <= 0 ? 0.4 : 1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
        .toolbar {
            if typing {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { typing = false }.fontWeight(.bold)
                }
            }
        }
        .task {
            guard let r = try? await model.api.get("food/foods/\(food.id)", as: FoodPortions.self) else { return }
            let o = unitOptions(r.portions)
            options = o
            // Start on the portion that is the food's own serving ("1 roti" for roti); otherwise grams.
            if let serving = food.servingG, let match = o.first(where: { $0.label != "g" && $0.label != "ml" && abs($0.per - serving) < 0.5 }) {
                unit = match.label
                qty = 1
            }
        }
    }
}

/// Tap a row to set its amount; the + adds it at the usual amount.
private struct FoodRows: View {
    let foods: [FoodSummary]
    let pick: (FoodSummary, Double?) -> Void
    @State private var open: String?
    @State private var added: Set<String> = []

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(foods.enumerated()), id: \.element.id) { i, f in
                if i > 0 { Rectangle().fill(Color.surface3).frame(height: 1) }
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        Button {
                            Haptics.tick()
                            withAnimation(.snappy) { open = open == f.id ? nil : f.id }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                (Text(f.favourite ? "★ " : "").foregroundColor(.coral) + Text(f.name).foregroundColor(.fg) + Text(f.brand.map { " · \($0)" } ?? "").foregroundColor(.muted))
                                    .font(.system(size: 16, weight: .semibold))
                                    .lineLimit(1)
                                Text("\(f.protein100g.map { "\(Int($0.rounded())) g protein" } ?? "Protein unknown") · \(Int(f.kcal100g.rounded())) kcal per 100 g · \(f.sourceLabel)")
                                    .font(.system(size: 13))
                                    .monospacedDigit()
                                    .foregroundStyle(Color.muted)
                                    .lineLimit(1)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.leading, 16)
                            .padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(PressStyle(scale: 0.98))
                        .accessibilityHint("Set the amount")
                        Button {
                            Haptics.tick()
                            pick(f, nil)
                            added.insert(f.id)
                        } label: {
                            Image(systemName: added.contains(f.id) ? "checkmark" : "plus")
                                .font(.system(size: 14, weight: .heavy))
                                .foregroundStyle(added.contains(f.id) ? Color.bg : Color.fg)
                                .frame(width: 40, height: 40)
                                .background(added.contains(f.id) ? Color.fg : Color.bg, in: Circle())
                        }
                        .padding(.horizontal, 8)
                        .accessibilityLabel(added.contains(f.id) ? "\(f.name) added" : "Add \(f.name)")
                    }
                    if open == f.id {
                        AmountEditor(food: f) { g in
                            Haptics.tick()
                            pick(f, g)
                            added.insert(f.id)
                            withAnimation(.snappy) { open = nil }
                        }
                        .transition(.opacity)
                    }
                }
            }
        }
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct SearchPane: View {
    @Environment(AppModel.self) private var model
    let onPick: (FoodSummary, Double?) -> Void
    let onPickMeal: (SavedMeal) -> Void
    @State private var q = ""
    @State private var results: [FoodSummary] = []
    @State private var searched = ""
    @State private var quick: QuickFoods?
    @State private var view = QuickView.recent
    @State private var web: (q: String, state: WebState)?
    @FocusState private var focused: Bool

    enum QuickView: String, CaseIterable, Identifiable {
        case recent = "Recent", frequent = "Frequent", favourites = "Favourites", meals = "Meals"
        var id: String { rawValue }
    }
    enum WebState { case loading, none }
    private struct WebPayload: Encodable { let query: String }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.muted)
                TextField("Foods, recipes, brands", text: $q)
                    .font(.system(size: 17))
                    .focused($focused)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                if !q.isEmpty {
                    Button { q = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Color.faint) }
                        .accessibilityLabel("Clear")
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 48)
            .background(Color.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(focused ? Color.coral : .clear, lineWidth: 2.5))

            let term = q.trimmingCharacters(in: .whitespaces)
            if term.count >= 2 {
                webRow(term)
                if results.isEmpty {
                    if searched != term {
                        Text("Searching…").font(.system(size: 15)).foregroundStyle(Color.muted).padding(.horizontal, 4)
                    }
                } else {
                    FoodRows(foods: results, pick: onPick)
                }
            } else if let quick {
                chips
                switch view {
                case .recent:
                    if quick.recent.isEmpty { hint("Foods you log show up here.") } else { FoodRows(foods: quick.recent, pick: onPick) }
                case .frequent:
                    if (quick.frequent ?? []).isEmpty { hint("Foods you log twice or more show up here, most often first.") } else { FoodRows(foods: quick.frequent ?? [], pick: onPick) }
                case .favourites:
                    if quick.favourites.isEmpty { hint("Star a food when you check its amount to keep it here.") } else { FoodRows(foods: quick.favourites, pick: onPick) }
                case .meals:
                    if quick.meals.isEmpty { hint("Save a few foods as a meal when you review them.") } else { mealRows(quick.meals) }
                }
            }
        }
        .task { quick = try? await model.api.get("food/quick", as: QuickFoods.self) }
        .task(id: q) {
            web = nil
            let term = q.trimmingCharacters(in: .whitespaces)
            guard term.count >= 2 else { results = []; return }
            try? await Task.sleep(for: .milliseconds(220))
            guard !Task.isCancelled else { return }
            if let r = try? await model.api.get("food/search", query: ["q": term], as: FoodSearchResult.self) {
                results = r.foods
                searched = term
            }
        }
        .onAppear { focused = true }
    }

    private var chips: some View {
        HStack(spacing: 8) {
            ForEach(QuickView.allCases) { v in
                Button {
                    Haptics.tick()
                    view = v
                } label: {
                    Text(v.rawValue)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(view == v ? Color.bg : Color.fg2)
                        .padding(.horizontal, 16)
                        .frame(height: 40)
                        .background(view == v ? Color.fg : Color.surface, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(view == v ? .isSelected : [])
            }
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text).font(.system(size: 15)).foregroundStyle(Color.muted).padding(.horizontal, 4)
    }

    private func mealRows(_ meals: [SavedMeal]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(meals.enumerated()), id: \.element.id) { i, m in
                if i > 0 { Rectangle().fill(Color.surface3).frame(height: 1) }
                Button { onPickMeal(m) } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(m.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.fg)
                            Text("\(Int(m.protein.rounded())) g protein · \(Int(m.kcal.rounded())) kcal · \(m.items.map(\.food.name).joined(separator: ", "))")
                                .font(.system(size: 13)).foregroundStyle(Color.muted).lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        Image(systemName: "plus").font(.system(size: 14, weight: .heavy)).foregroundStyle(Color.fg).frame(width: 40, height: 40).background(Color.bg, in: Circle())
                    }
                    .padding(.leading, 16).padding(.trailing, 8).padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle(scale: 0.98))
            }
        }
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    /// Not in the database: look the label up on the web and save it for next time.
    @ViewBuilder private func webRow(_ term: String) -> some View {
        if let w = web, w.q == term, w.state == .loading {
            HStack(spacing: 12) {
                ProgressView()
                Text("Reading a nutrition label for \u{201C}\(term)\u{201D}…").font(.system(size: 15)).foregroundStyle(Color.muted)
            }
            .padding(.horizontal, 4)
            .accessibilityElement(children: .combine)
        } else if let w = web, w.q == term, w.state == .none {
            hint("No reliable label found. Try the brand and product name, or add it under My foods on the web.")
        } else if term.count >= 3, searched == term {
            if results.isEmpty {
                Button { searchWeb(term) } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "sparkle").foregroundStyle(Color.coral)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("No match. Search the web for \u{201C}\(term)\u{201D}")
                                .font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.fg).lineLimit(1)
                            Text("Looks it up on Open Food Facts, then the web, and saves it for next time").font(.system(size: 13)).foregroundStyle(Color.muted)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color.coral.opacity(0.1), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .buttonStyle(PressStyle(scale: 0.98))
            } else {
                // Results exist: a slim line, always in view under the search field, not buried below 25 rows.
                Button { searchWeb(term) } label: {
                    Label("Not finding it? Search the web for \u{201C}\(term)\u{201D}", systemImage: "sparkle")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Color.coral)
                        .lineLimit(1)
                        .padding(.horizontal, 4)
                        .frame(minHeight: 36)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func searchWeb(_ term: String) {
        web = (term, .loading)
        Task {
            do {
                let r = try await model.api.post("food/web", WebPayload(query: term), as: WebFoodResult.self)
                if let m = r.food {
                    Haptics.restEnd()
                    onPick(m.food, nil)
                    web = nil
                    let where_ = m.food.source == "off" ? "Open Food Facts" : (m.food.sourceHost ?? "the web")
                    model.show(r.cached ? "Added \(m.food.name)" : "Found on \(where_), saved for next time")
                } else {
                    web = (term, .none)
                }
            } catch {
                web = nil
                model.show(error)
            }
        }
    }
}

private struct BarcodePane: View {
    @Environment(AppModel.self) private var model
    let onFound: (FoodSummary) -> Void
    @State private var code = ""
    @State private var looking = false
    @State private var lastScanned: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if BarcodeScanner.isAvailable {
                BarcodeScanner { scanned in
                    guard scanned != lastScanned, !looking else { return }
                    lastScanned = scanned
                    lookUp(scanned)
                }
                .frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                .overlay {
                    if looking { ProgressView().tint(.white).scaleEffect(1.3) }
                }
                .accessibilityLabel("Camera: point it at a barcode")
            }
            HStack(spacing: 10) {
                Image(systemName: "barcode").foregroundStyle(Color.muted)
                TextField("EAN or UPC number", text: $code)
                    .keyboardType(.numberPad)
                    .font(.num(19, weight: .bold))
                    .onChange(of: code) { _, v in code = v.filter(\.isNumber) }
                Button("Look up") { lookUp(code) }
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.bg)
                    .padding(.horizontal, 16)
                    .frame(height: 40)
                    .background(Color.fg, in: Capsule())
                    .disabled(code.count < 8 || looking)
                    .opacity(code.count < 8 ? 0.3 : 1)
            }
            .padding(.leading, 14)
            .padding(.trailing, 4)
            .frame(height: 52)
            .background(Color.surface, in: Capsule())
            Text("Looked up on Open Food Facts, which covers Indian and UAE packaged foods.")
                .font(.system(size: 13)).foregroundStyle(Color.muted).padding(.horizontal, 4)
        }
    }

    private func lookUp(_ c: String) {
        looking = true
        Task {
            defer { looking = false }
            do {
                let f = try await model.api.get("food/barcode/\(c)", as: FoodSummary.self)
                Haptics.restEnd()
                onFound(f)
                code = ""
            } catch {
                model.show(error)
                lastScanned = nil
            }
        }
    }
}
