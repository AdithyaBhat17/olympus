import CoreTransferable
import OlympusCore
import SwiftUI
import UniformTypeIdentifiers

/// The finish / summary screen for a session, live or done (finish-screen.tsx).
struct SessionFinishView: View {
    let sessionId: String
    /// Back while the session is still live: return to the live screen.
    let onBackToSession: () -> Void

    @Environment(AppModel.self) private var model

    var body: some View {
        Loadable(load: { try await model.api.get("sessions/\(sessionId)/summary", as: FinishScreen.self) }) { screen, _ in
            SessionFinishContent(screen: screen, onBackToSession: onBackToSession)
        }
        .background(Color.bg.ignoresSafeArea())
    }
}

private struct SessionFinishContent: View {
    let screen: FinishScreen
    let onBackToSession: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var scrolled = false
    @State private var notes: String
    @State private var savedNotes: String
    @State private var sent: Bool
    @State private var leaving = false
    @State private var exportOpen = false
    @State private var confirmDelete = false
    @FocusState private var notesFocused: Bool

    init(screen: FinishScreen, onBackToSession: @escaping () -> Void) {
        self.screen = screen
        self.onBackToSession = onBackToSession
        _notes = State(initialValue: screen.initialNotes)
        _savedNotes = State(initialValue: screen.initialNotes)
        _sent = State(initialValue: screen.sentAt != nil)
    }

    private var live: Bool { screen.status == .inProgress }
    private var kind: KindColors { KindColors(type: screen.sessionType) }
    private var hasPr: Bool { screen.catches.contains { $0.kind == "pr" } }
    /// Sent and no longer live: the bottom bar offers "Back to Today".
    private var done: Bool { sent && !live }
    private var notesOrNil: String? {
        let t = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    private var markdown: String {
        var e = screen.exportSession
        e.notes = notesOrNil
        return renderSessionMarkdown(e)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                hero
                VStack(alignment: .leading, spacing: 0) {
                    catchesSection
                    notesSection
                    exportSection
                }
                .padding(.top, 8)
                .sessionSheetOver()
                .padding(.bottom, 200)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .scrollBounceBehavior(.basedOnSize)
        .background {
            VStack(spacing: 0) {
                kind.k.frame(height: 400)
                Color.bg
            }
            .ignoresSafeArea()
        }
        .trackScrolledPastTop($scrolled)
        .overlay(alignment: .top) { StatusBarBlur(visible: scrolled) }
        // Out of the way while typing notes, so it never sits on the export buttons.
        .safeAreaInset(edge: .bottom, spacing: 0) { if !notesFocused { bottomBar } }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { notesFocused = false }.fontWeight(.semibold)
            }
        }
        .task(id: notes) { await autosave() }
        .confirmationDialog("Delete this session?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete session", role: .destructive) { Task { await deleteSession() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This cannot be undone.")
        }
    }

