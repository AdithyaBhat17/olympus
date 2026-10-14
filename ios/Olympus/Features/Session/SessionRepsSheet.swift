import SwiftUI

/// Everything the reps sheet needs to open on one set.
struct RepsSheetRequest: Identifiable {
    let index: Int
    let setLabel: String
    let exerciseName: String
    let initial: Int?
    var id: Int { index }
}

/**
 * Reps entry (reps-sheet.tsx): −/+ stepper plus 1–15 chips. Opened by
 * long-pressing the reps cell.
 */
struct SessionRepsSheet: View {
    let request: RepsSheetRequest
    let kind: KindColors
    let onSubmit: (Int) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var reps: Int
    @State private var contentHeight: CGFloat = 480

    init(request: RepsSheetRequest, kind: KindColors, onSubmit: @escaping (Int) -> Void) {
        self.request = request
        self.kind = kind
        self.onSubmit = onSubmit
        _reps = State(initialValue: request.initial ?? 10)
    }

    private func clamp(_ n: Int) -> Int { min(sessionMaxReps, max(1, n)) }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                header
                valueRow
                chips
                Button { onSubmit(reps) } label: {
                    Label("Set \(reps) reps", systemImage: "checkmark")
                        .labelStyle(.titleAndIcon)
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            .padding(.horizontal, 12)
            .padding(.top, 20)
            .padding(.bottom, 16)
            .sessionMeasureHeight($contentHeight)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(Color.bg)
        .sessionBottomSheet(height: contentHeight)
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Set \(request.setLabel), reps")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(Color.fg)
                Text(request.exerciseName)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
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

    private var valueRow: some View {
        HStack(spacing: 8) {
            stepper(-1)
            Text("\(reps)")
                .font(.num(76))
                .foregroundStyle(Color.fg)
                .contentTransition(.numericText())
                .frame(maxWidth: .infinity)
                .accessibilityLabel("\(reps) reps")
            stepper(1)
        }
        .padding(.vertical, 8)
        .animation(.spring(duration: 0.25), value: reps)
    }

    private func stepper(_ d: Int) -> some View {
        Button { reps = clamp(reps + d) } label: {
            Text(d < 0 ? "−1" : "+1")
                .font(.num(20))
                .frame(width: 64, height: 64)
                .background(Color.surface3, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .foregroundStyle(Color.fg)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(d < 0 ? "Minus" : "Plus") 1 rep")
    }

    private var chips: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 5), spacing: 6) {
            ForEach(1...sessionMaxReps, id: \.self) { n in
                let picked = reps == n
                Button { reps = n } label: {
                    Text("\(n)")
                        .font(.num(20))
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(picked ? kind.k : SessionPalette.key, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(picked ? kind.on : Color.fg)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(picked ? .isSelected : [])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Quick reps")
    }
}
