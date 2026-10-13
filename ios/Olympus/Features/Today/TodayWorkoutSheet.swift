import OlympusCore
import SwiftUI

/// The whole planned session, read-only, so it can be checked before Let's go
/// (src/components/today/workout-sheet.tsx).
struct TodayWorkoutSheet: View {
    @Environment(\.dismiss) private var dismiss
    let type: String
    let workout: NextSession.Workout

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                header
                if let notes = workout.coachNotes, !notes.isEmpty {
                    Text(notes)
                        .font(.system(size: 15))
                        .lineSpacing(2)
                        .foregroundStyle(Color.fg2)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .card(24)
                }
                ForEach(Array(workout.items.enumerated()), id: \.element.id) { i, it in
                    row(i + 1, it)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Color.bg)
        .presentationDragIndicator(.visible)
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Session \(type)")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(Color.fg)
                    .accessibilityAddTraits(.isHeader)
                Text("\(workout.title), \(workout.items.count) exercise\(workout.items.count == 1 ? "" : "s")")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .frame(width: 36, height: 36)
                    .background(SessionPalette.key, in: Circle())
                    .foregroundStyle(Color.fg2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
        .padding(.horizontal, 6)
    }

    private func row(_ n: Int, _ it: NextSession.Workout.Item) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("\(n)")
                    .font(.num(15))
                    .foregroundStyle(Color.muted)
                    .frame(width: 18, alignment: .leading)
                HStack(spacing: 6) {
                    Text(it.name).font(.system(size: 17, weight: .semibold))
                    if it.straps { SessionStrapsChip() }
                    if let pair = it.pair { SessionStrapsChip(text: "superset \(pair)") }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let load = it.load {
                    Text(load).font(.num(17))
                }
            }
            .foregroundStyle(Color.fg)
            Text([it.sets, it.rest].compactMap { $0 }.joined(separator: ", "))
                .font(.system(size: 15))
                .foregroundStyle(Color.fg2)
                .padding(.leading, 30)
            if !it.cues.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(it.cues.enumerated()), id: \.offset) { _, c in
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("•")
                            Text(c).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .font(.system(size: 13))
                .foregroundStyle(Color.muted)
                .padding(.leading, 30)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(24)
        .accessibilityElement(children: .combine)
    }
}
