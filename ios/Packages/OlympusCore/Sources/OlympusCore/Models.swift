import Foundation

// Codable mirrors of what /api/v1 returns (src/server/screens/*, src/server/sessions.ts).
// Dates stay as the server sends them: "2026-10-02" for days, ISO 8601 for instants.

// MARK: - Shared

public enum LoadMode: String, Codable, Sendable {
    case total = "TOTAL"
    case perSide = "PER_SIDE"
    case counterweight = "COUNTERWEIGHT"
    case time = "TIME"
}

public struct Targets: Codable, Hashable, Sendable {
    public var kcal: Int?
    public var proteinG: Int?
    public var waterMl: Int?
    public var minSleepMin: Int
}

public struct AthleteProfile: Codable, Hashable, Sendable {
    /** The Google account's name; nil until they've signed in since it was stored. */
    public var displayName: String?
    public var timezone: String
    public var timezoneSet: Bool
    public var targets: Targets
    public var rotation: [String]
}

public struct Me: Codable, Sendable {
    public var email: String
    public var profile: AthleteProfile
}

public let exerciseCategories = [
    "Lower Body — Quad Dominant",
    "Lower Body — Posterior Chain",
    "Upper Body — Push (Horizontal)",
    "Upper Body — Push (Vertical)",
    "Upper Body — Pull (Horizontal)",
    "Upper Body — Pull (Vertical)",
    "Arms",
    "Core",
    "Calves",
    "Cardio",
]

// MARK: - Today

public struct TodayScreen: Codable, Sendable {
    public var today: String
    public var eyebrow: String
    public var next: NextSession
    public var recovery: RecoveryCardData
    public var flags: [CoachFlag]
}

public struct NextSession: Codable, Sendable {
    public struct RotationPill: Codable, Hashable, Sendable {
        public var type: String
        public var sub: String
        public var lastDone: String?
    }
    public struct Item: Codable, Hashable, Identifiable, Sendable {
        public var key: String
        public var name: String
        public var load: String?
        public var unit: String?
        public var up: String?
        public var straps: Bool
        public var id: String { key }
    }
    public struct Live: Codable, Hashable, Sendable {
        public var id: String
        public var startedAt: String?
        public var type: String?
    }
    public var sessions: [RotationPill]
    public var plannedType: String
    public var lastType: String?
    public var hasPtPlan: Bool
    public var planId: String?
    public var fromPtAt: String?
    public var dayLabel: String?
    public var warnings: [String]
    public var items: [Item]
    public var more: [String]
    public var live: Live?
}

public struct RecoveryCardData: Codable, Hashable, Sendable {
    public struct CardTargets: Codable, Hashable, Sendable {
        public var sleepMin: Int
        public var minSleepMin: Int
        public var proteinG: Int?
        public var waterMl: Int?
    }
    public var date: String
    public var sleepMin: Int?
    public var proteinG: Int?
    public var waterMl: Int?
    public var hrvMs: Int?
    public var restingHr: Int?
    public var targets: CardTargets
    /** Field ("sleep", "protein", …) → "manual" | "claude" | "whoop" | "apple_health". */
    public var sources: [String: String]
    public var holdMessage: String?
}

public struct CoachFlag: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var text: String
}

// MARK: - Live session

public struct PlanSet: Codable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable { case warmup, working }
    public var type: Kind
    /** [min, max]. */
    public var reps: [Int]
    public var rpe: Double?
    public var openKg: Double?

    public var repsMin: Int { reps.first ?? 0 }
    public var repsMax: Int { reps.last ?? 0 }
}

public enum SetFlag: String, Codable, Sendable {
    case underloaded
    case topSetPR = "top_set_pr"
    case blockedOverride = "blocked_override"
}

public struct SetLogEntry: Codable, Hashable, Sendable {
    public var reps: Int
    /** True kg (plates + carriage for PER_SIDE). */
    public var weight: Double
    public var platesKg: Double?
    public var rpe: Double?
    public var type: PlanSet.Kind?
    public var flags: [SetFlag]?
    public var doneAt: String?
    public var avgHr: Double?

    public init(reps: Int, weight: Double, platesKg: Double? = nil, rpe: Double? = nil, type: PlanSet.Kind? = nil, flags: [SetFlag]? = nil) {
        self.reps = reps
        self.weight = weight
        self.platesKg = platesKg
        self.rpe = rpe
        self.type = type
        self.flags = flags
    }

