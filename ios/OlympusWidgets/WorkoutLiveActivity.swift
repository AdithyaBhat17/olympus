import ActivityKit
import OlympusCore
import SwiftUI
import WidgetKit

/// The live session on the Lock Screen and in the Dynamic Island: the current
/// exercise and set, and the rest countdown while one runs. Stale means the
/// rest ran out while the app wasn't around to clear it, so it reads "Rest's up".
struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutAttributes.self) { context in
            WorkoutLockScreen(context: context)
                .widgetURL(context.attributes.url)
        } dynamicIsland: { context in
            let kind = KindColors(type: context.attributes.sessionType)
            let state = context.state
            let rest = RestPhase(state, stale: context.isStale)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(rest.title(state))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(rest.isOver ? kind.k3 : .secondary)
                            .lineLimit(1)
                        Text(state.exercise ?? "Workout")
                            .font(.system(size: 17, weight: .bold))
                            .lineLimit(1)
                    }
                    .padding(.leading, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    WorkoutClock(attributes: context.attributes, rest: rest)
                        .font(.num(30))
                        .foregroundStyle(rest.isActive ? kind.k3 : .white)
                        .frame(maxWidth: 110, alignment: .trailing)
                        .padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        if case let .active(start, end) = rest {
                            ProgressView(timerInterval: start...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(kind.k3)
                        } else {
                            WorkoutSegments(done: state.doneCount, total: state.total, fill: kind.k3, track: .white.opacity(0.2))
                        }
                        HStack(spacing: 8) {
                            Text(rest.isActive ? "Next up: \(state.nextLabel ?? "next set")" : state.detail)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if rest.isActive {
                                RestButtons(sessionId: context.attributes.sessionId, fill: .white.opacity(0.18), skipFill: kind.k3, skipText: .black)
                            }
                        }
                    }
                    .padding(.horizontal, 6)
                }
            } compactLeading: {
                WorkoutGlyph(rest: rest, tint: kind.k3)
            } compactTrailing: {
                WorkoutClock(attributes: context.attributes, rest: rest)
                    .font(.num(15))
                    .foregroundStyle(rest.isActive ? kind.k3 : .white)
                    // Wide enough for "1:05:23" once a session passes an hour.
                    .frame(maxWidth: 64)
            } minimal: {
                WorkoutGlyph(rest: rest, tint: kind.k3)
            }
            .widgetURL(context.attributes.url)
            .keylineTint(kind.k)
        }
    }
}

/// Where the rest stands: running, just run out, or none.
private enum RestPhase {
    case active(Date, Date)
    case over
    case none

    init(_ state: WorkoutAttributes.ContentState, stale: Bool) {
        guard let start = state.restStart, let end = state.restEnd, end > start else {
            self = .none
            return
        }
        self = stale || end <= Date() ? .over : .active(start, end)
    }

    var isActive: Bool {
        if case .active = self { return true }
        return false
    }

    var isOver: Bool {
        if case .over = self { return true }
        return false
    }

    func title(_ state: WorkoutAttributes.ContentState) -> String {
        switch self {
        case .active: "Resting"
        case .over: "Rest's up. Go!"
        case .none: state.detail
        }
    }
}

/// The rest countdown while resting, else the session's elapsed time.
private struct WorkoutClock: View {
    let attributes: WorkoutAttributes
    let rest: RestPhase

    var body: some View {
        switch rest {
        case let .active(start, end):
            Text(timerInterval: start...end, countsDown: true)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
        case .over:
            Text("Go")
        case .none:
            Text(attributes.startedAt, style: .timer)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
        }
    }
}

/// A draining ring while resting, else a dumbbell.
private struct WorkoutGlyph: View {
    let rest: RestPhase
    let tint: Color

    var body: some View {
        if case let .active(start, end) = rest {
            ProgressView(timerInterval: start...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                .progressViewStyle(.circular)
                .tint(tint)
        } else {
            Image(systemName: rest.isOver ? "bell.fill" : "dumbbell.fill")
                .foregroundStyle(tint)
        }
    }
}

/// "+30" and "Skip", like the rest pill's (WorkoutIntents runs them in the app).
private struct RestButtons: View {
    let sessionId: String
    let fill: Color
    let skipFill: Color
    let skipText: Color

    var body: some View {
        HStack(spacing: 6) {
            Button(intent: AddRestIntent(sessionId: sessionId)) {
                Text("+30")
                    .frame(minWidth: 52, minHeight: 34)
                    .background(fill, in: Capsule())
            }
            .accessibilityLabel("Add 30 seconds")
            Button(intent: SkipRestIntent(sessionId: sessionId)) {
                Text("Skip")
                    .frame(minWidth: 60, minHeight: 34)
                    .background(skipFill, in: Capsule())
                    .foregroundStyle(skipText)
            }
            .accessibilityLabel("Skip rest")
        }
        .font(.system(size: 15, weight: .bold))
        .buttonStyle(.plain)
    }
}

/// One segment per exercise, done ones filled (the live header's progress bar).
private struct WorkoutSegments: View {
    let done: Int
    let total: Int
    let fill: Color
    let track: Color

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<max(total, 1), id: \.self) { i in
                Capsule().fill(i < done ? fill : track)
            }
        }
        .frame(height: 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(done) of \(total) exercises done")
    }
}

/// Lock Screen banner in the session's colour block.
private struct WorkoutLockScreen: View {
    let context: ActivityViewContext<WorkoutAttributes>

    var body: some View {
        let kind = KindColors(type: context.attributes.sessionType)
        let state = context.state
        let rest = RestPhase(state, stale: context.isStale)
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(context.attributes.title)
                    .font(.system(size: 13, weight: .semibold))
                    .opacity(0.85)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(context.attributes.startedAt, style: .timer)
                    .font(.num(13, weight: .bold))
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .lineLimit(1)
                    // Room for the dimmed Lock Screen's "25 minutes".
                    .frame(maxWidth: 100, alignment: .trailing)
                    .opacity(0.85)
            }
            HStack(alignment: .lastTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.exercise ?? "Workout")
                        .font(.system(size: 20, weight: .heavy))
                        .lineLimit(1)
                    Text(rest.isActive ? "Next up: \(state.nextLabel ?? "next set")" : rest.title(state))
                        .font(.system(size: 15, weight: .semibold))
                        .opacity(0.9)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                if rest.isActive {
                    WorkoutClock(attributes: context.attributes, rest: rest)
                        .font(.num(34))
                        .frame(maxWidth: 110, alignment: .trailing)
                }
            }
            if case let .active(start, end) = rest {
                HStack(spacing: 12) {
                    ProgressView(timerInterval: start...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                        .tint(kind.on)
                    RestButtons(sessionId: context.attributes.sessionId, fill: kind.on.opacity(0.18), skipFill: kind.on, skipText: kind.k)
                }
            } else {
                WorkoutSegments(done: state.doneCount, total: state.total, fill: kind.on, track: kind.on.opacity(0.25))
            }
        }
        .foregroundStyle(kind.on)
        .padding(16)
        .activityBackgroundTint(kind.k)
        .activitySystemActionForegroundColor(kind.on)
    }
}
