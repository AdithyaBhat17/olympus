import Foundation

// /api/v1/food and friends (src/server/food/screen.ts). Numbers arrive as
// JSON numbers, often fractional, so everything numeric is a Double.

enum Meal: String, Codable, CaseIterable, Identifiable, Sendable {
    case breakfast, lunch, dinner, snack
    var id: String { rawValue }
    var label: String {
        switch self {
        case .breakfast: "Breakfast"
        case .lunch: "Lunch"
        case .dinner: "Dinner"
        case .snack: "Snacks"
        }
    }
    /// Singular, for the log sheet's picker ("Snack").
    var pickerLabel: String { self == .snack ? "Snack" : label }
}

struct FoodScreen: Codable, Sendable {
    var date: String
    var today: String
    var isToday: Bool
    var defaultMeal: Meal
    var view: DayView
    var week: [WeekDay]
    var slots: TodaySlots
}

struct DayView: Codable, Sendable {
    struct Totals: Codable, Sendable {
        var kcal: Double
        var protein: Double
        var carbs: Double
        var fat: Double
        var fibre: Double
        var proteinCounted: Double
        var proteinExcluded: Double
    }
    struct Remaining: Codable, Sendable {
        var kcal: Double?
        var protein: Double?
    }
    struct Targets: Codable, Sendable {
        var kcal: Double?
        var protein: Double?
    }
    struct MealTotals: Codable, Sendable {
        var kcal: Double
        var protein: Double
    }

    var date: String
    var logs: [DayLog]
    var byMeal: [String: MealTotals]
    var totals: Totals
    var remaining: Remaining
    var targets: Targets

    func totals(for meal: Meal) -> MealTotals { byMeal[meal.rawValue] ?? .init(kcal: 0, protein: 0) }
}

struct DayLog: Codable, Identifiable, Sendable {
    struct Totals: Codable, Sendable {
        var kcal: Double
        var protein: Double
    }
    var id: String
    var meal: Meal
    var eatenAt: String
    var time: String
    var inputMode: String
    var items: [DayLogItem]
    var totals: Totals
}

struct DayLogItem: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var foodId: String?
    var name: String
    var source: String
    var grams: Double?
    var kcal: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var fibre: Double
    var countsToProtein: Bool

    /// MFP history is one total per meal: say so instead of "Lunch (MyFitnessPal)".
    var isImported: Bool { source == "mfp" }
    var displayName: String { isImported ? "From MyFitnessPal" : name }
    var detail: String {
        if isImported { return "Meal total · \(Int(kcal.rounded())) kcal" }
        let g = grams.map { "\(Int($0.rounded())) g · " } ?? ""
        return "\(g)\(Int(kcal.rounded())) kcal"
    }
}

struct WeekDay: Codable, Identifiable, Sendable {
    var date: String
    var protein: Double
    var kcal: Double
    var logged: Bool
    var id: String { date }
}

// MARK: Supplements

enum SupplementSlot: String, Codable, Sendable {
    case waking, breakfast, lunch, pre_workout, post_workout, dinner, bedtime, any

    /// The usual time, as on the web (src/domain/supplements.ts SLOTS).
    var time: String? {
        switch self {
        case .waking: "06:30"
        case .breakfast: "08:30"
        case .lunch: "13:30"
        case .pre_workout: "17:30"
        case .post_workout: "19:00"
        case .dinner: "20:30"
        case .bedtime: "22:30"
        case .any: nil
        }
    }
}

struct TodaySlots: Codable, Sendable {
    struct Slot: Codable, Identifiable, Sendable {
        var slot: SupplementSlot
        var label: String
        var items: [SlotItem]
        var id: String { slot.rawValue }
        var done: Int { items.filter(\.isDone).count }
        var allDone: Bool { done == items.count }
    }
    var date: String
    var slots: [Slot]
    var lowStock: [Supplement]
}