    public func has(_ flag: SetFlag) -> Bool { flags?.contains(flag) ?? false }
}

public struct ExerciseMeta: Codable, Hashable, Sendable {
    public var id: String
    public var slug: String?
    public var name: String
    public var category: String
    public var loadMode: LoadMode
    public var carriageKgPerSide: Double?
    public var isCompound: Bool
    public var bodyRegion: String?
    public var formCueId: String?
    public var equipment: String?
}

public struct LiveSet: Codable, Hashable, Sendable {
    public struct Last: Codable, Hashable, Sendable {
        public var weight: Double
        public var reps: Int
    }
    public var index: Int
    public var planned: PlanSet?
    public var logged: SetLogEntry?
    public var last: Last?

    public init(index: Int, planned: PlanSet? = nil, logged: SetLogEntry? = nil, last: Last? = nil) {
        self.index = index
        self.planned = planned
        self.logged = logged
        self.last = last
    }
}

public struct LiveItem: Codable, Hashable, Identifiable, Sendable {
    public var key: String
    public var planItemId: String?
    public var exercise: ExerciseMeta
    public var plannedExercise: ExerciseMeta?
    public var swapped: Bool
    public var restSec: Int
    public var straps: Bool
    public var cues: [String]
    public var pairGroup: String?
    public var sets: [LiveSet]
    public var notes: String?
    public var lastTopKg: Double?
    public var done: Bool
    public var coachFlags: [String]
    public var blockedReason: String?
    public var id: String { key }
}

public enum SessionStatus: String, Codable, Sendable {
    case inProgress = "IN_PROGRESS"
    case done = "DONE"
}

public struct SessionView: Codable, Sendable {
    public struct Plan: Codable, Hashable, Sendable {
        public var id: String
        public var source: String
        public var pushedAt: String
        public var coachNotes: String?
        public var warnings: [String]
    }
    public struct CheckIn: Codable, Hashable, Sendable {
        public var sleepMin: Int?
        public var proteinG: Int?
        public var waterMl: Int?
    }
    public struct SessionTargets: Codable, Hashable, Sendable {
        public var proteinG: Int?
        public var waterMl: Int?
    }
    public var id: String
    public var date: String
    public var status: SessionStatus
    public var sessionType: String?
    public var title: String
    public var notes: String?
    public var startedAt: String?
    public var finishedAt: String?
    public var sentAt: String?
    public var plan: Plan?
    public var items: [LiveItem]
    public var progressionOnHold: Bool
    public var checkIn: CheckIn?
    public var targets: SessionTargets
}

public struct SwapCandidate: Codable, Hashable, Identifiable, Sendable {
    public struct Substitute: Codable, Hashable, Sendable {
        public var id: String
        public var slug: String?
        public var name: String
    }
    public var exerciseId: String
    public var exerciseUuid: String
    public var id: String
    public var slug: String?
    public var name: String
    public var category: String
    public var status: String
    public var loadMode: LoadMode
    public var carriageKgPerSide: Double?
    public var blocked: Bool
    public var blockedReason: String?
    public var substitutes: [Substitute]
    public var lastKg: Double?
}

public struct LiveSessionScreen: Codable, Sendable {
    public struct Swap: Codable, Sendable {
        public var candidates: [SwapCandidate]
        public var constraintRegions: [String]
    }
    public var view: SessionView
    public var swap: Swap
}

public struct UnderloadNudge: Codable, Hashable, Sendable {
    public var suggestKg: Double
    public var headline: String
    public var detail: String
}

public struct LogSetResult: Codable, Sendable {
    public var set: SetLogEntry
    public var nudge: UnderloadNudge?
}

// MARK: - Finish

public struct SessionCatch: Codable, Hashable, Sendable {
    /** "pr" | "underload" | "blocked" | "recovery" */
    public var kind: String
    public var text: String
}

public struct ExportExercise: Codable, Hashable, Sendable {
    public var name: String
    public var loadMode: LoadMode
    public var sets: [SetLogEntry]
    public var notes: String?
    public var straps: Bool?
}

public struct ExportSession: Codable, Hashable, Sendable {
    public var date: String
    public var sessionType: String?
    public var title: String
    public var exercises: [ExportExercise]
    public var notes: String?
    public var checkIn: SessionView.CheckIn?
    public var targets: SessionView.SessionTargets?
}