    // MARK: Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                SessionRoundButton(
                    systemImage: "chevron.left",
                    label: live ? "Back to session" : "Back to log",
                    foreground: kind.on
                ) {
                    if live { onBackToSession() } else { dismiss() }
                }
                Spacer()
                Text(screen.eyebrow)
                    .font(.system(size: 15, weight: .semibold))
                    .opacity(0.9)
                    .lineLimit(1)
                Spacer()
                Color.clear.frame(width: 44, height: 44)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            VStack(alignment: .leading, spacing: 6) {
                Text(live ? (hasPr ? "New PR!" : "Crushed it.") : sent ? "Sent." : "Done.")
                    .font(.system(size: 56, weight: .heavy))
                    .tracking(-1)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .modifier(PopIn(delay: 0))
                    .accessibilityAddTraits(.isHeader)
                Text("\(screen.label). \(Self.summaryLine(screen.catches))")
                    .font(.system(size: 17))
                    .opacity(0.9)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)

            stats
                .padding(.horizontal, 20)
                .padding(.top, 24)
        }
        .foregroundStyle(kind.on)
        .padding(.bottom, 48)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Confetti falls behind the text, like the web's.
        .background {
            ZStack {
                kind.k
                if live { SessionConfetti(k3: kind.k3).allowsHitTesting(false) }
            }
        }
        .clipped()
    }

    private var stats: some View {
        HStack(spacing: 12) {
            Group {
                if screen.durationSec == nil, let start = Dates.instant(screen.startedAt) {
                    TimelineView(.periodic(from: .now, by: 1)) { ctx in
                        let t = Self.formatDuration(ctx.date.timeIntervalSince(start))
                        statCircle(t.value, unit: t.unit, label: "time", index: 0)
                    }
                } else {
                    let t = screen.durationSec.map { Self.formatDuration(Double($0)) }
                    statCircle(t?.value ?? "—", unit: t?.unit, label: "time", index: 0)
                }
            }
            statCircle(String(screen.workingSets), unit: nil, label: "work sets", index: 1)
            statCircle(screen.avgRpe.map { String(format: "%.1f", $0) } ?? "—", unit: nil, label: "avg RPE", index: 2)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Summary")
    }

    private func statCircle(_ value: String, unit: String?, label: String, index: Int) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .lastTextBaseline, spacing: 3) {
                Text(value).font(.num(30)).monospacedDigit()
                if let unit { Text(unit).font(.num(15)) }
            }
            .foregroundStyle(kind.text)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            Text(label)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Color.muted)
        }
        .padding(8)
        .frame(width: 104, height: 104)
        .background(.white, in: Circle())
        .modifier(PopIn(delay: 0.15 + Double(index) * 0.1))
        .accessibilityElement(children: .combine)
    }

    // MARK: Sections

    private var catchesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("What your PT will see")
                .padding(.horizontal, 8)
                .accessibilityAddTraits(.isHeader)
            if screen.catches.isEmpty {
                Text("Nothing flagged. Clean session.")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.muted)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            } else {
                VStack(spacing: 6) {
                    ForEach(Array(screen.catches.enumerated()), id: \.offset) { _, c in
                        catchRow(c)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 22)
    }

    private func catchRow(_ c: SessionCatch) -> some View {
        let (mark, fg, bg, label): (AnyView, Color, Color, String) = {
            switch c.kind {
            case "pr":
                return (AnyView(Image(systemName: "arrow.up").font(.system(size: 15, weight: .heavy))), SessionPalette.info, SessionPalette.infoBg, "Progress")
            case "underload":
                return (AnyView(Text("!").font(.num(17, weight: .black))), Color.coral, SessionPalette.accentBg, "Underloaded")
            case "blocked":
                return (AnyView(Text("×").font(.num(18))), Color.danger, SessionPalette.dangerBg, "Blocked")
            default:
                return (AnyView(Text("×").font(.num(18))), Color.danger, SessionPalette.dangerBg, "Recovery")
            }
        }()
        return HStack(spacing: 12) {
            mark
                .foregroundStyle(fg)
                .frame(width: 40, height: 40)
                .background(bg, in: Circle())
                .accessibilityHidden(true)
            Text(c.text)
                .font(.system(size: 15))
                .foregroundStyle(Color.fg)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(c.text)")
    }

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Notes for your PT")
                .padding(.horizontal, 8)
            TextField("Wrist felt fine, deadlift grip slipped on set 3…", text: $notes, axis: .vertical)
                .lineLimit(3...12)
                .font(.system(size: 17))
                .foregroundStyle(Color.fg)
                .focused($notesFocused)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .strokeBorder(notesFocused ? kind.k : .clear, lineWidth: 2.5)
                )
                .onChange(of: notes) { _, t in if t.count > 2000 { notes = String(t.prefix(2000)) } }
                .accessibilityLabel("Notes for your PT")
            Text("Autosaved as you type, works offline")
                .font(.system(size: 13))
                .foregroundStyle(Color.muted)
                .padding(.horizontal, 8)
        }
        .padding(.horizontal, 12)
        .padding(.top, 22)
    }

    private var exportSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.spring(duration: 0.35)) { exportOpen.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .heavy))
                        .rotationEffect(.degrees(exportOpen ? 90 : 0))
                        .foregroundStyle(Color.muted)
                    SectionLabel(live ? "Lift Log entry" : "Export & delete")
                    Text(screen.fileName)
                        .font(.system(size: 13))
                        .foregroundStyle(Color.muted)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 44)
                .padding(.horizontal, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(exportOpen ? .isSelected : [])
            .accessibilityHint(exportOpen ? "Collapse" : "Expand")

            if exportOpen {
                ScrollView {
                    Text(markdown)
                        .font(.system(size: 13))
                        .lineSpacing(4)
                        .foregroundStyle(Color.fg2)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
                .frame(maxHeight: 360)
                .fixedSize(horizontal: false, vertical: true)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                HStack(spacing: 6) {
                    ShareLink(
                        item: MarkdownFile(name: screen.fileName, text: markdown),
                        preview: SharePreview(screen.fileName, image: Image(systemName: "doc.text"))
                    ) {
                        Text("Save to Obsidian")
                    }
                    .buttonStyle(SessionSoftButtonStyle(fill: .surface, height: 48))

                    Button("Copy text") {
                        UIPasteboard.general.string = markdown
                        model.show("Copied to clipboard")
                    }
                    .buttonStyle(SessionSoftButtonStyle(fill: .surface, height: 48))
                }

                if !live {
                    Button("Delete session") { confirmDelete = true }
                        .buttonStyle(SessionSoftButtonStyle(fill: .surface, foreground: .danger, height: 48))
                        .padding(.top, 2)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 22)
    }

    // MARK: Bottom bar

    private var bottomBar: some View {
        VStack(spacing: 8) {
            if done {
                Button("Back to Today", action: backToToday)
                    .buttonStyle(PrimaryButtonStyle(tint: .surface2, foreground: .fg))
            } else {
                Button { Task { await complete(send: true) } } label: {
                    Label(sent ? "Send again with these notes" : "Send to PT", systemImage: "paperplane.fill")
                }
                .buttonStyle(PrimaryButtonStyle(tint: kind.k, foreground: kind.on))
                .disabled(leaving)
                .opacity(leaving ? 0.6 : 1)
            }
            if live {
                Button("Finish without sending") { Task { await complete(send: false) } }
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.fg2)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .disabled(leaving)
                    .opacity(leaving ? 0.5 : 1)
            } else if sent {
                Button("Send again with these notes") { Task { await complete(send: true) } }
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.fg2)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .disabled(leaving)
            }
            if !live && !sent {
                Button("Back to Today", action: backToToday)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.fg2)
                    .frame(maxWidth: .infinity, minHeight: 48)
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 24)
        .padding(.bottom, 8)
        .background(
            LinearGradient(stops: [.init(color: Color.bg.opacity(0), location: 0), .init(color: Color.bg, location: 0.35)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
    }

    // MARK: Actions

    /// Autosave as you type (debounced 700 ms), through the offline outbox.
    private func autosave() async {
        guard notes != savedNotes else { return }
        try? await Task.sleep(for: .milliseconds(700))
        if Task.isCancelled { return }
        let value = notes
        savedNotes = value
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let id = screen.sessionId
        // Unstructured so a later keystroke can't cancel a save already in flight.
        Task { await model.mutate(.saveNotes(sessionId: id, notes: trimmed.isEmpty ? nil : trimmed)) }
    }

    /// Optimistic: leave straight away; the outbox delivers it.
    private func complete(send: Bool) async {
        Haptics.tick()
        leaving = true
        if send { sent = true }
        let id = screen.sessionId
        let wasSent = screen.sentAt != nil
        let op: OutboxOp = send ? .sendToPT(sessionId: id, notes: notesOrNil) : .finish(sessionId: id, notes: notesOrNil)
        let res = await model.mutate(op, rollback: {
            leaving = false
            if send { sent = wasSent }
        })
        if case .rejected = res { return }
        RestTimer.clear(id)
        savedNotes = notes
        if case .ok = res { model.show(send ? "Sent to your PT" : "Session finished") }
        router.tab = .today
        dismiss()
        model.dataChanged()
    }

    private func backToToday() {
        router.tab = .today
        dismiss()
    }

    private func deleteSession() async {
        do {
            try await model.api.delete("sessions/\(screen.sessionId)")
            RestTimer.clear(screen.sessionId)
            model.show("Session deleted")
            dismiss()
            model.dataChanged()
        } catch {
            if let e = error as? APIError, e.status != 0 {
                model.show(e.message, kind: .error)
            } else {
                model.show("Couldn't delete. Check your connection.", kind: .error)
            }
        }
    }

    // MARK: Formatting

    /// "41:07" under an hour, "1:01 h" after.
    static func formatDuration(_ sec: Double) -> (value: String, unit: String?) {
        let s = max(0, Int(sec.rounded(.down)))
        if s < 3600 { return (String(format: "%d:%02d", s / 60, s % 60), nil) }
        return (String(format: "%d:%02d", s / 3600, (s % 3600) / 60), "h")
    }

    static func summaryLine(_ catches: [SessionCatch]) -> String {
        let prs = catches.filter { $0.kind == "pr" }.count
        let other = catches.count - prs
        func n(_ k: Int, _ one: String, _ many: String) -> String? { k == 0 ? nil : k == 1 ? one : "\(k) \(many)" }
        let parts = [n(prs, "One PR", "PRs"), n(other, "one thing for your PT to look at", "things for your PT to look at")].compactMap { $0 }
        if parts.isEmpty { return "Clean session. Nothing flagged." }
        let s = parts.joined(separator: ", ")
        return s.prefix(1).uppercased() + s.dropFirst() + "."
    }
}

/// The Lift Log entry as a .md file, written to a temp file only when shared.
struct MarkdownFile: Transferable {
    let name: String
    let text: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: UTType("net.daringfireball.markdown") ?? .plainText) { file in
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(file.name)
            try file.text.write(to: url, atomically: true, encoding: .utf8)
            return SentTransferredFile(url)
        }
    }
}

