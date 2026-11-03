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

    var protein: Double { food.protein(grams) }
    var countedProtein: Double { food.isCollagen ? 0 : protein }
    var kcal: Double { food.kcal(grams) }
}

/// Describe, search or scan, then check the amounts and add. The web's LogSheet.
struct FoodLogSheet: View {
    enum Mode: String, CaseIterable, Identifiable {
        case describe, search, barcode
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
        var icon: String {
            switch self {
            case .describe: "sparkle"
            case .search: "magnifyingglass"
            case .barcode: "barcode.viewfinder"
            }
        }
    }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    let isToday: Bool
    @State var meal: Meal
    @State var mode: Mode
    let logged: () -> Void

    @State private var basket: [BasketItem] = []
    @State private var draft: (text: String, model: String, cost: Double?, ids: [String])?
    @State private var fromSaved = false
    @State private var time = Date()
    @State private var saving = false

    init(date: String, isToday: Bool, meal: Meal, mode: Mode, logged: @escaping () -> Void) {
        self.date = date
        self.isToday = isToday
        _meal = State(initialValue: meal)
        _mode = State(initialValue: mode)
        self.logged = logged
    }

    private var protein: Double { basket.reduce(0) { $0 + $1.countedProtein } }
    private var kcal: Double { basket.reduce(0) { $0 + $1.kcal } }