public struct FinishScreen: Codable, Sendable {
    public var sessionId: String
    public var status: SessionStatus
    public var sentAt: String?
    public var eyebrow: String
    public var label: String
    public var sessionType: String?
    public var startedAt: String?
    public var durationSec: Int?
    public var workingSets: Int
    public var avgRpe: Double?
    public var catches: [SessionCatch]
    public var initialNotes: String
    public var fileName: String
    public var exportSession: ExportSession
    public var markdown: String
}

// MARK: - History, progress, library

public struct HistoryScreen: Codable, Sendable {
    public struct Session: Codable, Hashable, Identifiable, Sendable {
        public var id: String
        public var date: String
        public var title: String
        public var meta: String
        public var kind: String
        public var live: Bool
        public var sent: Bool
    }
    public struct Day: Codable, Hashable, Sendable {
        public var date: String
        public var kind: String?
        public var today: Bool
        public var future: Bool
    }
    public struct Stats: Codable, Hashable, Sendable {
        public var thisWeek: Int
        public var avg: Double
        public var streak: Int
    }
    public var eyebrow: String
    public var sessions: [Session]
    public var days: [Day]
    public var range: String
    public var stats: Stats
    public var thisMonday: String
    public var lastMonday: String
    public var rotation: [String]
}

public struct ProgressScreen: Codable, Sendable {
    public struct Row: Codable, Hashable, Identifiable, Sendable {
        public var id: String
        public var name: String
        public var category: String
        public var load: String
        public var unit: String?
        public var lastDate: String
        /** "up" | "down" | "flat" */
        public var trend: String
        public var trendLabel: String
    }
    public var eyebrow: String
    public var rows: [Row]
}

public struct ExerciseProgressScreen: Codable, Sendable {
    public struct Delta: Codable, Hashable, Sendable {
        public var text: String
        /** "up" | "down" | "flat" */
        public var tone: String
    }
    public struct TopSet: Codable, Hashable, Sendable {
        public var weight: Double
        public var reps: Int
    }
    public struct Point: Codable, Hashable, Sendable {
        public var date: String
        public var top: Double?
    }
    public struct Bump: Codable, Hashable, Sendable {
        public var needed: Int
        public var hits: Int
        public var label: String
        public var before: String
        public var after: String?
        public var incrementLabel: String
        public var minSleepMin: Int
    }
    public struct Recent: Codable, Hashable, Identifiable, Sendable {
        public var sessionId: String
        public var date: String
        public var dateLabel: String
        public var sets: String
        public var record: Bool
        public var underloaded: Bool
        public var id: String { sessionId }
    }
    public var id: String
    public var name: String
    public var loadMode: LoadMode
    public var eyebrow: String
    public var today: String
    public var workingKg: Double?
    public var unit: String
    public var deltaLine: Delta?
    public var newestTop: TopSet?
    public var overrideDate: String?
    public var points: [Point]
    public var e1rm: Double?
    public var sessionCount: Int
    public var sessionCountCapped: Bool
    public var nextKg: Double?
    public var bump: Bump
    public var recent: [Recent]
    public var formCue: String?
    public var blocked: Bool
    public var blockReason: String?
}

public struct LibraryScreen: Codable, Sendable {
    public struct Exercise: Codable, Hashable, Identifiable, Sendable {
        public var id: String
        public var name: String
        public var category: String
        public var status: String
        public var isCustom: Bool
        public var loadMode: LoadMode
        public var carriageKgPerSide: Double?
        public var isCompound: Bool
        public var equipment: String?
        public var hasFormCues: Bool
        public var workingKg: Double?
        public var blocked: Bool
        public var blockedReason: String?
        /** "you" | "injury" | "library" */
        public var blockedBy: String?
        public var substitutes: [String]
    }
    public var eyebrow: String
    public var exercises: [Exercise]
}

public struct WorkingWeightResult: Codable, Sendable {
    public var ok: Bool
    public var message: String
}

// MARK: - Manual log

public struct ManualLogOptions: Codable, Sendable {
    public struct Exercise: Codable, Hashable, Identifiable, Sendable {
        public var id: String
        public var name: String
        public var category: String
        public var status: String
        public var isCustom: Bool
    }
    public var exercises: [Exercise]
    public var recentSessionNames: [String]
}

