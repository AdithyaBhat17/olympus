import OlympusCore
import SwiftUI

/// Oly, the Olympus mountain: the app's mascot. A port of
/// src/components/ui/oly.tsx (which documents the poses), drawn in the same
/// 400 x 420 space so the two stay in step. The web's `chalk` tone, for the
/// coloured session blocks, isn't needed here yet.
enum OlyPose { case lift, cheer, rest }

struct Oly: View {
    var pose: OlyPose = .lift
    var width: CGFloat = 200
    /// A gentle rep: a few lifts, then it settles (no idle battery drain).
    var bob = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var up = false

    var body: some View {
        Canvas { context, size in
            var ctx = context
            let s = size.width / 400
            ctx.scaleBy(x: s, y: s)
            OlyArt(pose: pose).draw(&ctx)
        }
        .frame(width: width, height: width * 420 / 400)
        .offset(y: up ? -10 : 0)
        .accessibilityHidden(true)
        .onAppear {
            guard bob, !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.2).repeatCount(6, autoreverses: true)) { up = true }
        }
    }
}

private struct OlyArt {
    let pose: OlyPose

    private let body = Color.coral
    private let limb = Color.coralDeep
    private let snow = Color.surface3 // darker than the cream page, so the cap still reads on it
    private let plateBig = Color.berry
    private let plateSmall = Color.apricot
    private let ink = Color.fg
    private let mouth = Color.apricotInk
    private let tongue = KindColors(.coral).k3

