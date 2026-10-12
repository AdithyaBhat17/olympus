import OlympusCore
import SwiftUI

/// Carry-forward coach flags, numbered 01, 02… (src/components/today/flags-list.tsx).
/// Done slides the row out and offers Undo for 4 s before the resolve is sent.
struct TodayFlagsList: View {
    @Environment(AppModel.self) private var model
    let flags: [CoachFlag]

    /// Flags marked done here: pending (inside the undo window) or sent.
    @State private var done: Set<String> = []
    @State private var pending = TodayPendingFlags()

    static let undoWindow: Duration = .seconds(4)

    private var open: [CoachFlag] { flags.filter { !done.contains($0.id) } }

    var body: some View {
        VStack(spacing: 0) {
            // Always present, so onDisappear means the screen left, not the last row.
            Color.clear.frame(height: 0)
            if !open.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        SectionLabel("Carry-forward from your PT").accessibilityAddTraits(.isHeader)
                        Spacer()
                        Text("\(open.count)")
                            .font(.num(15))
                            .foregroundStyle(Color.muted)
                            .contentTransition(.numericText(value: Double(open.count)))
                    }
                    .padding(.horizontal, 8)
                    .padding(.bottom, 10)

                    VStack(spacing: 8) {
                        ForEach(Array(open.enumerated()), id: \.element.id) { i, flag in
                            row(flag, number: i + 1)
                                .transition(.asymmetric(
                                    insertion: .opacity,
                                    removal: .offset(x: 40).combined(with: .opacity)
                                ))
                        }
                    }
                }
            }
        }
        .onDisappear(perform: commitAll)
    }

    private func row(_ flag: CoachFlag, number: Int) -> some View {
        HStack(spacing: 12) {
            Text(String(format: "%02d", number))
                .font(.num(22))
                .foregroundStyle(Color.coral)
                .frame(width: 30, alignment: .leading)
                .accessibilityHidden(true)
            Text(flag.text)
                .font(.system(size: 14))
                .lineSpacing(3)
                .foregroundStyle(Color.fg2)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Button { markDone(flag) } label: {
                Image(systemName: "checkmark")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Color.fg2)
                    .frame(width: 44, height: 44)
                    .background(Color.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .accessibilityLabel("Mark done: \(flag.text)")
        }
        .padding(.leading, 16)
        .padding([.vertical, .trailing], 6)
        .card(18)
    }

    private func markDone(_ flag: CoachFlag) {
        Haptics.tick()
        let id = flag.id
        _ = withAnimation(.easeInOut(duration: 0.22)) { done.insert(id) }
        pending.tasks[id]?.cancel()
        pending.tasks[id] = Task {
            try? await Task.sleep(for: Self.undoWindow)
            guard !Task.isCancelled else { return }
            commit(id)
        }
        model.show("Flag marked done", undo: {
            guard let task = pending.tasks.removeValue(forKey: id) else { return }
            task.cancel()
            _ = withAnimation(.easeInOut(duration: 0.22)) { done.remove(id) }
        })
    }

    private func commit(_ id: String) {
        pending.tasks[id] = nil
        Task {
            await model.mutate(.resolveFlag(id: id), rollback: {
                _ = withAnimation { done.remove(id) }
            })
        }
    }

    /// Don't lose a pending resolve when the screen goes away inside the undo window.
    private func commitAll() {
        for (id, task) in pending.tasks {
            task.cancel()
            commit(id)
        }
    }
}

/// Undo timers, kept out of view state so they survive re-renders.
@MainActor
final class TodayPendingFlags {
    var tasks: [String: Task<Void, Never>] = [:]
}