struct Supplement: Codable, Identifiable, Sendable {
    var id: String
    var name: String
    var servingDesc: String
    var foodId: String?
    var daysLeft: Double?
}

struct SlotItem: Codable, Identifiable, Sendable {
    enum Status: String, Codable, Sendable { case pending, taken, half, skipped }
    var supplement: Supplement
    var status: Status
    var late: Bool
    /// ISO 8601, when it was logged as taken (or skipped).
    var takenAt: String?
    /// 1, 2 (×2) or 0.5 (half); nil until logged.
    var multiplier: Double?
    var id: String { supplement.id }
    var isDone: Bool { status != .pending }

    var note: String? {
        switch status {
        case .skipped: "skipped"
        case .half: "half"
        case .taken: late ? "late" : nil
        case .pending: nil
        }
    }
}

// MARK: Logging

struct Portion: Codable, Hashable, Sendable {
    var label: String
    var grams: Double
}

struct FoodSummary: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var brand: String?
    var source: String
    var kcal100g: Double
    var protein100g: Double?
    var carbs100g: Double?
    var fat100g: Double?
    var fibre100g: Double?
    var servingG: Double?
    var servingLabel: String?
    var verified: Bool
    var favourite: Bool

    var sourceShort: String {
        switch source {
        case "user": "Mine"
        case "recipe": "Recipe"
        case "indb": "INDB"
        case "usda_foundation", "usda_sr": "USDA"
        case "off": "OFF"
        default: source
        }
    }

    /// Collagen is logged but stays off the protein target by default.
    var isCollagen: Bool { name.range(of: #"\bcollagen\b"#, options: [.regularExpression, .caseInsensitive]) != nil }

    func protein(_ grams: Double) -> Double { (protein100g ?? 0) * grams / 100 }
    func kcal(_ grams: Double) -> Double { kcal100g * grams / 100 }
}

struct DraftMatch: Codable, Sendable {
    var food: FoodSummary
    var portions: [Portion]

    init(from decoder: Decoder) throws {
        food = try FoodSummary(from: decoder)
        portions = try decoder.container(keyedBy: Keys.self).decodeIfPresent([Portion].self, forKey: .portions) ?? []
    }

    func encode(to encoder: Encoder) throws { try food.encode(to: encoder) }
    private enum Keys: String, CodingKey { case portions }
}

struct TextDraft: Codable, Sendable {
    struct Item: Codable, Sendable {
        var said: String
        var estGrams: Double
        var grams: Double
        var basis: String
        var confidence: Double
        var match: DraftMatch?
        var alternatives: [FoodSummary]
    }
    var items: [Item]
    var model: String
    var costUsd: Double?
    var draftId: String?
}

struct SavedMeal: Codable, Identifiable, Sendable {
    struct Item: Codable, Sendable {
        var food: FoodSummary
        var grams: Double
    }
    var id: String
    var name: String
    var items: [Item]
    var kcal: Double
    var protein: Double
}

struct QuickFoods: Codable, Sendable {
    var recent: [FoodSummary]
    var favourites: [FoodSummary]
    var meals: [SavedMeal]
}

struct FoodSearchResult: Codable, Sendable {
    var foods: [FoodSummary]
}

struct FoodPortions: Codable, Sendable {
    var id: String
    var portions: [Portion]
}

struct NudgeResult: Codable, Sendable {
    var nudges: [String]?
}

struct NewFoodLog: Encodable {
    struct Item: Encodable {
        var foodId: String
        var grams: Double
        var estGrams: Double?
        var confidence: Double?
    }
    var meal: Meal
    var date: String?
    var time: String?
    var inputMode: String
    var rawText: String?
    var model: String?
    var costUsd: Double?
    /// The describe drafts this came from, so the server can score them.
    var draftIds: [String]?
    var items: [Item]
}

struct LoggedFood: Decodable {
    var id: String
    var nudges: [String]
}