    private func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat) -> Path { ellipse(cx, cy, r, r) }

    private func ellipse(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2))
    }

    private func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> Path {
        Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: r, style: .continuous)
    }

    private func quad(_ from: CGPoint, _ control: CGPoint, _ to: CGPoint) -> Path {
        var p = Path()
        p.move(to: from)
        p.addQuadCurve(to: to, control: control)
        return p
    }

    private var mountain: Path {
        var p = Path()
        p.move(to: CGPoint(x: 64, y: 396))
        p.addQuadCurve(to: CGPoint(x: 34, y: 354), control: CGPoint(x: 22, y: 396))
        p.addCurve(to: CGPoint(x: 154, y: 152), control1: CGPoint(x: 54, y: 290), control2: CGPoint(x: 96, y: 214))
        p.addQuadCurve(to: CGPoint(x: 246, y: 152), control: CGPoint(x: 200, y: 98))
        p.addCurve(to: CGPoint(x: 366, y: 354), control1: CGPoint(x: 304, y: 214), control2: CGPoint(x: 346, y: 290))
        p.addQuadCurve(to: CGPoint(x: 336, y: 396), control: CGPoint(x: 378, y: 396))
        p.closeSubpath()
        return p
    }

    private var snowcap: Path {
        var p = Path()
        p.addLines([
            CGPoint(x: 60, y: 100), CGPoint(x: 340, y: 100), CGPoint(x: 340, y: 196),
            CGPoint(x: 300, y: 210), CGPoint(x: 274, y: 184), CGPoint(x: 250, y: 214),
            CGPoint(x: 226, y: 186), CGPoint(x: 200, y: 216), CGPoint(x: 176, y: 188),
            CGPoint(x: 150, y: 212), CGPoint(x: 126, y: 190), CGPoint(x: 60, y: 200),
        ])
        p.closeSubpath()
        return p
    }

    func draw(_ ctx: inout GraphicsContext) {
        let limbStyle = StrokeStyle(lineWidth: 24, lineCap: .round)
        let stroke8 = StrokeStyle(lineWidth: 8, lineCap: .round, lineJoin: .round)

        ctx.fill(ellipse(200, 404, 130, 9), with: .color(ink.opacity(0.12)))

        switch pose {
        case .lift:
            ctx.stroke(quad(CGPoint(x: 122, y: 266), CGPoint(x: 92, y: 168), CGPoint(x: 140, y: 84)), with: .color(limb), style: limbStyle)
            ctx.stroke(quad(CGPoint(x: 278, y: 266), CGPoint(x: 308, y: 168), CGPoint(x: 260, y: 84)), with: .color(limb), style: limbStyle)
            ctx.fill(rect(50, 62, 300, 18, 9), with: .color(ink))
            ctx.fill(rect(66, 14, 26, 114, 12), with: .color(plateBig))
            ctx.fill(rect(96, 30, 18, 82, 9), with: .color(plateSmall))
            ctx.fill(rect(308, 14, 26, 114, 12), with: .color(plateBig))
            ctx.fill(rect(286, 30, 18, 82, 9), with: .color(plateSmall))
            ctx.fill(circle(140, 72, 17), with: .color(limb))
            ctx.fill(circle(260, 72, 17), with: .color(limb))
        case .cheer:
            ctx.stroke(quad(CGPoint(x: 112, y: 300), CGPoint(x: 44, y: 270), CGPoint(x: 52, y: 188)), with: .color(limb), style: limbStyle)
            ctx.stroke(quad(CGPoint(x: 288, y: 300), CGPoint(x: 356, y: 270), CGPoint(x: 348, y: 188)), with: .color(limb), style: limbStyle)
            ctx.fill(circle(52, 176, 20), with: .color(limb))
            ctx.fill(circle(348, 176, 20), with: .color(limb))
            ctx.fill(circle(104, 70, 9), with: .color(plateSmall))
            ctx.fill(circle(302, 52, 11), with: .color(plateBig))
            ctx.fill(circle(58, 104, 7), with: .color(plateBig))
            ctx.fill(circle(352, 110, 8), with: .color(plateSmall))
            var confetti = ctx
            confetti.translateBy(x: 204, y: 30)
            confetti.rotate(by: .degrees(25))
            confetti.fill(rect(-8, -8, 16, 16, 5), with: .color(plateSmall))
        case .rest:
            break
        }

        ctx.fill(mountain, with: .color(body))
        ctx.drawLayer { layer in
            layer.clip(to: mountain)
            layer.fill(snowcap, with: .color(snow))
        }

        if pose == .rest {
            ctx.stroke(quad(CGPoint(x: 150, y: 268), CGPoint(x: 164, y: 282), CGPoint(x: 178, y: 268)), with: .color(ink), style: stroke8)
            ctx.stroke(quad(CGPoint(x: 222, y: 268), CGPoint(x: 236, y: 282), CGPoint(x: 250, y: 268)), with: .color(ink), style: stroke8)
        } else {
            ctx.fill(ellipse(164, 270, 14, 19), with: .color(ink))
            ctx.fill(ellipse(236, 270, 14, 19), with: .color(ink))
            ctx.fill(circle(169, 263, 5), with: .color(.bg))
            ctx.fill(circle(241, 263, 5), with: .color(.bg))
        }

        ctx.fill(circle(130, 304, 17), with: .color(Color.apricot.opacity(0.85)))
        ctx.fill(circle(270, 304, 17), with: .color(Color.apricot.opacity(0.85)))

        if pose == .rest {
            ctx.stroke(quad(CGPoint(x: 186, y: 306), CGPoint(x: 200, y: 318), CGPoint(x: 214, y: 306)), with: .color(ink), style: stroke8)
            for (x, y, size) in [(290.0, 92.0, 44.0), (326.0, 58.0, 32.0), (352.0, 32.0, 22.0)] {
                let z = Text("z").font(.system(size: size, weight: .heavy, design: .rounded)).foregroundColor(limb)
                ctx.draw(z, at: CGPoint(x: x, y: y), anchor: .bottomLeading)
            }
        } else {
            var m = Path()
            m.move(to: CGPoint(x: 176, y: 298))
            m.addQuadCurve(to: CGPoint(x: 224, y: 298), control: CGPoint(x: 200, y: 340))
            m.closeSubpath()
            ctx.fill(m, with: .color(mouth))
            ctx.stroke(m, with: .color(mouth), style: stroke8)
            var t = Path()
            t.move(to: CGPoint(x: 188, y: 318))
            t.addQuadCurve(to: CGPoint(x: 212, y: 318), control: CGPoint(x: 200, y: 310))
            t.addQuadCurve(to: CGPoint(x: 188, y: 318), control: CGPoint(x: 200, y: 330))
            ctx.fill(t, with: .color(tongue))
        }
    }
}

#Preview {
    HStack(spacing: 12) {
        ForEach([OlyPose.lift, .cheer, .rest], id: \.self) { pose in
            Oly(pose: pose, width: 110).background(Color.surface, in: RoundedRectangle(cornerRadius: 24))
        }
    }
    .padding()
    .background(Color.bg)
}
