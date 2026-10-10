import OlympusCore
import SwiftUI

/// The colour block at the top of Today (src/components/today/next-session-card.tsx):
/// rotation pills, the planned session's preview, and Let's go / Back to it.
struct TodayNextSessionCard: View {
    @Environment(AppModel.self) private var model
    @Environment(Router.self) private var router
    let data: NextSession

    @State private var pick: String
    /// Optimistic "Opening your session" the instant Let's go is tapped.
    @State private var opening = false
    @State private var warningsOpen = false

    init(data: NextSession) {
        self.data = data
        _pick = State(initialValue: data.live?.type ?? data.plannedType)
    }

    private var onPlan: Bool { pick == data.plannedType }
    private var selected: NextSession.RotationPill? {
        data.sessions.first { $0.type == pick } ?? data.sessions.first
    }
    private var colors: KindColors { KindColors(type: pick) }
    private var showItems: Bool { onPlan && !data.items.isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            topRow
            titleBlock
            if !onPlan { swapNote }
            if onPlan, !data.warnings.isEmpty { warnings }
            if showItems { preview }
            cta
            if data.live == nil, selected?.lastDone == nil, !(onPlan && data.planId != nil) {
                Button {
                    router.tab = .log
                } label: {
                    Text("Log a past session manually")
                        .font(.system(size: 15, weight: .semibold))
                        .padding(.horizontal, 16)
                        .frame(minHeight: 44)
                        .background(.white.opacity(0.2), in: Capsule())
                }
                .padding(.top, -8)
            }
        }
        .foregroundStyle(colors.on)
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack(alignment: .topTrailing) {
                colors.k
                TodayPlateDecoration(color: colors.on)
                    .frame(width: 200, height: 200)
                    .offset(x: 56, y: 96)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 36, style: .continuous))
        .animation(.easeInOut(duration: 0.5), value: pick)
        .onChange(of: data.plannedType) { pick = data.live?.type ?? data.plannedType }
        .onChange(of: data.live?.id) {
            pick = data.live?.type ?? data.plannedType
            opening = false
        }
        .onChange(of: router.session) { _, now in
            if now == nil { opening = false }
        }
    }

    // MARK: Parts

    private var topRow: some View {
        HStack(alignment: .center, spacing: 12) {
            if onPlan {
                if let at = data.fromPtAt {
                    HStack(spacing: 8) {
                        TodayLiveDot(color: .white)
                        (Text("From your PT, \(at)")
                            + Text(data.dayLabel.map { ", \($0)" } ?? "").foregroundStyle(colors.on.opacity(0.7)))
                    }
                    .font(.system(size: 13, weight: .bold))
                    .padding(.leading, 10)
                    .padding(.trailing, 12)
                    .frame(height: 32)
                    .background(.white.opacity(0.2), in: Capsule())
                    .lineLimit(1)
                } else {
                    Text(data.live != nil ? "In progress" : "Up next")
                        .font(.system(size: 17, weight: .semibold))
                        .opacity(0.9)
                }
            } else {
                Button {
                    pick = data.plannedType
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.system(size: 12, weight: .heavy))
                        Text(data.hasPtPlan ? "Back to PT plan" : "Back to \(data.plannedType)")
                    }
                    .font(.system(size: 13, weight: .bold))
                    .padding(.horizontal, 14)
                    .frame(height: 36)
                    .background(.white.opacity(0.2), in: Capsule())
                }
            }
            Spacer(minLength: 0)
            rotation
        }
    }

    private var rotation: some View {
        HStack(spacing: 3) {
            ForEach(data.sessions, id: \.type) { s in
                let on = s.type == pick
                let isLast = s.type == data.lastType
                let isPlan = s.type == data.plannedType
                Button {
                    Haptics.tick()
                    pick = s.type
                } label: {
                    ZStack(alignment: .bottom) {
                        Text(s.type)
                            .font(.num(18))
                            .frame(width: 44, height: 44)
                            .foregroundStyle(on ? colors.text : colors.on)
                            .background(on ? Color.white : Color.white.opacity(0.2), in: Circle())
                            .overlay {
                                if !on, isPlan {
                                    Circle().strokeBorder(.white.opacity(0.7), lineWidth: 2)
                                }
                            }
                        if isLast {
                            Circle()
                                .fill(on ? colors.k : .white)
                                .frame(width: 4, height: 4)
                                .padding(.bottom, 5)
                        }
                    }
                    .opacity(!on && isLast ? 0.7 : 1)
                }
                .buttonStyle(.plain)
                .disabled(data.live != nil && !on)
                .opacity(data.live != nil && !on ? 0.4 : 1)
                .accessibilityLabel(pillLabel(s.type, isPlan: isPlan, isLast: isLast))
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Rotation")
    }

    private func pillLabel(_ type: String, isPlan: Bool, isLast: Bool) -> String {
        var s = "Session \(type)"
        if isPlan { s += data.hasPtPlan ? ", planned by your PT" : ", next up" }
        if isLast { s += ", done last" }
        return s
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Session \(pick)")
                .font(.system(size: 52, weight: .heavy))
                .tracking(-0.5)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .id("title-\(pick)")
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .accessibilityAddTraits(.isHeader)
            if let sub = selected?.sub {
                Text(sub)
                    .font(.system(size: 17))
                    .lineSpacing(2)
                    .opacity(0.9)
                    .frame(maxWidth: 230, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var swapNote: some View {
        let lead: Text = data.hasPtPlan
            ? Text("Your PT planned ") + Text(data.plannedType).fontWeight(.heavy) + Text(" for today. ")
            : Text(data.plannedType).fontWeight(.heavy) + Text(" is next in the rotation. ")
        let tail: String = selected?.lastDone.map {
            "Starting \(pick) repeats your last Session \(pick) (\($0)), and your PT sees the swap."
        } ?? "There's no Session \(pick) to repeat yet."
        return (lead + Text(tail))
            .font(.system(size: 15))
            .lineSpacing(2)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .id("note-\(pick)")
            .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var warnings: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { warningsOpen.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .bold))
                        .rotationEffect(.degrees(warningsOpen ? 90 : 0))
                    Text("\(data.warnings.count) note\(data.warnings.count == 1 ? "" : "s") from validation")
                        .font(.system(size: 15, weight: .semibold))
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(warningsOpen ? .isSelected : [])
            if warningsOpen {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(data.warnings.enumerated()), id: \.offset) { _, w in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("•")
                            Text(w).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .font(.system(size: 15))
                .opacity(0.9)
                .padding(.leading, 8)
                .padding(.bottom, 12)
            }
        }
        .padding(.horizontal, 16)
        .background(.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.top, -4)
    }

    private var preview: some View {
        VStack(spacing: 0) {
            ForEach(Array(data.items.enumerated()), id: \.element.key) { i, it in
                HStack(spacing: 12) {
                    Text("\(i + 1)")
                        .font(.num(15))
                        .opacity(0.7)
                        .frame(width: 18, alignment: .leading)
                    HStack(spacing: 6) {
                        Text(it.name).font(.system(size: 17, weight: .semibold))
                        if it.straps {
                            Text("straps")
                                .font(.system(size: 12, weight: .bold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .overlay(Capsule().strokeBorder(.white.opacity(0.5), lineWidth: 1))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if let load = it.load {
                        (Text(load).font(.num(20))
                            + Text(it.unit.map { " \($0)" } ?? "").font(.system(size: 13, weight: .semibold)).foregroundStyle(colors.on.opacity(0.75)))
                    }
                    if let up = it.up {
                        Text(up)
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundStyle(colors.text)
                            .padding(.horizontal, 10)
                            .frame(height: 28)
                            .background(.white, in: Capsule())
                    } else {
                        Color.clear.frame(width: 38, height: 1)
                    }
                }
                .padding(.vertical, 11)
                .overlay(alignment: .top) { Rectangle().fill(.white.opacity(0.2)).frame(height: 1) }
            }
            if !data.more.isEmpty {
                HStack(spacing: 12) {
                    Color.clear.frame(width: 18, height: 1)
                    Text("+ \(data.more.count) more, \(data.more.joined(separator: ", "))")
                        .font(.system(size: 15))
                        .lineLimit(1)
                        .opacity(0.8)
                    Spacer(minLength: 0)
                }
                .padding(.top, 11)
                .overlay(alignment: .top) { Rectangle().fill(.white.opacity(0.2)).frame(height: 1) }
            }
        }
    }

    @ViewBuilder private var cta: some View {
        if let live = data.live {
            Button {
                Haptics.tick()
                router.session = .init(id: live.id)
            } label: {
                TodayLiveLabel(startedAt: Dates.instant(live.startedAt), opening: false, k: colors.k)
            }
            .buttonStyle(TodayOnKButtonStyle(text: colors.text, fullWidth: true))
        } else if opening {
            TodayLiveLabel(startedAt: nil, opening: true, k: colors.k)
                .modifier(TodayOnKLabel(text: colors.text, fullWidth: true))
        } else {
            Button(action: start) {
                HStack(spacing: 10) {
                    Image(systemName: "play.fill").font(.system(size: 16))
                    Text("Let's go")
                }
            }
            .buttonStyle(TodayOnKButtonStyle(text: colors.text, fullWidth: false))
        }
    }

    // MARK: Start

    private struct StartBody: Encodable {
        var planId: String?
        var type: String?
    }

    private struct Started: Decodable { let id: String }

    private func start() {
        Haptics.tick()
        withAnimation(.spring(duration: 0.3)) { opening = true }
        let body = onPlan && data.planId != nil ? StartBody(planId: data.planId) : StartBody(type: pick)
        Task {
            do {
                let res = try await model.api.post("sessions", body, as: Started.self)
                router.session = .init(id: res.id)
            } catch {
                opening = false
                model.show(error)
            }
        }
    }
}

// MARK: - Pieces

/// "Back to it, 12:04 in" with a pulsing dot, ticking every second.
private struct TodayLiveLabel: View {
    let startedAt: Date?
    let opening: Bool
    let k: Color

    var body: some View {
        HStack(spacing: 10) {
            TodayLiveDot(color: k, size: 10)
            if opening {
                Text("Opening your session")
            } else if let startedAt {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    Text("Back to it, \(Self.elapsed(from: startedAt, to: ctx.date)) in")
                        .monospacedDigit()
                }
            } else {
                Text("Back to it")
            }
        }
    }

    /// clock() without the leading zero: "5:12", "1:02:44".
    static func elapsed(from: Date, to: Date) -> String {
        let s = clock(to.timeIntervalSince(from))
        if s.count > 1, s.hasPrefix("0"), s.dropFirst().first?.isNumber == true { return String(s.dropFirst()) }
        return s
    }
}

struct TodayLiveDot: View {
    let color: Color
    var size: CGFloat = 8
    @State private var dim = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .opacity(dim ? 0.35 : 1)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: dim)
            .onAppear { dim = true }
            .accessibilityHidden(true)
    }
}

/// White capsule CTA on a colour block (.btn-on-k).
private struct TodayOnKLabel: ViewModifier {
    let text: Color
    let fullWidth: Bool
    func body(content: Content) -> some View {
        content
            .font(.system(size: 19, weight: .heavy))
            .padding(.horizontal, 32)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 60)
            .background(.white, in: Capsule())
            .foregroundStyle(text)
            .shadow(color: .black.opacity(0.18), radius: 10, y: 8)
    }
}

private struct TodayOnKButtonStyle: ButtonStyle {
    let text: Color
    let fullWidth: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .modifier(TodayOnKLabel(text: text, fullWidth: fullWidth))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

/// The stacked plates drawn behind the card's content (PlateStack), simplified.
private struct TodayPlateDecoration: View {
    let color: Color
    var body: some View {
        ZStack {
            Circle().strokeBorder(color.opacity(0.10), lineWidth: 26)
            Circle().strokeBorder(color.opacity(0.08), lineWidth: 14).padding(40)
            Circle().fill(color.opacity(0.10)).padding(84)
        }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
}