    var body: some View {
        VStack(spacing: 0) {
            header
            modePicker
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch mode {
                    case .describe: DescribePane(onDraft: add(draft:text:))
                    case .search: SearchPane(onPick: { add($0) }, onPickMeal: add(meal:))
                    case .barcode: BarcodePane(onFound: { add($0) })
                    }
                    if !basket.isEmpty { basketSection }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.bg.ignoresSafeArea())
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(40)
        .interactiveDismissDisabled(!basket.isEmpty)
    }

    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 16, weight: .bold)).foregroundStyle(Color.fg).frame(width: 44, height: 44).background(Color.surface2, in: Circle())
            }
            .accessibilityLabel("Close")
            Spacer()
            Menu {
                Picker("Meal", selection: $meal) {
                    ForEach(Meal.allCases) { Text($0.pickerLabel).tag($0) }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(meal.pickerLabel).font(.system(size: 17, weight: .heavy))
                    Image(systemName: "chevron.down").font(.system(size: 12, weight: .heavy)).foregroundStyle(Color.fg2)
                }
                .foregroundStyle(Color.fg)
                .padding(.horizontal, 16)
                .frame(height: 44)
                .background(Color.surface2, in: Capsule())
            }
            Spacer()
            Button(action: save) {
                Text(saving ? "Adding…" : basket.isEmpty ? "Add" : "Add \(Int(protein.rounded())) g")
                    .font(.system(size: 15, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(basket.isEmpty ? Color.faint : .white)
                    .padding(.horizontal, 16)
                    .frame(minWidth: 88, minHeight: 44)
                    .background(basket.isEmpty ? Color.surface2 : Color.coral, in: Capsule())
                    .contentTransition(.numericText())
            }
            .disabled(basket.isEmpty || saving)
            .animation(.snappy, value: protein)
        }
        .padding(.horizontal, 16)
        .padding(.top, 20)
        .padding(.bottom, 12)
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

    private var basketSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Check the amounts").font(.system(size: 22, weight: .heavy)).foregroundStyle(Color.fg)
                Spacer()
                (Text("\(Int(protein.rounded())) g").font(.num(15)).foregroundColor(.coral) + Text(" · \(Int(kcal.rounded())) kcal").font(.system(size: 13)).foregroundColor(.muted))
                    .monospacedDigit()
            }
            ForEach($basket) { $item in
                BasketCard(item: $item) { basket.removeAll { $0.id == item.id } }
            }
            if basket.contains(where: { $0.food.isCollagen }) {
                Text("Collagen protein isn't counted toward your protein target.").font(.system(size: 13)).foregroundStyle(Color.muted)
            }
            if !isToday {
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
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    // MARK: Basket

    private func add(_ food: FoodSummary, grams: Double? = nil) {
        Haptics.tick()
        let item = BasketItem(food: food, grams: grams ?? food.servingG ?? 100)
        withAnimation(.snappy) { basket.append(item) }
        Task {
            guard let r = try? await model.api.get("food/foods/\(food.id)", as: FoodPortions.self) else { return }
            if let i = basket.firstIndex(where: { $0.id == item.id }) { basket[i].portions = r.portions }
        }
    }

    private func add(meal: SavedMeal) {
        Haptics.tick()
        withAnimation(.snappy) { basket += meal.items.map { BasketItem(food: $0.food, grams: $0.grams) } }
        fromSaved = true
    }

    private func add(draft d: TextDraft, text: String) {
        let items = d.items.compactMap { i -> BasketItem? in
            guard let m = i.match else { return nil }
            return BasketItem(food: m.food, grams: i.grams, portions: m.portions, said: i.said, estGrams: i.estGrams, confidence: i.confidence, basis: i.basis, alternatives: i.alternatives)
        }
        withAnimation(.snappy) { basket += items }
        // Several describes in one sheet: keep every draft id so each is scored.
        draft = (
            draft.map { "\($0.text); \(text)" } ?? text,
            d.model,
            (draft?.cost ?? 0) + (d.costUsd ?? 0),
            (draft?.ids ?? []) + (d.draftId.map { [$0] } ?? [])
        )
        let missed = d.items.filter { $0.match == nil }.map(\.said)
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
            items: basket.map { .init(foodId: $0.food.id, grams: $0.grams, estGrams: $0.estGrams, confidence: $0.confidence) }
        )
        let summary = "Logged \(Int(kcal.rounded())) kcal, \(Int(protein.rounded())) g protein"
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
                        tag(item.food.sourceShort)
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
                                if let r = try? await model.api.get("food/foods/\(a.id)", as: FoodPortions.self) { item.portions = r.portions }
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
    @State private var text = ""
    @State private var reading = false
    @FocusState private var focused: Bool

    private struct Payload: Encodable { let text: String }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 8) {
                TextField("2 rotis, dal, 150 g chicken tikka, coffee with milk", text: $text, axis: .vertical)
                    .font(.system(size: 17))
                    .lineLimit(3...6)
                    .focused($focused)
                    .submitLabel(.go)
                    .onSubmit(find)
                    .padding(.horizontal, 14)
                    .padding(.top, 14)
                HStack {
                    Text("Say amounts if you know them").font(.system(size: 13)).foregroundStyle(Color.muted)
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

private struct FoodRows: View {
    let foods: [FoodSummary]
    let pick: (FoodSummary) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(foods.enumerated()), id: \.element.id) { i, f in
                if i > 0 { Rectangle().fill(Color.surface3).frame(height: 1) }
                Button { pick(f) } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            (Text(f.favourite ? "★ " : "").foregroundColor(.coral) + Text(f.name).foregroundColor(.fg) + Text(f.brand.map { " · \($0)" } ?? "").foregroundColor(.muted))
                                .font(.system(size: 16, weight: .semibold))
                                .lineLimit(1)
                            Text("\(f.protein100g.map { "\(Int($0.rounded())) g protein" } ?? "Protein unknown") · \(Int(f.kcal100g.rounded())) kcal per 100 g · \(f.sourceShort)")
                                .font(.system(size: 13))
                                .monospacedDigit()
                                .foregroundStyle(Color.muted)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        Image(systemName: "plus").font(.system(size: 14, weight: .heavy)).foregroundStyle(Color.fg).frame(width: 40, height: 40).background(Color.bg, in: Circle())
                    }
                    .padding(.leading, 16)
                    .padding(.trailing, 8)
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle(scale: 0.98))
            }
        }
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct SearchPane: View {
    @Environment(AppModel.self) private var model
    let onPick: (FoodSummary) -> Void
    let onPickMeal: (SavedMeal) -> Void
    @State private var q = ""
    @State private var results: [FoodSummary] = []
    @State private var searched = ""
    @State private var quick: QuickFoods?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
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
                if results.isEmpty {
                    Text(searched == term ? "No matches. Try another name, or add it under My foods on the web." : "Searching…")
                        .font(.system(size: 15)).foregroundStyle(Color.muted).padding(.horizontal, 4)
                } else {
                    FoodRows(foods: results, pick: onPick)
                }
            } else if let quick {
                if !quick.meals.isEmpty {
                    section("Saved meals") {
                        VStack(spacing: 0) {
                            ForEach(Array(quick.meals.enumerated()), id: \.element.id) { i, m in
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
                }
                if !quick.favourites.isEmpty { section("Favourites") { FoodRows(foods: quick.favourites, pick: onPick) } }
                if !quick.recent.isEmpty { section("Recent") { FoodRows(foods: quick.recent, pick: onPick) } }
            }
        }
        .task { quick = try? await model.api.get("food/quick", as: QuickFoods.self) }
        .task(id: q) {
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

    private func section(_ title: String, @ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(Color.muted).padding(.horizontal, 4)
            content()
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