/** "Fill from last <name>": just the parts the form copies. */
public struct ManualSessionTemplate: Codable, Sendable {
    public struct SessionExercise: Codable, Sendable {
        public struct SetDetail: Codable, Sendable {
            public var reps: Int
            public var weight: Double
        }
        public var exerciseId: String
        public var sets: Int?
        public var reps: Int?
        /** Postgres numeric, sent as a string. */
        public var weight: String?
        public var rpe: String?
        public var notes: String?
        public var setDetails: [SetDetail]?
        public var orderIndex: Int?
        public var exercise: ExerciseRef?

        public struct ExerciseRef: Codable, Sendable {
            public var id: String
            public var name: String
        }
    }
    public var sessionName: String
    public var weekNumber: Int?
    public var blockNumber: String?
    public var sessionExercises: [SessionExercise]
}

public struct ManualSessionInput: Codable, Sendable {
    public struct ExerciseInput: Codable, Sendable {
        public struct SetInput: Codable, Sendable {
            public var reps: Int
            public var weight: Double
            public init(reps: Int, weight: Double) { self.reps = reps; self.weight = weight }
        }
        public var exerciseId: String
        public var sets: [SetInput]
        public var rpe: Double?
        public var notes: String?
        public var orderIndex: Int
        public init(exerciseId: String, sets: [SetInput], rpe: Double?, notes: String?, orderIndex: Int) {
            self.exerciseId = exerciseId
            self.sets = sets
            self.rpe = rpe
            self.notes = notes
            self.orderIndex = orderIndex
        }

        enum CodingKeys: String, CodingKey { case exerciseId, sets, rpe, notes, orderIndex }

        /// The server's schema wants rpe and notes present (null, not missing).
        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(exerciseId, forKey: .exerciseId)
            try c.encode(sets, forKey: .sets)
            try c.encode(rpe, forKey: .rpe)
            try c.encode(notes, forKey: .notes)
            try c.encode(orderIndex, forKey: .orderIndex)
        }
    }
    public var date: String
    public var sessionName: String
    public var weekNumber: Int
    /** "1" | "2" | "3" | "Deload" */
    public var blockNumber: String
    public var notes: String?
    public var exercises: [ExerciseInput]
    public init(date: String, sessionName: String, weekNumber: Int, blockNumber: String, notes: String?, exercises: [ExerciseInput]) {
        self.date = date
        self.sessionName = sessionName
        self.weekNumber = weekNumber
        self.blockNumber = blockNumber
        self.notes = notes
        self.exercises = exercises
    }

    enum CodingKeys: String, CodingKey { case date, sessionName, weekNumber, blockNumber, notes, exercises }

    /// notes is required-but-nullable on the server, like rpe/notes per exercise.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(date, forKey: .date)
        try c.encode(sessionName, forKey: .sessionName)
        try c.encode(weekNumber, forKey: .weekNumber)
        try c.encode(blockNumber, forKey: .blockNumber)
        try c.encode(notes, forKey: .notes)
        try c.encode(exercises, forKey: .exercises)
    }
}

// MARK: - Form cues & settings

public struct FormCue: Codable, Hashable, Identifiable, Sendable {
    public var id: String
    public var title: String
    public var blurb: String
}

public struct FormCueScreen: Codable, Sendable {
    public var cue: String
    public var title: String
    public var eyebrow: String
    public var embedUrl: String
}

public struct SettingsScreen: Codable, Sendable {
    public struct Claude: Codable, Sendable {
        public struct LastWrite: Codable, Sendable {
            public var kind: String
            public var at: String
        }
        public struct Client: Codable, Hashable, Identifiable, Sendable {
            public var clientId: String
            public var name: String
            public var since: String
            public var lastUsedAt: String?
            public var id: String { clientId }
        }
        public struct Write: Codable, Hashable, Identifiable, Sendable {
            public var id: String
            public var tool: String
            public var ok: Bool
            public var summary: String?
            public var at: String
        }
        public var connected: Bool
        public var connectorUrl: String
        public var lastWrite: LastWrite?
        public var clients: [Client]
        public var writes: [Write]
    }
    public struct Whoop: Codable, Sendable {
        public var configured: Bool
        public var connected: Bool
        public var lastSyncAt: String?
        public var lastError: String?
    }
    public struct AppleHealth: Codable, Sendable {
        public var lastSyncAt: String?
    }
    public struct Injury: Codable, Hashable, Identifiable, Sendable {
        public var id: String
        public var region: String
        public var rule: String
        public var blockedPatterns: [String]
    }
    public var email: String
    public var profile: AthleteProfile
    public var claude: Claude
    public var whoop: Whoop
    public var appleHealth: AppleHealth
    public var injuries: [Injury]
}