/// Springy scale-in ("animate-pop-in").
private struct PopIn: ViewModifier {
    let delay: Double
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .scaleEffect(shown || reduceMotion ? 1 : 0.4)
            .opacity(shown || reduceMotion ? 1 : 0)
            .onAppear {
                withAnimation(.spring(duration: 0.45, bounce: 0.45).delay(delay)) { shown = true }
            }
    }
}

/// A short burst of little plates falling once through the hero (confetti.tsx).
struct SessionConfetti: View {
    let k3: Color
    @State private var fallen = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            let colors: [Color] = [.white, .apricot, .berry, k3]
            ForEach(0..<18, id: \.self) { i in
                let size = CGFloat(8 + ((i * 7) % 5) * 5)
                let dx = CGFloat((i % 2 == 1 ? 1 : -1) * (10 + (i % 3) * 12))
                Circle()
                    .fill(colors[i % colors.count])
                    .overlay(Circle().strokeBorder(.black.opacity(0.12), lineWidth: (size / 4).rounded()))
                    .frame(width: size, height: size)
                    .rotationEffect(.degrees(fallen ? 540 : 0))
                    .position(
                        x: geo.size.width * CGFloat((i * 53) % 100) / 100 + (fallen ? dx : 0),
                        y: fallen ? 900 : -60
                    )
                    .animation(
                        .timingCurve(0.3, 0.1, 0.6, 1, duration: 4.5).delay(Double((i * 13) % 160) / 100),
                        value: fallen
                    )
            }
        }
        .accessibilityHidden(true)
        .onAppear { if !reduceMotion { fallen = true } }
    }
}
