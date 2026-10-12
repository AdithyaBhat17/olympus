import OlympusCore
import SwiftUI

/// Swap exercise (swap-sheet.tsx): safe alternatives in the same category (or
/// search matches), then blocked ones with their safe substitutes and an
/// override that asks for a reason, flagged for the PT.
struct SessionSwapSheet: View {
    struct Replacing {
        let name: String
        let exerciseId: String
        let category: String
    }

    let replacing: Replacing
    let candidates: [SwapCandidate]
    let constraintRegions: [String]
    let inSessionIds: Set<String>
    let onSwap: (_ exerciseId: String, _ overrideReason: String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var overrideMode = false
    @State private var overrideTarget: SwapCandidate?
    @State private var reason = ""

    private var words: [String] {
        query.lowercased().split(whereSeparator: \.isWhitespace).map(String.init)
    }

    private var pool: [SwapCandidate] {
        let w = words
        return candidates.filter { c in
            guard c.id != replacing.exerciseId else { return false }
            if w.isEmpty { return c.category == replacing.category }
            let hay = "\(c.name) \(c.slug ?? "") \(c.category)".lowercased()
            return w.allSatisfy { hay.contains($0) }
        }
    }

    private var safe: [SwapCandidate] {
        // Stable: not-in-session first, keeping the server's order otherwise.
        let p = pool.filter { !$0.blocked }
        return p.filter { !inSessionIds.contains($0.id) } + p.filter { inSessionIds.contains($0.id) }
    }

    private var blocked: [SwapCandidate] { pool.filter(\.blocked) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    if !constraintRegions.isEmpty { constraintChips }
                    safeSection
                    if !blocked.isEmpty { blockedSection }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.bg)
            .searchable(
                text: $query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search, showing \(sessionCategory(replacing.category))"
            )
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text("Replacing, \(replacing.name)")
                            .font(.system(size: 13))
                            .foregroundStyle(Color.muted)
                            .lineLimit(1)
                        Text("Swap exercise")
                            .font(.num(20))
                            .foregroundStyle(Color.fg)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.large])
        .presentationCornerRadius(40)
        .presentationBackground(Color.bg)
        .alert(
            overrideTarget.map { "Why log \($0.name) anyway?" } ?? "",
            isPresented: Binding(get: { overrideTarget != nil }, set: { if !$0 { overrideTarget = nil } })
        ) {
            TextField("Reason", text: $reason)
            Button("Cancel", role: .cancel) { overrideTarget = nil }
            Button("Log it anyway") {
                let r = reason.trimmingCharacters(in: .whitespacesAndNewlines)
                if let c = overrideTarget, !r.isEmpty { onSwap(c.id, String(r.prefix(300))) }
                overrideTarget = nil
            }
        } message: {
            Text("This goes to your PT as a flag.")
        }
    }

    private var constraintChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(constraintRegions.enumerated()), id: \.offset) { i, r in
                    Text(r)
                        .font(.system(size: 13))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(i == 0 ? SessionPalette.dangerBg : Color.surface2, in: Capsule())
                        .overlay(Capsule().strokeBorder(i == 0 ? SessionPalette.dangerLine : SessionPalette.line, lineWidth: 1))
                        .foregroundStyle(i == 0 ? Color.dangerInk : Color.fg2)
                }
            }
        }
        .accessibilityLabel("Active constraints: \(constraintRegions.joined(separator: ", "))")
        .padding(.top, 4)
    }

    private var safeSection: some View {
        let list = safe
        let suggestedId = list.first { !inSessionIds.contains($0.id) }?.id
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Safe for you, \(words.isEmpty ? "same muscle" : "matches")")
                .padding(.top, 8)
                .accessibilityAddTraits(.isHeader)
            if list.isEmpty {
                Text(words.isEmpty ? "No safe alternatives in this category. Try searching." : "Nothing safe matches that search.")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.muted)
                    .padding(.vertical, 8)
            }
            ForEach(list) { c in
                safeRow(c, suggested: c.id == suggestedId)
            }
        }
    }

    private func safeRow(_ c: SwapCandidate, suggested: Bool) -> some View {
        let already = inSessionIds.contains(c.id)
        let sub: String = {
            if already { return "Already in today's session" }
            if let kg = c.lastKg {
                return "\(sessionCategory(c.category)), last \(formatLoad(c.loadMode, kg))\(c.loadMode == .total ? " kg" : "")"
            }
            return "No log yet, calibration weight"
        }()
        return Button { onSwap(c.id, nil) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(c.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.fg)
                    Text(sub).font(.system(size: 13)).foregroundStyle(Color.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let kg = c.lastKg {
                    Text(formatLoad(c.loadMode, kg))
                        .font(.num(22))
                        .foregroundStyle(already ? Color.muted : Color.fg)
                } else {
                    Text("Calibrate")
                        .font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(SessionPalette.accentBg, in: RoundedRectangle(cornerRadius: 6))
                        .foregroundStyle(Color.coralDeep)
                }
            }
            .padding(14)
            .frame(minHeight: 44)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(suggested ? Color.coral : SessionPalette.line, lineWidth: suggested ? 2 : 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var blockedSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Blocked, won't be programmed")
                .padding(.top, 24)
                .accessibilityAddTraits(.isHeader)
            ForEach(blocked) { c in blockedRow(c) }
            Button { overrideMode.toggle() } label: {
                Text(overrideMode ? "Pick the blocked exercise above, or tap to cancel" : "Log it anyway, I'll take the flag")
                    .font(.system(size: 14))
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(overrideMode ? SessionPalette.dangerLine : Color.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    )
                    .foregroundStyle(overrideMode ? Color.dangerInk : Color.muted)
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
            .accessibilityAddTraits(overrideMode ? .isSelected : [])
        }
    }

    private func blockedRow(_ c: SwapCandidate) -> some View {
        let byId = Dictionary(candidates.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let subs = c.substitutes.filter { $0.id != replacing.exerciseId && !(byId[$0.id]?.blocked ?? false) }
        let content = HStack(alignment: .top, spacing: 12) {
            Image(systemName: "xmark")
                .font(.system(size: 12, weight: .heavy))
                .frame(width: 28, height: 28)
                .background(SessionPalette.dangerDot, in: Circle())
                .foregroundStyle(Color.danger)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(c.name)
                    .font(.system(size: 16, weight: .semibold))
                    .strikethrough(color: .faint)
                    .foregroundStyle(Color.fg2)
                if let r = c.blockedReason {
                    Text(r).font(.system(size: 13)).foregroundStyle(Color.dangerInk)
                }
            }
            Spacer(minLength: 0)
        }

        return VStack(alignment: .leading, spacing: 4) {
            if overrideMode {
                Button {
                    reason = ""
                    overrideTarget = c
                } label: { content.contentShape(Rectangle()).frame(minHeight: 44) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Log \(c.name) anyway (blocked: \(c.blockedReason ?? "constraint"))")
            } else {
                content
            }
            ForEach(subs, id: \.id) { s in
                Button { onSwap(s.id, nil) } label: {
                    Text("Use instead → \(s.name)")
                        .font(.system(size: 13))
                        .foregroundStyle(SessionPalette.info)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.leading, 40)
            }
        }
        .padding(14)
        .background(Color.surface2, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(overrideMode ? SessionPalette.dangerLine : SessionPalette.line.opacity(0.6), lineWidth: 1)
        )
    }
}
